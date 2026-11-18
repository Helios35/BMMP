import type { AppliedRuleVersion } from "@/domain/rules/outcome";
import {
  resolveRules,
  type JurisdictionRef,
  type RuleVersionCandidate,
} from "@/domain/rules/resolve";
import type { FormatCategory } from "@/domain/taxonomy/format-category";
import type { ProducerObligationStatus } from "@/domain/taxonomy/producer-obligation-status";
import type { IsoDate, JsonObject, Uuid } from "@/types/common";

import {
  bandWords,
  factsSnapshot,
  placeInBand,
  type BandPlacement,
} from "./band";
import {
  evaluateCondition,
  MISSING_INPUT_WORDS,
  type MissingInput,
  type ProductFacts,
  type Truth,
} from "./conditions";
import { deadlinesFor, type DeadlineDraft } from "./deadlines";
import {
  COVERAGE_RULE_KEY,
  COVERAGE_SCHEMA_KEY,
  OBLIGATIONS_RULE_KEY,
  OBLIGATIONS_SCHEMA_KEY,
  parseCoveragePayload,
  parseObligationsPayload,
  ProducerRulePayloadError,
  type CoveragePayload,
  type Due,
  type ObligationDefinition,
  type ObligationsPayload,
} from "./payloads";

/**
 * One evaluation of an organization's producer obligations — Rules 8.6–8.11.
 *
 * **Products and states in; a band per state; obligations and deadlines
 * out.** Pure: the adapter fetches the declared products, their catalog facts
 * and every producer rule version on file; this decides. The same inputs give
 * the same answer on mock and on Supabase, and in a unit test with "today"
 * pinned.
 *
 * Every state is resolved **as of today in the organization's time zone, with
 * the rule versions in force that day** (Rules 1.23, 8.11). A state with no
 * obligations rule in force reads "No producer rules on file" — which never
 * means none apply (Rule 8.7). **Nothing here branches on a jurisdiction
 * code** (T-40): every state is the same code path with different data.
 */

export interface DeclaredProduct {
  readonly productId: Uuid;
  readonly catalogEntryId: Uuid;
  /** How the product reads: the catalog entry's maker and model. */
  readonly label: string;
  /** From the catalog entry — never typed on the obligations page (Rule 8.6). */
  readonly facts: ProductFacts;
  /** The states it is sold, offered for sale or distributed in or into. */
  readonly jurisdictionIds: readonly Uuid[];
}

export interface ProducerEvaluationInputs {
  readonly products: readonly DeclaredProduct[];
  /** Every jurisdiction a product names. */
  readonly jurisdictions: readonly JurisdictionRef[];
  /** Every published and draft version of every producer rule, unfiltered by date. */
  readonly candidates: readonly RuleVersionCandidate[];
}

/** A rule version as a person reads it (Rule 8.14). */
export interface VersionReference {
  readonly ruleVersionId: Uuid;
  readonly jurisdictionRuleId: Uuid;
  readonly ruleKey: string;
  readonly versionLabel: string;
  readonly effectiveOn: IsoDate;
  readonly citation: string;
  readonly citationUrl: string | null;
}

export interface ProductInState {
  readonly productId: Uuid;
  readonly catalogEntryId: Uuid;
  readonly label: string;
  readonly facts: ProductFacts;
  /** `null` where the state has no coverage rule in force. */
  readonly placement: BandPlacement | null;
  readonly band: FormatCategory;
  /** The band in the law's own terms, or why it can't be told. */
  readonly bandWords: string;
  readonly bandMissing: readonly MissingInput[];
}

export interface ObligationProduct {
  readonly productId: Uuid;
  readonly label: string;
  readonly band: FormatCategory;
  readonly bandWords: string;
  /** Whether this product meets the obligation's conditions. */
  readonly truth: Truth;
  readonly missing: readonly MissingInput[];
}

export interface ObligationEvaluation {
  readonly key: string;
  readonly duty: string;
  readonly citation: string;
  readonly due: Due;
  readonly status: ProducerObligationStatus;
  readonly products: readonly ObligationProduct[];
  /** Plain language — shown on the panel and printed on exports. */
  readonly reasoning: string;
  readonly ruleVersionsApplied: readonly AppliedRuleVersion[];
  /**
   * The dated deadlines this obligation carries today. **None for
   * `not_applicable`**; an `undetermined` obligation keeps its deadlines,
   * because a gap is never treated as "doesn't apply" (Rule 8.9).
   */
  readonly deadlines: readonly DeadlineDraft[];
  /** What a re-run compares to decide whether the result changed (Rule 8.11). */
  readonly signature: string;
}

