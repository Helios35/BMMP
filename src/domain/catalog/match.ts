import type { JsonValue } from "@/types/common";
import type { MatchScoring, MatchTolerances } from "@/domain/intake/thresholds";
import {
  absDecimal,
  isDecimalString,
  multiplyDecimal,
  subtractDecimal,
  compareDecimal,
} from "@/domain/units";

/**
 * Catalog matching — `TECHNICAL_SPEC.md` §11.1 step 4; Rules 2.18, 2.19.
 *
 * **This module ranks. It never selects.** Rule 2.19 is explicit: when several
 * entries are plausible the system presents a candidate list and a human picks,
 * and it never auto-selects the top one or narrows the list to one. So the
 * output is an ordered list with a stated method per row, and the one
 * judgement this module offers — {@link isExactMatch} — is the narrow Rule 2.18
 * question of whether exactly one entry resolved unambiguously from the
 * identifiers. Even then the pre-filled fields still need confirmation
 * (Rule 2.15).
 *
 * The identifiers come from the label read and the human's corrections. None
 * of them is chemistry: chemistry on a record comes from the matched entry or
 * from a person, and this module has no chemistry input at all.
 *
 * A `matchScore` is a similarity figure for ordering candidates and for the
 * confidence gate to measure against a configured threshold. The threshold is
 * platform configuration read through `src/data`; nothing here compares a
 * score to a cutoff. The weights below say how a method ranks against another
 * method, which is a property of the scorer and not a threshold.
 */

/** What the label read supplied. Quantities are already decimal strings in the record's unit. */
export interface MatchIdentifiers {
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly voltageV: string | null;
  readonly capacityAh: string | null;
  readonly energyWh: string | null;
}

/** The slice of a `catalog_entry` the scorer reads. */
export interface MatchCandidateInput {
  readonly catalogEntryId: string;
  readonly manufacturerName: string;
  readonly modelName: string | null;
  readonly partNumber: string | null;
  readonly partNumberNormalized: string | null;
  readonly nominalVoltageV: string | null;
  readonly ratedCapacityAh: string | null;
  readonly ratedEnergyWh: string | null;
  /** `catalog_entry.label_text_patterns`; the scorer reads `{ model: string[] }` and ignores the rest. */
  readonly labelTextPatterns: JsonValue | null;
}

export type MatchMethodCode =
  "exact_part_number" | "label_pattern" | "similarity";

export type MatchedOnField =
  "manufacturer" | "model" | "voltage" | "capacity_ah" | "energy_wh";

export interface RankedCandidate {
  readonly catalogEntryId: string;
  readonly matchScore: number;
  readonly matchMethodCode: MatchMethodCode;
  readonly matchedOn: readonly MatchedOnField[];
}

/**
 * A normalised part number that equals the entry's — the only route to the top
 * score, and the one weight that is structural rather than configured: it is
 * the ceiling every other method sits under.
 */
const EXACT_PART_NUMBER_SCORE = 1;

/**
 * The scorer's configuration — tolerances and weights together, read through
 * `src/data` and passed in (D-40). No weight is a literal in this file: a
 * weight decides which candidate ranks first, and that is what the gate
 * measures against `minMatchScore`.
 */
export interface MatchConfiguration {
  readonly tolerances: MatchTolerances;
  readonly scoring: MatchScoring;
}
/** Scores are rounded so two candidates that agree to this precision tie deterministically. */
const SCORE_DECIMALS = 4;

/**
 * Upper-cased with every separator stripped — `NV-TP400-96S` → `NVTP40096S`.
 *
 * The same transform the mock and the generated
 * `catalog_entry.part_number_normalized` column apply, so a comparison here is
 * a comparison against what the database indexed.
 */
export function normalizePartNumber(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Lower-cased alphanumerics only, for text similarity. */
function normalizeText(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function bigrams(text: string): readonly string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < text.length; i += 1) out.push(text.slice(i, i + 2));
  return out;
}

/**
 * Sørensen–Dice coefficient over character bigrams, 0..1.
 *
 * Chosen over edit distance because a label read tends to drop or transpose a
 * character or two inside an otherwise correct string, and bigram overlap is
 * forgiving of exactly that while staying cheap and deterministic.
 */
function diceSimilarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.length === 0 || right.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const gram of left) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  let shared = 0;
  for (const gram of right) {
    const remaining = counts.get(gram) ?? 0;
    if (remaining > 0) {
      shared += 1;
      counts.set(gram, remaining - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

/**
 * The entry's label-text model patterns, read defensively out of `jsonb`.
 *
 * Anything that is not `{ model: string[] }` yields no patterns rather than a
 * crash — a malformed catalog row should lose its pattern bonus, not take the
 * intake pipeline down with it.
 */
function modelPatterns(value: JsonValue | null): readonly string[] {
  if (!isJsonObject(value)) return [];
  const model: JsonValue | undefined = value.model;
  if (!Array.isArray(model)) return [];
  return model.filter((entry): entry is string => typeof entry === "string");
}

/** `Array.isArray` does not narrow a readonly array out of `JsonValue`; this does. */
function isJsonObject(
  value: JsonValue | null,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A tolerance arrives as a JavaScript fraction; the comparison happens on the
 * quantities as decimal strings. `String(0.02)` is `"0.02"`; a fraction small
 * enough to print in exponent form is written out in full instead, so the
 * decimal parser never sees an `e`.
 */
function toleranceAsDecimal(tolerance: number): string {
  const plain = String(tolerance);
  if (isDecimalString(plain)) return plain;
  return tolerance.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * `|label − catalog| ≤ tolerance × |catalog|`, evaluated exactly on the digits.
 *
 * Multiplication rather than division keeps the inequality exact at every
 * scale and makes a zero catalog figure a plain "does not agree" instead of a
 * division by zero. A figure that is not a decimal string never agrees.
 */
function agreesWithinTolerance(
  label: string | null,
  catalog: string | null,
  tolerance: number,
): boolean {
  if (label === null || catalog === null) return false;
  if (!isDecimalString(label) || !isDecimalString(catalog)) return false;
  const difference = absDecimal(subtractDecimal(label, catalog));
  const allowed = multiplyDecimal(
    absDecimal(catalog),
    toleranceAsDecimal(tolerance),
  );
  return compareDecimal(difference, allowed) <= 0;
}

/** Equal after normalisation, or one contains the other — `NV-TP400-96S` names `NV-TP400`. */
function textCorresponds(
  label: string | null,
  catalog: string | null,
): boolean {
  if (label === null || catalog === null) return false;
  const a = normalizeText(label);
  const b = normalizeText(catalog);
  if (a.length === 0 || b.length === 0) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function roundScore(score: number): number {
  const factor = 10 ** SCORE_DECIMALS;
  return Math.round(score * factor) / factor;
}

function numericAgreements(
  ids: MatchIdentifiers,
  candidate: MatchCandidateInput,
  tolerances: MatchTolerances,
): readonly MatchedOnField[] {
  const fields: MatchedOnField[] = [];
  if (
    agreesWithinTolerance(
      ids.voltageV,
      candidate.nominalVoltageV,
      tolerances.voltageRelative,
    )
  ) {
    fields.push("voltage");
  }
  if (
    agreesWithinTolerance(
      ids.capacityAh,
      candidate.ratedCapacityAh,
      tolerances.capacityRelative,
    )
  ) {
    fields.push("capacity_ah");
  }
  if (
    agreesWithinTolerance(
      ids.energyWh,
      candidate.ratedEnergyWh,
      tolerances.energyRelative,
    )
  ) {
    fields.push("energy_wh");
  }
  return fields;
}

function scoreCandidate(
  ids: MatchIdentifiers,
  candidate: MatchCandidateInput,
  configuration: MatchConfiguration,
): RankedCandidate {
  const { tolerances, scoring } = configuration;
  const modelNormalized =
    ids.model === null ? null : normalizePartNumber(ids.model);
  const entryPartNormalized =
    candidate.partNumberNormalized ??
    (candidate.partNumber === null
      ? null
      : normalizePartNumber(candidate.partNumber));

  // Rule 2.18 — the label's identifier resolves the entry's part number outright.
  if (
    modelNormalized !== null &&
    modelNormalized.length > 0 &&
    modelNormalized === entryPartNormalized
  ) {
    return {
      catalogEntryId: candidate.catalogEntryId,
      matchScore: EXACT_PART_NUMBER_SCORE,
      matchMethodCode: "exact_part_number",
      matchedOn: ["model"],
    };
  }

  // The entry's own label patterns name this model string.
  if (
    modelNormalized !== null &&
    modelNormalized.length > 0 &&
    modelPatterns(candidate.labelTextPatterns).some(
      (pattern) => normalizePartNumber(pattern) === modelNormalized,
    )
  ) {
    return {
      catalogEntryId: candidate.catalogEntryId,
      matchScore: scoring.labelPatternScore,
      matchMethodCode: "label_pattern",
      matchedOn: ["model"],
    };
  }

  // Similarity: text over manufacturer + model, plus a bonus per nameplate
  // figure that agrees. Text with nothing to compare contributes nothing.
  const labelText = normalizeText(
    `${ids.manufacturer ?? ""} ${ids.model ?? ""}`,
  );
  const entryText = normalizeText(
    `${candidate.manufacturerName} ${candidate.modelName ?? ""}`,
  );
  const similarity =
    diceSimilarity(labelText, entryText) * scoring.similarityCeiling;

  const agreements = numericAgreements(ids, candidate, tolerances);
  const matchedOn: MatchedOnField[] = [];
  if (textCorresponds(ids.manufacturer, candidate.manufacturerName)) {
    matchedOn.push("manufacturer");
  }
  if (textCorresponds(ids.model, candidate.modelName)) matchedOn.push("model");
  matchedOn.push(...agreements);

  return {
    catalogEntryId: candidate.catalogEntryId,
    matchScore: roundScore(
      similarity + agreements.length * scoring.numericAgreementBonus,
    ),
    matchMethodCode: "similarity",
    matchedOn,
  };
}

/**
 * Rank every candidate against the identifiers, best first.
 *
 * Ties are broken by `catalogEntryId` so the same inputs always produce the
 * same list — an audit event records the ranked ids, and a list that reorders
 * itself between runs would make two identical intakes look different.
 */
export function rankCatalogCandidates(
  ids: MatchIdentifiers,
  candidates: readonly MatchCandidateInput[],
  configuration: MatchConfiguration,
): readonly RankedCandidate[] {
  return candidates
    .map((candidate) => scoreCandidate(ids, candidate, configuration))
    .sort((a, b) => {
      if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
      if (a.catalogEntryId < b.catalogEntryId) return -1;
      if (a.catalogEntryId > b.catalogEntryId) return 1;
      return 0;
    });
}

/**
 * Rule 2.18 — exactly one entry resolved by its part number.
 *
 * Two exact hits are not "a very good match"; they are an ambiguity, and
 * Rule 2.19 says a human picks. Zero is not a match at all.
 */
export function isExactMatch(ranked: readonly RankedCandidate[]): boolean {
  return (
    ranked.filter(
      (candidate) => candidate.matchMethodCode === "exact_part_number",
    ).length === 1
  );
}
