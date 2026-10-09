import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import type { ResolvedRule } from "@/domain/rules/resolve";
import { civilDateInZone } from "@/domain/storage/clock-display";
import {
  BASIC_DESCRIPTION_RULE_KEY,
  PACKAGING_EXCEPTION_RULE_KEY,
  SHIPMENT_RETENTION_RULE_KEY,
  SHIPPER_CERTIFICATION_RULE_KEY,
  SHIPPING_PAPER_RULE_KEYS,
} from "@/domain/transport/rule-data";
import {
  buildShippingPaperPayload,
  type ShippingPaperBuild,
  type ShippingPaperRuleInput,
} from "@/domain/transport/shipping-paper";
import { organizationSites } from "@/features/settings/sites";
import { DataIntegrityError } from "@/lib/errors";
import type { IsoTimestamp, TimeZone } from "@/types/common";
import type { Shipment } from "@/types/documents";
import type { Container } from "@/types/storage";
import type { Organization } from "@/types/tenancy";

import {
  paperRecordInput,
  readContainerScope,
  type ScopeContainer,
} from "./scope";

/**
 * The shipping paper's build, read from the rows — **the one read step 3's
 * checklist, the draft preview and Generate all call** (`UX_SPEC.md` §3.12;
 * `TECHNICAL_SPEC.md` §11.2).
 *
 * The rows come through `src/data`; the rule versions are resolved for the
 * site's jurisdiction at the instant passed in; the build is
 * `buildShippingPaperPayload`'s. Generate calls this again at commit, server
 * side, and hands the adapter the complete outcome — so **what the checklist
 * said is complete is exactly what the paper stores**, and a client cannot
 * send a paper of its own.
 */

const CONTAINER_LIMIT = 200;

export interface TransportRules {
  readonly paper: ShippingPaperRuleInput;
  /** Rule 5.18 — read at departure. */
  readonly retention: ResolvedRule | null;
  /** The site's zone — every date on the shipment is read in it (Rule 4.29). */
  readonly timeZone: TimeZone;
}

export interface ShippingPaperRead {
  readonly shipment: Shipment;
  readonly organization: Organization;
  readonly scope: readonly ScopeContainer[];
  readonly rules: TransportRules;
  readonly build: ShippingPaperBuild;
}

export async function activeOrganization(
  ctx: RequestContext,
): Promise<Organization> {
  const organization = await data.organizations.get(ctx, ctx.organizationId);
  if (organization === null) {
    throw new DataIntegrityError({
      userMessage: "Your organization could not be read. Nothing was changed.",
      correlationId: ctx.correlationId,
    });
  }
  return organization;
}

/**
 * The transport rules in force at the shipment's site on `at`'s calendar day,
 * in the site's zone (Rules 3.5, 4.29, 12.20). **No fallback**: a key with no
 * version in force is null, and the checklist names it (Rule 3.10).
 */
export async function resolveTransportRules(
  ctx: RequestContext,
  organization: Organization,
  containers: readonly Container[],
  at: IsoTimestamp,
): Promise<TransportRules> {
  const [site] = organizationSites(organization, containers).filter(
    (candidate) => candidate.containerCount > 0,
  );
  const timeZone =
    containers[0]?.siteTimeZone ?? site?.timeZone ?? organization.timeZone;
  const jurisdictionId =
    site?.jurisdictionId ?? organization.primaryJurisdictionId;
  if (jurisdictionId === null) {
    return {
      paper: {
        basicDescription: null,
        shipperCertification: null,
        packagingException: null,
      },
      retention: null,
      timeZone,
    };
  }
  const resolution = await data.ruleVersions.resolve(ctx, {
    ruleKeys: [...SHIPPING_PAPER_RULE_KEYS, SHIPMENT_RETENTION_RULE_KEY],
    jurisdictionId,
    asOf: civilDateInZone(at, timeZone),
  });
  const rules = resolution.ok
    ? resolution.resolved.rules
    : resolution.partial.rules;
  return {
    paper: {
      basicDescription: rules[BASIC_DESCRIPTION_RULE_KEY] ?? null,
      shipperCertification: rules[SHIPPER_CERTIFICATION_RULE_KEY] ?? null,
      packagingException: rules[PACKAGING_EXCEPTION_RULE_KEY] ?? null,
    },
    retention: rules[SHIPMENT_RETENTION_RULE_KEY] ?? null,
    timeZone,
  };
}

/** The containers on a shipment, through the one membership link (`ERD.md` §11.1). */
export async function shipmentContainers(
  ctx: RequestContext,
  shipmentId: string,
): Promise<readonly Container[]> {
  const page = await data.containers.list(ctx, {
    shipmentId,
    limit: CONTAINER_LIMIT,
  });
  return [...page.items].sort((a, b) =>
    a.containerCode.localeCompare(b.containerCode),
  );
}

export async function readShippingPaperBuild(
  ctx: RequestContext,
  shipment: Shipment,
  at: IsoTimestamp,
): Promise<ShippingPaperRead> {
  const [organization, containers] = await Promise.all([
    activeOrganization(ctx),
    shipmentContainers(ctx, shipment.id),
  ]);
  const scope = await readContainerScope(ctx, containers);
  const rules = await resolveTransportRules(ctx, organization, containers, at);

  const build = buildShippingPaperPayload({
    shipment: {
      shipmentNumber: shipment.shipmentNumber,
      transportMode: shipment.transportMode,
      originAddress: shipment.originAddress,
      destinationFacilityName: shipment.destinationFacilityName,
      destinationAddress: shipment.destinationAddress,
      destinationIdentifier: shipment.destinationIdentifier,
      carrierName: shipment.carrierName,
      transporterIdentifier: shipment.transporterIdentifier,
    },
    containers: scope.map((entry) => ({
      id: entry.container.id,
      containerCode: entry.container.containerCode,
      labelFlags: entry.labelFlags,
    })),
    records: scope.flatMap((entry) =>
      entry.records.map((record) =>
        paperRecordInput(record, entry.container.containerCode),
      ),
    ),
    emergencyContact: {
      phone: organization.emergencyResponsePhone,
      contractRef: organization.emergencyResponseContractRef,
      verifiedAt: organization.emergencyVerifiedAt,
      verifiedBy: organization.emergencyVerifiedBy,
      reverificationIntervalMonths:
        organization.emergencyReverificationIntervalMonths,
    },
    rules: rules.paper,
    at,
  });

  return { shipment, organization, scope, rules, build };
}