export interface StateEvaluation {
  readonly jurisdiction: JurisdictionRef;
  readonly products: readonly ProductInState[];
  /** Whether an obligations rule is in force today (Rule 8.7). */
  readonly onFile: boolean;
  readonly coverage: VersionReference | null;
  readonly obligationsVersion: VersionReference | null;
  readonly agency: string | null;
  readonly stewardshipOrganizations: readonly string[];
  readonly notChecked: readonly string[];
  readonly obligations: readonly ObligationEvaluation[];
  /** Published versions that take effect after today — shown with their date (Rule 8.14). */
  readonly laterVersions: readonly VersionReference[];
}

export interface ProducerEvaluation {
  readonly asOf: IsoDate;
  readonly states: readonly StateEvaluation[];
  /** Every version this run read, once each — the audit row's (Rule 12.15). */
  readonly ruleVersionsApplied: readonly AppliedRuleVersion[];
}

function reference(version: RuleVersionCandidate): VersionReference {
  return {
    ruleVersionId: version.ruleVersionId,
    jurisdictionRuleId: version.jurisdictionRuleId,
    ruleKey: version.ruleKey,
    versionLabel: version.versionLabel,
    effectiveOn: version.effectiveOn,
    citation: version.citation,
    citationUrl: version.citationUrl,
  };
}

function resolveOne(
  ruleKey: string,
  state: JurisdictionRef,
  candidates: readonly RuleVersionCandidate[],
  asOf: IsoDate,
): RuleVersionCandidate | null {
  // The state itself, not a chain: a producer law is a state's own, and a
  // broader level's rule must never stand in for a state that has none.
  const resolution = resolveRules(
    { ruleKeys: [ruleKey], jurisdictionChain: [state], asOf },
    candidates,
  );
  if (!resolution.ok) return null;
  return resolution.resolved.rules[ruleKey]?.version ?? null;
}

function coverageOf(version: RuleVersionCandidate): CoveragePayload {
  const parsed =
    version.payloadSchemaKey === COVERAGE_SCHEMA_KEY
      ? parseCoveragePayload(version.payload)
      : {
          ok: false as const,
          issues: [
            `schema ${version.payloadSchemaKey} is not ${COVERAGE_SCHEMA_KEY}`,
          ],
        };
  if (!parsed.ok) {
    throw new ProducerRulePayloadError(
      version.ruleKey,
      version.versionLabel,
      parsed.issues,
    );
  }
  return parsed.payload;
}

function obligationsOf(version: RuleVersionCandidate): ObligationsPayload {
  const parsed =
    version.payloadSchemaKey === OBLIGATIONS_SCHEMA_KEY
      ? parseObligationsPayload(version.payload)
      : {
          ok: false as const,
          issues: [
            `schema ${version.payloadSchemaKey} is not ${OBLIGATIONS_SCHEMA_KEY}`,
          ],
        };
  if (!parsed.ok) {
    throw new ProducerRulePayloadError(
      version.ruleKey,
      version.versionLabel,
      parsed.issues,
    );
  }
  return parsed.payload;
}

function laterVersionsOf(
  state: JurisdictionRef,
  candidates: readonly RuleVersionCandidate[],
  asOf: IsoDate,
): readonly VersionReference[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.jurisdictionId === state.id &&
        candidate.isRuleActive &&
        candidate.publishedAt !== null &&
        candidate.effectiveOn > asOf &&
        (candidate.ruleKey === COVERAGE_RULE_KEY ||
          candidate.ruleKey === OBLIGATIONS_RULE_KEY),
    )
    .sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn))
    .map(reference);
}

function productInState(
  product: DeclaredProduct,
  coverage: RuleVersionCandidate | null,
  payload: CoveragePayload | null,
): ProductInState {
  if (coverage === null || payload === null) {
    return {
      productId: product.productId,
      catalogEntryId: product.catalogEntryId,
      label: product.label,
      facts: product.facts,
      placement: null,
      band: "undetermined",
      bandWords: `Can't tell: ${MISSING_INPUT_WORDS.coverage_rule}`,
      bandMissing: ["coverage_rule"],
    };
  }
  const placement = placeInBand(product.facts, {
    version: coverage,
    payload,
  }).result;
  return {
    productId: product.productId,
    catalogEntryId: product.catalogEntryId,
    label: product.label,
    facts: product.facts,
    placement,
    band: placement.band,
    bandWords: bandWords(placement),
    bandMissing: placement.missing,
  };
}

