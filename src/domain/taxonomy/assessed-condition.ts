/**
 * T-49 · Assessed condition
 *
 * **Stored on:** `battery_record.assessed_condition`, `damage_assessment.assessed_condition`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records a human's judgment of a battery's physical condition at inspection. This is the third of the three hard-gated intake fields, and it is the input the damaged-or-defective determination and the air-transport prohibition both read.
 *
 * **Hard-gated.** One of the three fields that never auto-commit at any
 * confidence level (Rule 2.15, `TECHNICAL_SPEC.md` §11.1 step 3). A model may
 * propose it; **a model never sets it** (Rules 6.2, 6.6). Only P1 and P6 may
 * confirm it (Rule 2.22).
 *
 * **"Assessed," never "measured."** BMMP integrates third-party health testers;
 * it does not measure battery health. A measured instrument reading is stored on
 * the `instrument_*` columns of `damage_assessment`, is labelled and exported
 * separately, and **never merges into or silently replaces this value**
 * (Rules 2.27, 11.5; `_ANCHORS.md` §7.5).
 *
 * **This is not a grade.** T-31 is BMMP's published A/B/C/reject grading scheme
 * and is B2. This system is what a handler observes; T-31 is what BMMP concludes
 * (Rule 6.22).
 *
 * **A recall association reaches the same handling class without changing this
 * value.** An active recall sets `ddr_flags` and the air prohibition under
 * Rule 6.5 independently, because a recalled battery may be physically sound.
 * Never write `damaged_or_defective` because of a recall — the finding and the
 * recall are separate facts and an auditor will look for both.
 *
 * **Relationship to T-46.** T-46 is the *status of an assessment row*; this is
 * *what the assessment found*. `assessed_sound` (T-46) covers both `sound` and
 * `cosmetic_wear_only` here.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-49, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const ASSESSED_CONDITIONS = [
  "not_assessed",
  "sound",
  "cosmetic_wear_only",
  "damaged_or_defective",
] as const;

export type AssessedCondition = (typeof ASSESSED_CONDITIONS)[number];

/**
 * Stored value to display label. **The only place a T-49 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const ASSESSED_CONDITION_LABELS: Readonly<
  Record<AssessedCondition, string>
> = {
  not_assessed: "Not assessed",
  sound: "Sound",
  cosmetic_wear_only: "Cosmetic wear only",
  damaged_or_defective: "Damaged or defective",
};
