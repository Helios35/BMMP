/**
 * T-67 · Hazard ranking scope
 *
 * **Stored on:** `hazard_ranking.scope_type`
 * **Cardinality:** single-select · **Phase:** B2 (from `b2-11`)
 *
 * What a ranking row ranks: a held battery, a held container or a held lot.
 * **Each kind is ranked against its own kind only** (Rule 10.19), and the value
 * matches whichever of `battery_record_id`, `container_id` and `lot_id` is set
 * on the row.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-67, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const HAZARD_RANKING_SCOPES = [
  "battery_record",
  "container",
  "lot",
] as const;

export type HazardRankingScope = (typeof HAZARD_RANKING_SCOPES)[number];

/**
 * Stored value to display label. **The only place a T-67 label exists in this
 * codebase** (TAXONOMY.md §5.3).
 */
export const HAZARD_RANKING_SCOPE_LABELS: Readonly<
  Record<HazardRankingScope, string>
> = {
  battery_record: "Battery",
  container: "Container",
  lot: "Lot",
};
