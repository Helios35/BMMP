import { ruleOutcome, type RuleOutcome } from "@/domain/rules/outcome";
import type { RuleVersionCandidate } from "@/domain/rules/resolve";
import {
  FORMAT_CATEGORY_LABELS,
  type FormatCategory,
} from "@/domain/taxonomy/format-category";
import type { JsonObject } from "@/types/common";

import {
  evaluateCondition,
  MISSING_INPUT_WORDS,
  type MissingInput,
  type ProductFacts,
} from "./conditions";
import type { CoveragePayload } from "./payloads";

/**
 * Placing a product in a state's band — Rule 8.8; T-06.
 *
 * The coverage rule's classes are checked in order. The product takes **the
 * first class that holds**, as that class's band, in the law's own words. If
 * a class before it can't be told, the band is `undetermined` and names the
 * missing input — **`undetermined` is never `not_covered`**. If none holds,
 * the band is `not_covered`. Exclusions the product's facts can't test
 * (medical devices, recalled batteries) are carried as "Not checked" and
 * never change the band.
 */

export interface ResolvedCoverage {
  readonly version: RuleVersionCandidate;
  readonly payload: CoveragePayload;
}

export interface BandPlacement {
  readonly band: FormatCategory;
  /** The class that holds — `null` for `not_covered` and `undetermined`. */
  readonly classKey: string | null;
  /** The law's label for it: "Medium format battery". */
  readonly classLabel: string | null;
  readonly classCitation: string | null;
  /** The class that could not be told, for `undetermined`. */
  readonly openClassLabel: string | null;
  /** Why it is `undetermined`. Empty otherwise. */
  readonly missing: readonly MissingInput[];
  /** Exclusions the facts cannot test (Rule 8.8). */
  readonly notChecked: readonly string[];
}

export function factsSnapshot(facts: ProductFacts): JsonObject {
  return {
    chemistry: facts.chemistry,
    massKg: facts.massKg,
    energyWh: facts.energyWh,
    removability: facts.removability,
    applicationClass: facts.applicationClass,
  };
}

/** The band as a person reads it: the law's label, or T-06's. */
export function bandWords(placement: BandPlacement): string {
  if (placement.classLabel !== null) return placement.classLabel;
  if (placement.band === "undetermined") {
    const why = placement.missing
      .map((input) => MISSING_INPUT_WORDS[input])
      .join(", ");
    return why === "" ? "Can't tell" : `Can't tell: ${why}`;
  }
  return FORMAT_CATEGORY_LABELS[placement.band];
}

export function placeInBand(
  facts: ProductFacts,
  coverage: ResolvedCoverage,
): RuleOutcome<BandPlacement> {
  const { payload, version } = coverage;
  let placement: BandPlacement | null = null;

  for (const entry of payload.classes) {
    const result = evaluateCondition(entry.when, facts);
    if (result.truth === "false") continue;
    placement =
      result.truth === "true"
        ? {
            band: entry.band,
            classKey: entry.key,
            classLabel: entry.label,
            classCitation: entry.citation,
            openClassLabel: null,
            missing: [],
            notChecked: payload.notChecked,
          }
        : {
            // A class before any that holds could not be told: the product
            // may be in it, so no later class may be taken as its answer.
            band: "undetermined",
            classKey: null,
            classLabel: null,
            classCitation: null,
            openClassLabel: entry.label,
            missing: result.missing,
            notChecked: payload.notChecked,
          };
    break;
  }

  placement ??= {
    band: "not_covered",
    classKey: null,
    classLabel: null,
    classCitation: null,
    openClassLabel: null,
    missing: [],
    notChecked: payload.notChecked,
  };

  const reasoning =
    placement.band === "undetermined"
      ? `Can't tell whether it is a ${placement.openClassLabel ?? "covered battery"}: ${placement.missing.map((input) => MISSING_INPUT_WORDS[input]).join(", ")}.`
      : placement.band === "not_covered"
        ? "Outside every class this rule names."
        : `${placement.classLabel ?? ""} (${placement.classCitation ?? version.citation}).`;

  return ruleOutcome({
    result: placement,
    reasoning,
    ruleVersionsApplied: [
      {
        jurisdictionRuleId: version.jurisdictionRuleId,
        ruleVersionId: version.ruleVersionId,
        ruleKey: version.ruleKey,
        versionLabel: version.versionLabel,
        citation: version.citation,
        inputs: factsSnapshot(facts),
        outcome: placement.band,
      },
    ],
    inputsSnapshot: factsSnapshot(facts),
    context: "producer band placement",
  });
}
