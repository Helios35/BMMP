import { normalizePartNumber } from "@/domain/catalog/match";

import type { RecallMatchConfiguration } from "./configuration";
import type { RecallHit } from "./hit";
import type {
  NamedValue,
  RecallIdentity,
  RecallIdentityKind,
  RecallMatchField,
} from "./identity";

/**
 * Which recall hits are candidates — Rules 10.12, 10.13; D-73 #2.
 *
 * - **Consumer source:** the maker names agree **and** a model or part number
 *   listed in the recall agrees with the record's.
 * - **Vehicle source:** make, model and model year agree **and** the recall's
 *   component names the propulsion or traction battery.
 *
 * **A name agreeing on its own is never a candidate.** Names are normalized
 * the way part numbers already are (`normalizePartNumber`), after the maker
 * words the configuration ignores are dropped; the component terms come from
 * the same configuration (Rule 1.23).
 *
 * **Every candidate is a possible match.** This module never confirms one,
 * however exact (Rule 10.7), and produces no number of any kind — the output
 * is which fields agreed, and `matchedOnWords` says it in words (Rule 10.13).
 */

export interface RecallCandidate {
  readonly identity: RecallIdentityKind;
  readonly hit: RecallHit;
  /** The fields that agreed, in the order the words name them. */
  readonly fields: readonly RecallMatchField[];
}

/** Upper-case words of a name, split on anything that is not a letter or digit. */
function words(value: string): readonly string[] {
  return value
    .split(/[^A-Za-z0-9]+/u)
    .filter((word) => word !== "")
    .map((word) => word.toUpperCase());
}

/**
 * A maker's name as it is compared: the configured words dropped, then the
 * part-number normalization — `Ridgeline Mobility, LLC` → `RIDGELINEMOBILITY`.
 * A name that is nothing but ignored words normalizes to `""` and agrees with
 * nothing.
 */
export function normalizeMakerName(
  value: string,
  configuration: RecallMatchConfiguration,
): string {
  const ignored = new Set(
    configuration.makerWordsIgnored.flatMap((word) => words(word)),
  );
  return normalizePartNumber(
    words(value)
      .filter((word) => !ignored.has(word))
      .join(""),
  );
}

function firstAgreeing(
  ours: readonly NamedValue[],
  theirs: readonly string[],
  normalize: (value: string) => string,
): RecallMatchField | null {
  const listed = new Set(theirs.map(normalize).filter((value) => value !== ""));
  for (const name of ours) {
    const normalized = normalize(name.value);
    if (normalized !== "" && listed.has(normalized)) return name.field;
  }
  return null;
}

function namesTractionBattery(
  component: string | null,
  configuration: RecallMatchConfiguration,
): boolean {
  if (component === null) return false;
  const haystack = ` ${words(component).join(" ")} `;
  return configuration.tractionBatteryComponentTerms.some((term) => {
    const phrase = words(term).join(" ");
    return phrase !== "" && haystack.includes(` ${phrase} `);
  });
}

/** The candidate this hit makes for this identity, or `null` where it is not one. */
export function candidateFor(
  identity: RecallIdentity,
  hit: RecallHit,
  configuration: RecallMatchConfiguration,
): RecallCandidate | null {
  if (hit.source !== identity.source) return null;

  if (identity.kind === "source_vehicle") {
    const makeAgrees =
      firstAgreeing(
        [{ field: "make", value: identity.make }],
        hit.makers,
        (value) => normalizeMakerName(value, configuration),
      ) !== null;
    const modelAgrees =
      firstAgreeing(
        [{ field: "model", value: identity.model }],
        hit.models,
        normalizePartNumber,
      ) !== null;
    const yearAgrees = hit.modelYear === identity.modelYear;
    if (
      !makeAgrees ||
      !modelAgrees ||
      !yearAgrees ||
      !namesTractionBattery(hit.component, configuration)
    ) {
      return null;
    }
    return {
      identity: identity.kind,
      hit,
      fields: ["make", "model", "model_year", "component"],
    };
  }

  const maker = firstAgreeing(identity.makers, hit.makers, (value) =>
    normalizeMakerName(value, configuration),
  );
  const model = firstAgreeing(identity.models, hit.models, normalizePartNumber);
  if (maker === null || model === null) return null;
  return { identity: identity.kind, hit, fields: [maker, model] };
}

/** Every candidate among the hits, at most one per recall. */
export function candidatesFor(
  identity: RecallIdentity,
  hits: readonly RecallHit[],
  configuration: RecallMatchConfiguration,
): readonly RecallCandidate[] {
  const seen = new Set<string>();
  const out: RecallCandidate[] = [];
  for (const hit of hits) {
    if (seen.has(hit.providerRecordId)) continue;
    const candidate = candidateFor(identity, hit, configuration);
    if (candidate === null) continue;
    seen.add(hit.providerRecordId);
    out.push(candidate);
  }
  return out;
}

const FIELD_WORDS: Readonly<Record<RecallMatchField, string>> = {
  manufacturer: "manufacturer",
  brand: "brand",
  model: "model",
  part_number: "part number",
  make: "make",
  model_year: "model year",
  component: "component",
};

function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function capitalized(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * "Matched on:", in words — Rule 10.13. **Never a number.**
 *
 * `Brand and model match recall 24-123.` · `Device make and model match
 * recall 26-112.` · `Vehicle make, model and model year match recall 26V-118,
 * and its component names the propulsion or traction battery.`
 */
export function matchedOnWords(
  identity: RecallIdentityKind,
  fields: readonly RecallMatchField[],
  recallNumber: string,
): string {
  const agreeing = fields.filter((field) => field !== "component");
  const named = list(agreeing.map((field) => FIELD_WORDS[field]));
  const subject =
    identity === "source_vehicle"
      ? `Vehicle ${named}`
      : identity === "source_device"
        ? `Device ${named}`
        : capitalized(named);
  const component = fields.includes("component")
    ? ", and its component names the propulsion or traction battery"
    : "";
  return `${subject} match recall ${recallNumber}${component}.`;
}
