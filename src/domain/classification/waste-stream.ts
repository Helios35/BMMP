import type { JsonValue } from "@/types/common";
import {
  type AppliedRuleVersion,
  type RuleOutcome,
  ruleOutcome,
} from "@/domain/rules/outcome";
import type { ResolvedRule } from "@/domain/rules/resolve";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";
import { type Chemistry, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import type { ClassificationBasisCode } from "@/domain/taxonomy/classification-basis-code";
import { type DdrFlag, DDR_FLAG_LABELS } from "@/domain/taxonomy/ddr-flag";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import type { WasteClassification } from "@/domain/taxonomy/waste-classification";

/**
 * Waste-stream classification — `BUSINESS_RULES.md` Rules 3.1–3.13; T-13, T-14.
 *
 * **Every threshold, list and switch this evaluator reads comes out of the
 * resolved rule version's payload.** Which chemistries fall in the light
 * category in a jurisdiction, whether a damaged flag moves a record out of it,
 * and whether the jurisdiction's own rule displaces the federal baseline are
 * all data (Rule 1.23, `_ANCHORS.md` §7.4). This file knows the *shape* of the
 * `classification.waste_stream.v1` payload and nothing of its contents; a
 * chemistry code compared against a literal here is a review rejection.
 *
 * **Blocked is not defaulted.** Chemistry that a person has not confirmed
 * yields `undetermined` with `chemistry_unconfirmed` as the sole basis
 * (Rules 3.3, 3.4; T-14), and no jurisdiction profile or no rule version in
 * force yields no outcome at all — the caller is told which input is missing
 * and who can supply it (Rule 3.10, EC-16), and nothing downstream may be
 * generated (Rule 3.12).
 *
 * Chemistry is one input among several and never decides alone (Rule 3.9):
 * the DDR flags and the payload's switches are read beside it, and the
 * application class, handler size class and jurisdiction are frozen into the
 * snapshot so the decision reproduces (Rule 3.7). The reasoning sentence
 * states only what this rule computed — never a transport, packaging or
 * document consequence that belongs to another rule.
 */

export const WASTE_STREAM_RULE_KEY = "classification.waste_stream";

/** The payload schema this evaluator knows how to read. Anything else is refused. */
const WASTE_STREAM_PAYLOAD_SCHEMA_KEY = "classification.waste_stream.v1";

export interface ClassificationInputs {
  readonly chemistry: Chemistry | null;
  /** A human confirmed the chemistry (Rules 2.15, 3.3). Without it nothing classifies. */
  readonly chemistryConfirmed: boolean;
  readonly applicationClass: ApplicationClass;
  readonly ddrFlags: readonly DdrFlag[];
  /** T-15, carried as the stored string; frozen into the snapshot (Rule 3.4). */
  readonly handlerSizeClass: string;
  /** The site's jurisdiction code, for the snapshot only — never branched on (Rule 1.23). */
  readonly jurisdictionCode: string;
}

export type ClassificationMissingInput =
  "jurisdiction_profile" | "rule_version";

/**
 * What the caller passes when it could not resolve the rule, and knows why.
 *
 * `null` is also accepted and reads as a missing jurisdiction profile — the
 * gap Rule 3.10 names — because a caller with no jurisdiction had nothing to
 * resolve against. A caller that had a jurisdiction and found no version in
 * force says so with `rule_version`.
 */
export interface UnresolvedClassificationRule {
  readonly missingInput: ClassificationMissingInput;
}

export type ClassificationResult =
  | {
      readonly kind: "decided";
      readonly outcome: RuleOutcome<WasteClassification>;
      readonly basisCodes: readonly ClassificationBasisCode[];
      readonly status: "active";
    }
  | {
      readonly kind: "blocked";
      readonly outcome: RuleOutcome<"undetermined">;
      readonly basisCodes: readonly ["chemistry_unconfirmed"];
      readonly status: "blocked";
    }
  | {
      readonly kind: "unresolved";
      readonly missingInput: ClassificationMissingInput;
      readonly ruleKey: typeof WASTE_STREAM_RULE_KEY;
      readonly whoCanSupply: "facility_manager_or_platform_admin";
    };

interface WasteStreamPayload {
  readonly lightCategoryChemistries: readonly string[];
  readonly ddrForcesFullyRegulated: boolean;
  readonly displacesFederalBaseline: boolean;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read the `classification.waste_stream.v1` payload, or refuse with `null`.
 *
 * Refusal is the answer to any shape this evaluator does not recognise — a
 * different schema key, a missing list, a switch that is not a boolean. A
 * payload half-read is a decision half-made, which on this product is a wrong
 * document with a customer's name on it.
 */
function readWasteStreamPayload(
  resolved: ResolvedRule,
): WasteStreamPayload | null {
  if (resolved.ruleKey !== WASTE_STREAM_RULE_KEY) return null;
  if (resolved.version.payloadSchemaKey !== WASTE_STREAM_PAYLOAD_SCHEMA_KEY) {
    return null;
  }
  const payload: unknown = resolved.version.payload;
  if (!isRecord(payload)) return null;

  const { lightCategoryChemistries, ddrForcesFullyRegulated } = payload;
  if (
    !Array.isArray(lightCategoryChemistries) ||
    !lightCategoryChemistries.every((entry) => typeof entry === "string")
  ) {
    return null;
  }
  if (typeof ddrForcesFullyRegulated !== "boolean") return null;

  const displaces = payload.displacesFederalBaseline;
  if (displaces !== undefined && typeof displaces !== "boolean") return null;

  return {
    lightCategoryChemistries,
    ddrForcesFullyRegulated,
    displacesFederalBaseline: displaces === true,
  };
}

function unresolved(
  missingInput: ClassificationMissingInput,
): ClassificationResult {
  return {
    kind: "unresolved",
    missingInput,
    ruleKey: WASTE_STREAM_RULE_KEY,
    whoCanSupply: "facility_manager_or_platform_admin",
  };
}

function snapshot(
  inputs: ClassificationInputs,
): Readonly<Record<string, JsonValue>> {
  return {
    chemistry: inputs.chemistry,
    chemistryConfirmed: inputs.chemistryConfirmed,
    applicationClass: inputs.applicationClass,
    ddrFlags: [...inputs.ddrFlags],
    jurisdiction: inputs.jurisdictionCode,
    handlerSizeClass: inputs.handlerSizeClass,
  };
}

function appliedVersion(
  resolved: ResolvedRule,
  inputs: ClassificationInputs,
  outcome: string,
): AppliedRuleVersion {
  return {
    jurisdictionRuleId: resolved.version.jurisdictionRuleId,
    ruleVersionId: resolved.version.ruleVersionId,
    ruleKey: resolved.ruleKey,
    versionLabel: resolved.version.versionLabel,
    citation: resolved.version.citation,
    inputs: {
      chemistry: inputs.chemistry,
      applicationClass: inputs.applicationClass,
      ddrFlags: [...inputs.ddrFlags],
    },
    outcome,
  };
}

/** "the Damaged and Defective flags" / "the Damaged flag", from the T-30 labels. */
function flagPhrase(flags: readonly DdrFlag[]): string {
  const labels = flags.map((flag) => DDR_FLAG_LABELS[flag]);
  const joined =
    labels.length <= 1
      ? labels.join("")
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `the ${joined} ${labels.length === 1 ? "flag" : "flags"}`;
}

/**
 * Classify one record's waste stream under the resolved rule version.
 *
 * The order of the checks is the order of Rules 3.3, 3.4 and 3.10: no rule or
 * no jurisdiction → nothing to decide; a readable rule but unconfirmed
 * chemistry → blocked; otherwise decided from the payload and the DDR flags.
 */
export function classifyWasteStream(
  inputs: ClassificationInputs,
  resolved: ResolvedRule | UnresolvedClassificationRule | null,
): ClassificationResult {
  if (resolved === null) return unresolved("jurisdiction_profile");
  if (!("version" in resolved)) return unresolved(resolved.missingInput);

  const payload = readWasteStreamPayload(resolved);
  if (payload === null) return unresolved("rule_version");

  const inputsSnapshot = snapshot(inputs);

  // Rules 3.3, 3.4 — chemistry is a fact only once a person has confirmed it.
  if (
    inputs.chemistry === null ||
    inputs.chemistry === "unknown" ||
    !inputs.chemistryConfirmed
  ) {
    return {
      kind: "blocked",
      status: "blocked",
      basisCodes: ["chemistry_unconfirmed"],
      outcome: ruleOutcome<"undetermined">({
        result: "undetermined",
        reasoning:
          "Chemistry has not been human-confirmed, so no waste classification can be derived. " +
          `A ${ROLE_LABELS.compliance_handler} or a ${ROLE_LABELS.facility_manager} must confirm chemistry ` +
          "before this record can be classified, placed in a container or documented.",
        ruleVersionsApplied: [appliedVersion(resolved, inputs, "blocked")],
        inputsSnapshot,
        context: WASTE_STREAM_RULE_KEY,
      }),
    };
  }

  const chemistryLabel = CHEMISTRY_LABELS[inputs.chemistry];
  const inLightList = payload.lightCategoryChemistries.includes(
    inputs.chemistry,
  );
  const flagged = inputs.ddrFlags.length > 0;
  const baseline: ClassificationBasisCode = payload.displacesFederalBaseline
    ? "jurisdiction_override"
    : "federal_default";
  const baselineClause = payload.displacesFederalBaseline
    ? "under a jurisdiction rule that displaces the federal baseline"
    : "with no jurisdiction rule displacing the federal baseline";

  let result: WasteClassification;
  let basisCodes: readonly ClassificationBasisCode[];
  let reasoning: string;

  if (!inLightList) {
    result = "fully_regulated";
    basisCodes = flagged
      ? ["chemistry_out_of_scope", "damage_state"]
      : ["chemistry_out_of_scope"];
    reasoning =
      `Confirmed ${chemistryLabel} chemistry is not within the light waste category in this jurisdiction, ` +
      "so the record falls in the fully regulated stream." +
      (flagged
        ? ` The record also carries ${flagPhrase(inputs.ddrFlags)}.`
        : "");
  } else if (!flagged) {
    result = "light_category";
    basisCodes = [baseline];
    reasoning =
      `Confirmed ${chemistryLabel} chemistry falls within the light waste category in this jurisdiction, ` +
      `${baselineClause} and no damage indicator present.`;
  } else if (payload.ddrForcesFullyRegulated) {
    result = "fully_regulated";
    basisCodes = [baseline, "damage_state"];
    reasoning =
      `Confirmed ${chemistryLabel} chemistry would fall within the light waste category in this jurisdiction, ` +
      `but the record carries ${flagPhrase(inputs.ddrFlags)} and the rule in force here places flagged material ` +
      "in the fully regulated stream.";
  } else {
    result = "light_category";
    basisCodes = [baseline, "damage_state"];
    reasoning =
      `Confirmed ${chemistryLabel} chemistry falls within the light waste category in this jurisdiction, ` +
      `${baselineClause}. The record carries ${flagPhrase(inputs.ddrFlags)}; the rule in force here does not ` +
      "move a flagged record out of the light category.";
  }

  return {
    kind: "decided",
    status: "active",
    basisCodes,
    outcome: ruleOutcome<WasteClassification>({
      result,
      reasoning,
      ruleVersionsApplied: [appliedVersion(resolved, inputs, result)],
      inputsSnapshot,
      context: WASTE_STREAM_RULE_KEY,
    }),
  };
}