function statusFrom(
  products: readonly ObligationProduct[],
): ProducerObligationStatus {
  if (products.some((product) => product.truth === "true")) return "applies";
  if (products.every((product) => product.truth === "false")) {
    return "not_applicable";
  }
  return "undetermined";
}

function reasoningFor(
  status: ProducerObligationStatus,
  products: readonly ObligationProduct[],
  stateName: string,
): string {
  if (status === "applies") {
    // The band is named where it is one the law covers; an obligation met on
    // another fact (an embedded battery) names the product alone.
    const meeting = products
      .filter((product) => product.truth === "true")
      .map((product) =>
        product.band === "not_covered" || product.band === "undetermined"
          ? product.label
          : `${product.label} (${product.bandWords})`,
      );
    return `Applies: ${meeting.join("; ")}.`;
  }
  if (status === "not_applicable") {
    return `Doesn't apply: no product sold in ${stateName} meets it.`;
  }
  const open = products
    .filter((product) => product.truth === "cant_tell")
    .map(
      (product) =>
        `${product.label} — ${product.missing.map((input) => MISSING_INPUT_WORDS[input]).join(", ")}`,
    );
  return `Can't tell yet: ${open.join("; ")}.`;
}

function signatureOf(input: {
  readonly status: ProducerObligationStatus;
  readonly obligationsVersionId: Uuid;
  readonly coverageVersionId: Uuid | null;
  readonly due: Due;
  readonly products: readonly ObligationProduct[];
}): string {
  return JSON.stringify({
    status: input.status,
    obligations: input.obligationsVersionId,
    coverage: input.coverageVersionId,
    due: input.due,
    products: [...input.products]
      .sort((a, b) => a.productId.localeCompare(b.productId))
      .map((product) => [
        product.productId,
        product.band,
        product.bandWords,
        product.truth,
        product.missing,
      ]),
  });
}

function evaluateObligation(
  definition: ObligationDefinition,
  products: readonly ProductInState[],
  state: JurisdictionRef,
  obligationsVersion: RuleVersionCandidate,
  coverage: RuleVersionCandidate | null,
  asOf: IsoDate,
): ObligationEvaluation {
  const evaluated: ObligationProduct[] = products.map((product) => {
    const result = evaluateCondition(definition.appliesTo, product.facts, {
      band: product.band,
      missing: product.bandMissing,
    });
    return {
      productId: product.productId,
      label: product.label,
      band: product.band,
      bandWords: product.bandWords,
      truth: result.truth,
      missing: result.missing,
    };
  });
  const status = statusFrom(evaluated);
  const applied: AppliedRuleVersion[] = [
    {
      jurisdictionRuleId: obligationsVersion.jurisdictionRuleId,
      ruleVersionId: obligationsVersion.ruleVersionId,
      ruleKey: obligationsVersion.ruleKey,
      versionLabel: obligationsVersion.versionLabel,
      citation: obligationsVersion.citation,
      inputs: {
        obligationKey: definition.key,
        products: evaluated.map((product) => ({
          productId: product.productId,
          band: product.band,
        })),
      },
      outcome: status,
    },
  ];
  if (coverage !== null) {
    applied.push({
      jurisdictionRuleId: coverage.jurisdictionRuleId,
      ruleVersionId: coverage.ruleVersionId,
      ruleKey: coverage.ruleKey,
      versionLabel: coverage.versionLabel,
      citation: coverage.citation,
      inputs: {
        products: products.map((product) => factsSnapshot(product.facts)),
      },
      outcome: products.map((product) => product.band).join(","),
    });
  }
  return {
    key: definition.key,
    duty: definition.duty,
    citation: definition.citation,
    due: definition.due,
    status,
    products: evaluated,
    reasoning: reasoningFor(status, evaluated, state.name),
    ruleVersionsApplied: applied,
    deadlines:
      status === "not_applicable"
        ? []
        : deadlinesFor(definition.key, definition.due, asOf),
    signature: signatureOf({
      status,
      obligationsVersionId: obligationsVersion.ruleVersionId,
      coverageVersionId: coverage?.ruleVersionId ?? null,
      due: definition.due,
      products: evaluated,
    }),
  };
}

