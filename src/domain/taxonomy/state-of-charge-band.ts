/**
 * T-21 · State-of-charge band
 *
 * **Stored on:** `battery_record.state_of_charge_band`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records charge level at intake against the applicable storage limit, because charge level has a large documented difference in handling severity and a direct regulatory hook.
 *
 * **The band, not a number.** The storage limit that defines the band is
 * jurisdiction data, so the band name carries no threshold (Rule 1.23). The
 * observed figure is kept on `battery_record.state_of_charge_percent_at_intake`
 * and is never the filter column.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-21, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const STATE_OF_CHARGE_BANDS = [
  "at_or_below_storage_limit",
  "above_storage_limit",
  "not_captured",
] as const;

export type StateOfChargeBand = (typeof STATE_OF_CHARGE_BANDS)[number];

/**
 * Stored value to display label. **The only place a T-21 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const STATE_OF_CHARGE_BAND_LABELS: Readonly<
  Record<StateOfChargeBand, string>
> = {
  at_or_below_storage_limit: "At or below storage limit",
  above_storage_limit: "Above storage limit",
  not_captured: "Not captured",
};
