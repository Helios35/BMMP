/**
 * T-63 · Storage clock subject type
 *
 * **Stored on:** `storage_clock.subject_type`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * States what a clock is running on. Rule 4.2 allows two demonstration methods.
 *
 * **Must match the non-null foreign key** — `container` ↔ `container_id`,
 * `battery_record` ↔ `battery_record_id`. Anything else is a defect, not a
 * state. **Changing a site's method (Rule 4.3) does not restart or re-type a
 * running clock.**
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-63, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const STORAGE_CLOCK_SUBJECT_TYPES = [
  "container",
  "battery_record",
] as const;

export type StorageClockSubjectType =
  (typeof STORAGE_CLOCK_SUBJECT_TYPES)[number];

/**
 * Stored value to display label. **The only place a T-63 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const STORAGE_CLOCK_SUBJECT_TYPE_LABELS: Readonly<
  Record<StorageClockSubjectType, string>
> = {
  container: "Container",
  battery_record: "Individual battery",
};
