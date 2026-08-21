import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { civilDateInZone } from "@/domain/storage/clock-display";
import {
  readIntakeGate,
  type IntakeGateView,
} from "@/features/consent/read-intake-gate";
import type {
  Jurisdiction,
  JurisdictionRule,
  RuleVersion,
} from "@/types/rules-as-data";
import type { Organization, TosAcceptance } from "@/types/tenancy";
import type { IsoDate, IsoTimestamp, Uuid } from "@/types/common";
import {
  emergencyVerification,
  type EmergencyVerification,
} from "./emergency-verification";
import { organizationSites, type OrganizationSite } from "./sites";

/**
 * Everything `/settings/organization` renders, read once through `src/data`.
 *
 * **Nothing reaches past `src/data`** (D-16) and every call takes the
 * `RequestContext` the guard resolved. The page composes; this module reads.
 *
 * Two shapes of read live here and they are different on purpose:
 *
 * - `organization`, `container`, `tos_acceptance` and `user` are the tenant's
 *   own rows, scoped by the adapter.
 * - `jurisdiction`, `jurisdiction_rule` and `rule_version` are **platform**
 *   tables — reference data every organization reads and none writes. They are
 *   read per site, walking the jurisdiction chain, because *"the chain is
 *   walked, never enumerated"* (`TECHNICAL_SPEC.md` §6.2).
 */

/** Bounded reads. Well beyond anything an organization holds in B1a. */
const CONTAINER_SCAN_LIMIT = 100;
const CONSENT_ROW_LIMIT = 20;
const RULES_PER_JURISDICTION_LIMIT = 50;
const VERSIONS_PER_RULE_LIMIT = 5;

export interface EmergencyContactView extends EmergencyVerification {
  readonly phone: string | null;
  readonly contractRef: string | null;
  /** Rule 5.6 wants a person. Null where none is recorded, or the row will not resolve. */
  readonly verifiedByName: string | null;
}

export interface SiteRuleRow {
  readonly rule: JurisdictionRule;
  /** Which link in the chain supplied it — the rule's **source**, shown per row. */
  readonly jurisdiction: Jurisdiction;
  /**
   * The published version in force on `asOfDate`, or `null`.
   *
   * **`isPublished: true` is what keeps a draft out** (T-42). A draft closes no
   * precondition and must never appear beside a rule a document was produced
   * under.
   */
  readonly version: RuleVersion | null;
}

export interface SiteJurisdictionProfile {
  readonly site: OrganizationSite;
  /** Most specific first — `US-WA` then `US`. Empty where the site has no profile (E-13). */
  readonly chain: readonly Jurisdiction[];
  readonly rules: readonly SiteRuleRow[];
  /** The calendar day the versions were resolved against, in the **site's** zone (Rule 4.29). */
  readonly asOfDate: IsoDate;
}

export interface ConsentRow {
  readonly acceptance: TosAcceptance;
  /** Who accepted, resolved from the row's own `userId`. Null while `not_accepted`. */
  readonly acceptedByName: string | null;
}

export interface OrganizationSettingsView {
  readonly organization: Organization;
  readonly emergencyContact: EmergencyContactView;
  readonly profiles: readonly SiteJurisdictionProfile[];
  readonly consent: readonly ConsentRow[];
  readonly gate: IntakeGateView;
  readonly asOf: IsoTimestamp;
}

async function userName(
  ctx: RequestContext,
  userId: Uuid | null,
): Promise<string | null> {
  if (userId === null) return null;
  const user = await data.users.get(ctx, userId);
  return user?.fullName ?? user?.email ?? null;
}

/**
 * The rule rows for one jurisdiction chain, most specific link first.
 *
 * A jurisdiction read once is not read again: two sites in the same state share
 * the same reference data, and reading it twice would be two chances to render
 * two different answers.
 */
