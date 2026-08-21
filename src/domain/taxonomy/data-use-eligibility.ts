/**
 * T-12 · Data-use eligibility
 *
 * **Stored on:** `intake_photo.data_use_eligibility`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records whether a captured image may be used for model training, determined by whether the tenant's Terms of Service grant was in force at the moment of capture.
 *
 * **Stamped once at capture and never recomputed or edited by any role, including
 * P6** (Rules 7.6, 7.7). `training_excluded` is terminal — a later acceptance does
 * not make an image eligible, and re-acceptance is never retroactive (Rule 7.17).
 *
 * This is the per-record fact. T-47 records organisational consent and never
 * governs what already happened.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-12, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const DATA_USE_ELIGIBILITIES = [
  "training_eligible",
  "training_excluded",
  "pending_determination",
] as const;

export type DataUseEligibility = (typeof DATA_USE_ELIGIBILITIES)[number];

/**
 * Stored value to display label. **The only place a T-12 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const DATA_USE_ELIGIBILITY_LABELS: Readonly<
  Record<DataUseEligibility, string>
> = {
  training_eligible: "Training eligible",
  training_excluded: "Training excluded",
  pending_determination: "Pending determination",
};
