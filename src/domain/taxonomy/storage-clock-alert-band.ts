/**
 * T-27 · Storage clock alert band
 *
 * **Stored on:** `storage_clock.alert_band`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records which warning stage an accumulation clock has reached, so alerting is consistent without baking a day count into a stored value.
 *
 * **This is TAXONOMY.md §5.4's worked example, and the labels below are why.**
 * The stored value is `early`; the *offset* it corresponds to is configuration. A
 * site moving its first notice from 90 days to 75 changes one configuration value:
 * every existing row keeps `early`, every historical alert stays readable, and
 * nothing migrates.
 *
 * A stored value of `warning_90` or `90_day_notice` would make that offset change a
 * schema migration plus a backfill — and the backfill would be a lie, because those
 * alerts genuinely fired at 90 days.
 *
 * **The labels here carry no number.** A surface that wants '90-day notice' renders
 * the configured offset alongside this label; it never reads the number out of the
 * stored value, because the stored value does not contain one.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-27, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const STORAGE_CLOCK_ALERT_BANDS = [
  "none",
  "early",
  "mid",
  "final",
  "overdue",
] as const;

export type StorageClockAlertBand = (typeof STORAGE_CLOCK_ALERT_BANDS)[number];

/**
 * Stored value to display label. **The only place a T-27 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const STORAGE_CLOCK_ALERT_BAND_LABELS: Readonly<
  Record<StorageClockAlertBand, string>
> = {
  none: "No alert",
  early: "First notice",
  mid: "Second notice",
  final: "Final notice",
  overdue: "Overdue",
};
