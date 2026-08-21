/**
 * T-26 · Storage clock status
 *
 * **Stored on:** `storage_clock.status`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Tracks the accumulation clock that starts when material first enters a container, because demonstrating that clock through an inventory system is itself a compliance obligation.
 *
 * **The clock never pauses** (Rule 4.6). There is no hold, freeze, suspend or
 * extension anywhere in the schema or the API, and the absence of a pause value
 * here is part of that enforcement.
 *
 * The accumulation period is **read from the rule version in force**, never a
 * number in code (Rule 4.5). 'The one-year clock' is colloquial; the system never
 * assumes one year.
 *
 * `expired` was retired at TAXONOMY v1.2 and renamed `overdue`. A read path that
 * meets it renders it as-is, does not coerce it, and does not exclude it from
 * counts (TAXONOMY.md §5.8, §6).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-26, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const STORAGE_CLOCK_STATUSES = [
  "not_started",
  "running",
  "approaching_limit",
  "overdue",
  "stopped",
] as const;

export type StorageClockStatus = (typeof STORAGE_CLOCK_STATUSES)[number];

/**
 * Stored value to display label. **The only place a T-26 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const STORAGE_CLOCK_STATUS_LABELS: Readonly<
  Record<StorageClockStatus, string>
> = {
  not_started: "Not started",
  running: "Running",
  approaching_limit: "Approaching limit",
  overdue: "Overdue",
  stopped: "Stopped",
};