function evaluateState(
  state: JurisdictionRef,
  products: readonly DeclaredProduct[],
  candidates: readonly RuleVersionCandidate[],
  asOf: IsoDate,
): StateEvaluation {
  const coverage = resolveOne(COVERAGE_RULE_KEY, state, candidates, asOf);
  const obligations = resolveOne(OBLIGATIONS_RULE_KEY, state, candidates, asOf);
  const coveragePayload = coverage === null ? null : coverageOf(coverage);
  const obligationsPayload =
    obligations === null ? null : obligationsOf(obligations);
  const inState = products.map((product) =>
    productInState(product, coverage, coveragePayload),
  );
  return {
    jurisdiction: state,
    products: inState,
    onFile: obligations !== null,
    coverage: coverage === null ? null : reference(coverage),
    obligationsVersion: obligations === null ? null : reference(obligations),
    agency: obligationsPayload?.agency ?? null,
    stewardshipOrganizations:
      obligationsPayload?.stewardshipOrganizations ?? [],
    notChecked: coveragePayload?.notChecked ?? [],
    obligations:
      obligations === null || obligationsPayload === null
        ? []
        : obligationsPayload.obligations.map((definition) =>
            evaluateObligation(
              definition,
              inState,
              state,
              obligations,
              coverage,
              asOf,
            ),
          ),
    laterVersions: laterVersionsOf(state, candidates, asOf),
  };
}

export function evaluateProducerObligations(
  inputs: ProducerEvaluationInputs,
  asOf: IsoDate,
): ProducerEvaluation {
  const sold = new Set(
    inputs.products.flatMap((product) => product.jurisdictionIds),
  );
  const states = inputs.jurisdictions
    .filter((jurisdiction) => sold.has(jurisdiction.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((state) =>
      evaluateState(
        state,
        inputs.products.filter((product) =>
          product.jurisdictionIds.includes(state.id),
        ),
        inputs.candidates,
        asOf,
      ),
    );

  const applied = new Map<Uuid, AppliedRuleVersion>();
  for (const state of states) {
    for (const obligation of state.obligations) {
      for (const version of obligation.ruleVersionsApplied) {
        if (!applied.has(version.ruleVersionId)) {
          applied.set(version.ruleVersionId, {
            ...version,
            inputs: { jurisdiction: state.jurisdiction.code },
            outcome: "read",
          });
        }
      }
    }
  }
  return { asOf, states, ruleVersionsApplied: [...applied.values()] };
}

/** The `applies_because` an obligation row stores — the inputs that decided it. */
export function obligationBasis(
  state: StateEvaluation,
  obligation: ObligationEvaluation,
): JsonObject {
  return {
    jurisdictionCode: state.jurisdiction.code,
    stateName: state.jurisdiction.name,
    agency: state.agency,
    law: state.obligationsVersion?.citation ?? null,
    lawUrl: state.obligationsVersion?.citationUrl ?? null,
    obligationsVersion: state.obligationsVersion
      ? versionJson(state.obligationsVersion)
      : null,
    coverageVersion: state.coverage ? versionJson(state.coverage) : null,
    due: dueJson(obligation.due),
    stewardshipOrganizations: [...state.stewardshipOrganizations],
    notChecked: [...state.notChecked],
    reasoning: obligation.reasoning,
    products: obligation.products.map((product) => ({
      productId: product.productId,
      label: product.label,
      band: product.band,
      bandWords: product.bandWords,
      truth: product.truth,
      missing: [...product.missing],
    })),
    signature: obligation.signature,
  };
}

function versionJson(version: VersionReference): JsonObject {
  return {
    ruleVersionId: version.ruleVersionId,
    ruleKey: version.ruleKey,
    versionLabel: version.versionLabel,
    effectiveOn: version.effectiveOn,
    citation: version.citation,
    citationUrl: version.citationUrl,
  };
}

export function dueJson(due: Due): JsonObject {
  switch (due.kind) {
    case "statutory_date":
      return { kind: due.kind, on: due.on };
    case "annual":
      return {
        kind: due.kind,
        month: due.month,
        day: due.day,
        firstOn: due.firstOn,
      };
    case "no_date":
      return { kind: due.kind, event: due.event };
  }
}
