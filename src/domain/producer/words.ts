import { basisCivilDate } from "@/domain/hazard/words";
import { FORMAT_CATEGORY_LABELS } from "@/domain/taxonomy/format-category";

import type { Due } from "./payloads";

/**
 * The fixed words of the obligations surface — Rules 8.7, 8.10, 8.14 — so the
 * page, the panel and the CSV say the same thing. **No limit, date, citation
 * or label from any law is here** (Rule 1.23); those come from the rule data
 * and are only placed into these sentences.
 */

/** Rule 8.7 — a state with no rules on file. Never "none apply". */
export function noRulesOnFile(stateName: string): string {
  return `No producer rules on file for ${stateName}. This doesn't mean none apply.`;
}

/** Rule 8.10 — a date that waits on an event. Never estimated. */
export const NO_DATE_YET = "No date yet";

/** UX §3.21 — the header's basis line. */
export function basisLine(checkedAt: string | null): string {
  const base =
    "From your products and the states you sell in, checked against the rule data on file.";
  return checkedAt === null
    ? `${base} Not checked yet.`
    : `${base} Checked ${checkedAt}.`;
}

/** Rule 8.8 — exclusions a product's facts can't test. */
export function notCheckedWords(exclusions: readonly string[]): string | null {
  return exclusions.length === 0
    ? null
    : `Not checked: ${exclusions.join("; ")}`;
}

/** How a due rule reads: "1 Jan 2027", "Every year on 1 Jul, from 1 Jul 2025", "No date yet — …". */
export function dueWords(due: Due): string {
  switch (due.kind) {
    case "statutory_date":
      return basisCivilDate(due.on);
    case "annual":
      return `Every year on ${basisCivilDate(due.firstOn).replace(/ \d{4}$/u, "")}, from ${basisCivilDate(due.firstOn)}`;
    case "no_date":
      return `${NO_DATE_YET} — ${due.event}`;
  }
}

/** A rule version as Rule 8.14 shows it: "version 2026-01-16, in force from 16 Jan 2026". */
export function versionWords(input: {
  readonly versionLabel: string;
  readonly effectiveOn: string;
}): string {
  return `version ${input.versionLabel}, in force from ${basisCivilDate(input.effectiveOn)}`;
}

/** A later version, shown with its date (Rule 8.14). */
export function laterVersionWords(input: {
  readonly versionLabel: string;
  readonly effectiveOn: string;
  readonly citation: string;
}): string {
  return `A new version (${input.versionLabel}) takes effect ${basisCivilDate(input.effectiveOn)}: ${input.citation}.`;
}

/** Stewardship organizations, as the rule data names them — never an endorsement. */
export function stewardshipWords(names: readonly string[]): string | null {
  return names.length === 0
    ? null
    : `Stewardship organizations named in the rule data: ${names.join("; ")}. Shown as the rule data names them, not as a recommendation.`;
}

/** Who can fix a missing catalog value (UX §3.21). */
export const MISSING_VALUE_FIXER =
  "An Admin can add the missing value to the catalog entry.";

/**
 * "Medium format battery in WA · Not covered in DC · Can't tell in OR: energy
 * not recorded". `stateLabel` is the jurisdiction row's own subdivision code
 * or name — never a substring of its code (T-40).
 */
export function bandInStateWords(input: {
  readonly bandWords: string;
  readonly band: keyof typeof FORMAT_CATEGORY_LABELS;
  readonly stateLabel: string;
}): string {
  if (input.band === "not_covered") return `Not covered in ${input.stateLabel}`;
  if (input.band === "undetermined") {
    const why = input.bandWords.replace(/^Can't tell:?\s*/u, "");
    return why === ""
      ? `Can't tell in ${input.stateLabel}`
      : `Can't tell in ${input.stateLabel}: ${why}`;
  }
  return `${input.bandWords} in ${input.stateLabel}`;
}
