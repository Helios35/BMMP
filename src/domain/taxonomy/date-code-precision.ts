/**
 * T-56 · Date code precision
 *
 * **Stored on:** `date_code_decode.decoded_precision`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * States how precisely a printed date code resolves, so a year-only code is never displayed or exported as though it named a day.
 *
 * **`undecodable` is recorded as itself and never as an approximate date**
 * (Rule 2.24). A code that cannot be decoded produces no manufacture date — it
 * does not produce a fuzzy one.
 *
 * **Precision travels with the value everywhere.** A `year`-precision decode
 * renders as a year on screen, in exports and on any document that prints it.
 * Rendering it as 1 January is a defect.
 *
 * **A decoded date never overrides a date a person entered** (Rule 2.24).
 *
 * **A future-dated decode is a validation failure, not a fact** (EC-11) — it is
 * presented as unread with the raw code retained.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-56, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const DATE_CODE_PRECISIONS = [
  "day",
  "month",
  "quarter",
  "year",
  "undecodable",
] as const;

export type DateCodePrecision = (typeof DATE_CODE_PRECISIONS)[number];

/**
 * Stored value to display label. **The only place a T-56 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const DATE_CODE_PRECISION_LABELS: Readonly<
  Record<DateCodePrecision, string>
> = {
  day: "Day",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
  undecodable: "Could not be decoded",
};