async function rulesForChain(
  ctx: RequestContext,
  chain: readonly Jurisdiction[],
  asOfDate: IsoDate,
  cache: Map<string, readonly SiteRuleRow[]>,
): Promise<readonly SiteRuleRow[]> {
  const rows: SiteRuleRow[] = [];

  for (const jurisdiction of chain) {
    const cacheKey = `${jurisdiction.id}@${asOfDate}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      rows.push(...cached);
      continue;
    }

    const rules = await data.jurisdictionRules.list(ctx, {
      jurisdictionId: jurisdiction.id,
      isActive: true,
      limit: RULES_PER_JURISDICTION_LIMIT,
    });

    const forJurisdiction: SiteRuleRow[] = [];
    for (const rule of rules.items) {
      const versions = await data.ruleVersions.list(ctx, {
        jurisdictionRuleId: rule.id,
        isPublished: true,
        inForceOn: asOfDate,
        limit: VERSIONS_PER_RULE_LIMIT,
      });
      forJurisdiction.push({
        rule,
        jurisdiction,
        version: versions.items[0] ?? null,
      });
    }

    cache.set(cacheKey, forJurisdiction);
    rows.push(...forJurisdiction);
  }

  return rows;
}

/**
 * Read the organization settings surface for the active organization.
 *
 * `asOf` is an argument with a default rather than a clock read inside the
 * composition, so a test can pin the instant that decides whether a verification
 * still stands and which rule version is in force.
 */
export async function readOrganizationSettings(
  ctx: RequestContext,
  asOf: IsoTimestamp = new Date().toISOString(),
): Promise<OrganizationSettingsView> {
  const organization = await data.organizations.get(ctx, ctx.organizationId);
  if (organization === null) {
    // Not `notFound()`. The id came from the resolved session, not from a URL,
    // so a missing row is a data defect and must be loud rather than rendered as
    // an absent page (`src/lib/errors.ts` — nothing is swallowed).
    throw new Error(
      `The active organization has no row (correlationId=${ctx.correlationId}).`,
    );
  }

  const containers = await data.containers.list(ctx, {
    limit: CONTAINER_SCAN_LIMIT,
  });
  const sites = organizationSites(organization, containers.items);

  const chainCache = new Map<Uuid, readonly Jurisdiction[]>();
  const ruleCache = new Map<string, readonly SiteRuleRow[]>();
  const profiles: SiteJurisdictionProfile[] = [];

  for (const site of sites) {
    const asOfDate = civilDateInZone(asOf, site.timeZone);

    if (site.jurisdictionId === null) {
      // E-13. **No fallback jurisdiction and no default threshold** (Rule 3.10):
      // the profile is empty and the screen says so.
      profiles.push({ site, chain: [], rules: [], asOfDate });
      continue;
    }

    const cachedChain = chainCache.get(site.jurisdictionId);
    const chain =
      cachedChain ??
      (await data.jurisdictions.chainFrom(ctx, site.jurisdictionId));
    chainCache.set(site.jurisdictionId, chain);

    profiles.push({
      site,
      chain,
      rules: await rulesForChain(ctx, chain, asOfDate, ruleCache),
      asOfDate,
    });
  }

  const consentPage = await data.tosAcceptances.list(ctx, {
    documentKey: "terms_of_service",
    limit: CONSENT_ROW_LIMIT,
  });
  const consent: ConsentRow[] = [];
  for (const acceptance of consentPage.items) {
    consent.push({
      acceptance,
      acceptedByName: await userName(ctx, acceptance.userId),
    });
  }

  const verification = emergencyVerification(
    {
      phone: organization.emergencyResponsePhone,
      verifiedAt: organization.emergencyVerifiedAt,
      verifiedBy: organization.emergencyVerifiedBy,
      reverificationIntervalMonths:
        organization.emergencyReverificationIntervalMonths,
    },
    asOf,
  );

  return {
    organization,
    emergencyContact: {
      ...verification,
      phone: organization.emergencyResponsePhone,
      contractRef: organization.emergencyResponseContractRef,
      verifiedByName: await userName(ctx, organization.emergencyVerifiedBy),
    },
    profiles,
    consent,
    gate: await readIntakeGate(ctx),
    asOf,
  };
}
