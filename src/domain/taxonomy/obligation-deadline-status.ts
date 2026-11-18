/**
 * T-69 · Obligation deadline status
 *
 * **Stored on:** `obligation_deadline.status`
 * **Cardinality:** single-select · **Phase:** B1b (from `b1b-12`)
 *
 * Where one dated deadline stands (Rule 8.12). **Overdue is shown from the
 * date; it is not a stored value.** Done needs a date and a note. A run never
 * undoes a completion; when an obligation stops applying, its open deadlines
 * become `withdrawn` and its done ones stay done.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-69, which is the
 * single source of truth. This module owns the stored value, the value order
 * and the display label, and owns no transition.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const OBLIGATION_DEADLINE_STATUSES = [
  "open",
  "completed",
  "withdrawn",
] as const;

export type ObligationDeadlineStatus =
  (typeof OBLIGATION_DEADLINE_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-69 label exists in this
 * codebase** (TAXONOMY.md §5.3).
 */
export const OBLIGATION_DEADLINE_STATUS_LABELS: Readonly<
  Record<ObligationDeadlineStatus, string>
> = {
  open: "Open",
  completed: "Done",
  withdrawn: "Withdrawn",
};
