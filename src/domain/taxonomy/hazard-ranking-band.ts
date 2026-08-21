/**
 * T-33 · Hazard ranking band
 *
 * **Stored on:** `hazard_ranking.band`
 * **Cardinality:** single-select per ranking row · **Phase:** B2
 *
 * Places a battery record in a **relative** band against a stated comparison set, so a facility manager can see what to look at first.
 *
 * **This is a relative ranking with a stated basis per factor. It is never a
 * probability, percentage, likelihood, score-out-of-ten, 'risk of fire' or 'chance
 * of thermal runaway'** — in UI copy, API responses, exports or PDFs
 * (`_ANCHORS.md` §7.1, `PROJECT_SETUP_BMMP.md` §8.3, Rules 1.25, 10.3, 10.5).
 *
 * A band is meaningless without its denominator: `hazard_ranking` carries
 * `rank_position` and `ranked_set_size` together, and the labels below say
 * 'in set' for that reason.
 *
 * The ordinal in `band_1`…`band_4` is permitted because the ordinal *is* the
 * meaning (TAXONOMY.md §4.4 rule 2).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-33, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const HAZARD_RANKING_BANDS = [
  "band_1",
  "band_2",
  "band_3",
  "band_4",
  "not_ranked",
] as const;

export type HazardRankingBand = (typeof HAZARD_RANKING_BANDS)[number];

/**
 * Stored value to display label. **The only place a T-33 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const HAZARD_RANKING_BAND_LABELS: Readonly<
  Record<HazardRankingBand, string>
> = {
  band_1: "Band 1 — highest relative ranking in set",
  band_2: "Band 2",
  band_3: "Band 3",
  band_4: "Band 4 — lowest relative ranking in set",
  not_ranked: "Not ranked",
};
