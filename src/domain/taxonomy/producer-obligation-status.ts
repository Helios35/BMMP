/**
 * T-68 · Producer obligation status
 *
 * **Stored on:** `producer_obligation.status`
 * **Cardinality:** single-select · **Phase:** B1b (from `b1b-12`)
 *
 * Whether a state's obligation applies to the organization, from the products
 * it sells there (Rule 8.9). **Set by an evaluation run, never by a person.**
 * `undetermined` names the missing input and is **never treated as
 * `not_applicable`** — a gap is a gap, not an answer.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-68, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const PRODUCER_OBLIGATION_STATUSES = [
  "applies",
  "not_applicable",
  "undetermined",
] as const;

export type ProducerObligationStatus =
  (typeof PRODUCER_OBLIGATION_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-68 label exists in this
 * codebase** (TAXONOMY.md §5.3).
 */
export const PRODUCER_OBLIGATION_STATUS_LABELS: Readonly<
  Record<ProducerObligationStatus, string>
> = {
  applies: "Applies",
  not_applicable: "Doesn't apply",
  undetermined: "Can't tell yet",
};
