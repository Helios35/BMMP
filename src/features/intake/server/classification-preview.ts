import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  classifyWasteStream,
  WASTE_STREAM_RULE_KEY,
  type ClassificationResult,
  type UnresolvedClassificationRule,
} from "@/domain/classification/waste-stream";
import type {
  ResolvedRule,
  RuleResolutionFailureReason,
} from "@/domain/rules/resolve";
import { civilDateInZone } from "@/domain/storage/clock-display";
import { ACCUMULATION_RULE_KEY } from "@/domain/storage/placement";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";
import type { Chemistry } from "@/domain/taxonomy/chemistry";
import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import {
  organizationSites,
  type OrganizationSite,
} from "@/features/settings/sites";
import type { IsoDate, IsoTimestamp } from "@/types/common";
import type { Jurisdiction } from "@/types/rules-as-data";
import type { Container } from "@/types/storage";
import type { Organization } from "@/types/tenancy";

/**
 * The rule context an intake classifies and places under — Rules 3.5, 3.6,
 * 3.10, 4.5; `TECHNICAL_SPEC.md` §6.2.
 *
 * **The site's jurisdiction, not the organization's headquarters** (Rule 3.5):
 * the site is the chosen container's, or the organization's primary site
 * while no container is chosen, derived the one way every screen derives it
 * (`organizationSites`). **The version in force on the intake date**
 * (Rule 3.6), reduced to a calendar day in the site's zone (Rule 4.29) —
 * never today's, never the server's day.
 *
 * Two rule keys are resolved in one call because the commit needs both and a
 * decision under one version of the first with a clock under an unrelated
 * read of the second would be two evaluations that cannot be traced to one
 * request. A key that does not resolve is carried as the stated gap, never as
 * a default (Rule 3.10; E-13): the classification evaluator is told which
 * input is missing, and the clock refuses to start.
 */

export type RuleLookup =
  | { readonly kind: "resolved"; readonly rule: ResolvedRule }
  /** The site has no jurisdiction profile at all (Rule 3.10, E-13). */
  | { readonly kind: "no_jurisdiction" }
  /** A profile exists and no published version covers `asOf` (T-42). */
  | {
      readonly kind: "no_version";
      readonly reason: RuleResolutionFailureReason;
    };

export interface IntakeRuleContext {
  readonly site: OrganizationSite;
  /** The most specific link of the chain — what a decision row records. */
  readonly jurisdiction: Jurisdiction | null;
  /** The chain that was walked, most specific first. Empty without a profile. */
  readonly chain: readonly Jurisdiction[];
  /** The intake date in the site's zone (Rules 3.6, 4.29). */
  readonly asOf: IsoDate;
  readonly wasteStream: RuleLookup;
  readonly accumulation: RuleLookup;
}

/**
 * The site an intake belongs to.
 *
 * With a container chosen it is that container's site; without one it is the
 * organization's primary site. Both come out of the same derivation the
 * settings screens use, so the intake and the settings page cannot count
 * sites differently.
 */
export function siteForIntake(
  organization: Organization,
  containers: readonly Container[],
  chosen: Container | null,
): OrganizationSite {
  const sites = organizationSites(organization, containers);
  const primary = sites.find((site) => site.isOrganizationAddress);
  if (chosen === null)
    return primary ?? organizationSites(organization, [])[0]!;
  const [forContainer] = organizationSites(organization, [chosen]).filter(
    (site) => site.containerCount > 0,
  );
  return forContainer ?? primary ?? organizationSites(organization, [])[0]!;
}

export interface ResolveIntakeRulesInput {
  readonly organization: Organization;
  readonly containers: readonly Container[];
  readonly container: Container | null;
  /** `intake_session.started_at` — Rule 3.6's governing date. */
  readonly intakeStartedAt: IsoTimestamp;
  readonly applicationClass: ApplicationClass;
}

export async function resolveIntakeRules(
  ctx: RequestContext,
  input: ResolveIntakeRulesInput,
): Promise<IntakeRuleContext> {
  const site = siteForIntake(
    input.organization,
    input.containers,
    input.container,
  );
  const asOf = civilDateInZone(input.intakeStartedAt, site.timeZone);

  if (site.jurisdictionId === null) {
    return {
      site,
      jurisdiction: null,
      chain: [],
      asOf,
      wasteStream: { kind: "no_jurisdiction" },
      accumulation: { kind: "no_jurisdiction" },
    };
  }

  const chain = await data.jurisdictions.chainFrom(ctx, site.jurisdictionId);
  const resolution = await data.ruleVersions.resolve(ctx, {
    ruleKeys: [WASTE_STREAM_RULE_KEY, ACCUMULATION_RULE_KEY],
    jurisdictionId: site.jurisdictionId,
    asOf,
    applicationClass: input.applicationClass,
  });

  // The partial set names the keys that did resolve and is never a substitute
  // for the ones that did not; each key is read on its own so one gap cannot
  // hide the other's answer.
  const rules = resolution.ok
    ? resolution.resolved.rules
    : resolution.partial.rules;
  const lookup = (ruleKey: string): RuleLookup => {
    const rule = rules[ruleKey];
    if (rule !== undefined) return { kind: "resolved", rule };
    const gap = resolution.ok
      ? undefined
      : resolution.unresolved.find((entry) => entry.ruleKey === ruleKey);
    return { kind: "no_version", reason: gap?.reason ?? "no_rule_on_file" };
  };

  return {
    site,
    jurisdiction: chain[0] ?? null,
    chain,
    asOf,
    wasteStream: lookup(WASTE_STREAM_RULE_KEY),
    accumulation: lookup(ACCUMULATION_RULE_KEY),
  };
}

/** What `classifyWasteStream` is handed for a lookup, gap and all. */
export function classificationRuleInput(
  lookup: RuleLookup,
): ResolvedRule | UnresolvedClassificationRule | null {
  switch (lookup.kind) {
    case "resolved":
      return lookup.rule;
    case "no_jurisdiction":
      return null;
    case "no_version":
      return { missingInput: "rule_version" };
  }
}

export interface ClassificationPreviewInput {
  readonly chemistry: Chemistry | null;
  /** A person confirmed the chemistry on the card (Rules 2.15, 3.3). */
  readonly chemistryConfirmed: boolean;
  readonly applicationClass: ApplicationClass;
  readonly ddrFlags: readonly DdrFlag[];
}

/**
 * The classification as it stands, before anything is written — the same
 * evaluator the commit runs, on the same inputs, so step 3's preview and the
 * decision row cannot disagree (Rule 3.7).
 */
export function previewClassification(
  input: ClassificationPreviewInput,
  rules: IntakeRuleContext,
  organization: Organization,
): ClassificationResult {
  return classifyWasteStream(
    {
      chemistry: input.chemistry,
      chemistryConfirmed: input.chemistryConfirmed,
      applicationClass: input.applicationClass,
      ddrFlags: input.ddrFlags,
      handlerSizeClass: organization.handlerSizeClass,
      jurisdictionCode: rules.jurisdiction?.code ?? "",
    },
    classificationRuleInput(rules.wasteStream),
  );
}
