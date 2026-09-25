import type { StorageClockSubjectType } from "./storage-clock-subject-type";

/**
 * T-64 · Clock start basis
 *
 * **Stored on:** `storage_clock.clock_start_basis`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records the event that set the clock's start. Same events as T-62, stored separately because a battery-level clock has no container history of its own.
 *
 * **A battery's start date travels with it** (Rule 4.9): a `battery_record`
 * clock is only ever `first_placement`, and moving the battery never starts a
 * new one. **The clock never pauses** (Rule 4.6) — no value exists for pause,
 * hold, extension or restart. A start moved earlier re-computes `due_at` and
 * may make the subject overdue immediately (Rule 4.10).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-64, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — the display label, and the
 * subjects each value is valid for, which T-64's table states; it owns no
 * transition.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const CLOCK_START_BASES = [
  "first_placement",
  "inherited_on_receipt",
  "inherited_on_consolidation",
  "inherited_on_split",
] as const;

export type ClockStartBasis = (typeof CLOCK_START_BASES)[number];

/**
 * Stored value to display label. **The only place a T-64 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const CLOCK_START_BASIS_LABELS: Readonly<
  Record<ClockStartBasis, string>
> = {
  first_placement: "First battery placed",
  inherited_on_receipt: "Earlier date received",
  inherited_on_consolidation: "Earliest date on consolidation",
  inherited_on_split: "Earliest date on split",
};

/**
 * Which subjects each basis is valid for — T-64's "Valid for subject" column.
 *
 * Only a container inherits: a battery-level clock has no container history of
 * its own, so it is only ever `first_placement`.
 */
export const CLOCK_START_BASIS_SUBJECTS: Readonly<
  Record<ClockStartBasis, readonly StorageClockSubjectType[]>
> = {
  first_placement: ["container", "battery_record"],
  inherited_on_receipt: ["container"],
  inherited_on_consolidation: ["container"],
  inherited_on_split: ["container"],
};
