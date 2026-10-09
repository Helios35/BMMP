import "server-only";

import { data } from "@/data";
import type {
  IssuedContainerLabel,
  RequestContext,
  StorageWriteAttribution,
} from "@/data/contracts";
import {
  buildContainerLabelContent,
  type ContainerLabelContentBuild,
} from "@/domain/documents/build-container-label-payload";
import type { ResolvedRule } from "@/domain/rules/resolve";
import { civilDateInZone } from "@/domain/storage/clock-display";
import { CONTAINER_LABEL_RULE_KEY } from "@/domain/storage/label-rule";
import { composeContainerLabel } from "@/features/documents/server/compose";
import { organizationSites } from "@/features/settings/sites";
import { appOrigin } from "@/lib/app-url";
import {
  DataIntegrityError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { Container } from "@/types/storage";
import type { Organization } from "@/types/tenancy";

/**
 * The container label, read and issued — Rules 4.18–4.22, 5.21; `UX_SPEC.md`
 * §3.10's Label tab.
 *
 * {@link readContainerLabelBuild} is **the one read the Label tab and the
 * write both call**: what the tab says is missing is exactly what the write
 * refuses on. The label wording is resolved for the site's jurisdiction **on
 * the print date** (Rule 5.21) — today, in the site's zone — never on the
 * container's start date and never by default.
 */

const CONTENTS_LIMIT = 500;

async function organizationOf(ctx: RequestContext): Promise<Organization> {
  const organization = await data.organizations.get(ctx, ctx.organizationId);
  if (organization === null) {
    throw new DataIntegrityError({
      userMessage: "Your organization could not be read. Nothing was changed.",
      correlationId: ctx.correlationId,
    });
  }
  return organization;
}

/** The label wording in force at the container's site on the print date, or null (Rule 3.10). */
async function resolveLabelRule(
  ctx: RequestContext,
  organization: Organization,
  container: Container,
  at: IsoTimestamp,
): Promise<ResolvedRule | null> {
  const [site] = organizationSites(organization, [container]).filter(
    (candidate) => candidate.containerCount > 0,
  );
  const jurisdictionId =
    site?.jurisdictionId ?? organization.primaryJurisdictionId;
  if (jurisdictionId === null) return null;
  const resolution = await data.ruleVersions.resolve(ctx, {
    ruleKeys: [CONTAINER_LABEL_RULE_KEY],
    jurisdictionId,
    asOf: civilDateInZone(at, container.siteTimeZone),
  });
  const rules = resolution.ok
    ? resolution.resolved.rules
    : resolution.partial.rules;
  return rules[CONTAINER_LABEL_RULE_KEY] ?? null;
}

export async function readContainerLabelBuild(
  ctx: RequestContext,
  container: Container,
  at: IsoTimestamp,
): Promise<ContainerLabelContentBuild> {
  const [organization, contents] = await Promise.all([
    organizationOf(ctx),
    data.batteryRecords.list(ctx, {
      containerId: container.id,
      excludeVoided: true,
      excludeDrafts: true,
      limit: CONTENTS_LIMIT,
    }),
  ]);
  const labelRule = await resolveLabelRule(ctx, organization, container, at);
  return buildContainerLabelContent({
    container: {
      id: container.id,
      containerCode: container.containerCode,
      status: container.status,
      accumulationStartedAt: container.accumulationStartedAt,
      siteTimeZone: container.siteTimeZone,
    },
    contents: contents.items.map((record) => ({
      recordId: record.id,
      recordNumber: record.recordNumber,
      chemistry: record.chemistry,
      chemistryConfirmed: record.chemistryConfirmedBy !== null,
    })),
    labelRule,
    handlerIdentifier: organization.handlerIdentifier,
    appOrigin: appOrigin(),
  });
}

/**
 * **Generate label** — the label is built again here, at commit, from the
 * rows, and the adapter renders, stores and supersedes in one operation. An
 * incomplete build issues nothing and names every missing input.
 */
export async function generateContainerLabel(
  ctx: RequestContext,
  containerId: Uuid,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<IssuedContainerLabel> {
  const container = await data.containers.get(ctx, containerId);
  if (container === null) {
    throw new NotFoundError({
      userMessage: "That container was not found. Nothing was printed.",
      correlationId: ctx.correlationId,
      context: { containerId },
    });
  }
  const build = await readContainerLabelBuild(ctx, container, at);
  if (!build.ok) {
    throw new ValidationError({
      userMessage: `The label cannot be generated: ${build.findings.join(" ")}`,
      correlationId: ctx.correlationId,
      context: { rule: "4.18" },
    });
  }
  return data.containerLabels.issue(ctx, {
    containerId,
    label: build.outcome,
    compose: composeContainerLabel({ content: build.outcome }),
    at,
    attribution,
  });
}
