/**
 * T-70 · Deadline due basis
 *
 * **Stored on:** `obligation_deadline.due_basis`
 * **Cardinality:** single-select · **Phase:** B1b (from `b1b-12`)
 *
 * Where a deadline's date came from in the rule (Rule 8.10): a date written in
 * the law, or a yearly date. **A date that waits on an event is not a deadline
 * and has no value here** — the obligation reads "No date yet" instead, and
 * no date is ever estimated.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-70, which is the
 * single source of truth. This module owns the stored value, the value order
 * and the display label, and owns no transition.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const DEADLINE_DUE_BASES = ["statutory_date", "annual"] as const;

export type DeadlineDueBasis = (typeof DEADLINE_DUE_BASES)[number];

/**
 * Stored value to display label. **The only place a T-70 label exists in this
 * codebase** (TAXONOMY.md §5.3).
 */
export const DEADLINE_DUE_BASIS_LABELS: Readonly<
  Record<DeadlineDueBasis, string>
> = {
  statutory_date: "Date in law",
  annual: "Every year",
};
