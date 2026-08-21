/**
 * T-51 · Label crop method
 *
 * **Stored on:** `intake_photo.crop_method`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records whether the label region was found by the vision provider or drawn by a person.
 *
 * **Single-select**, and set on `label_crop` rows only.
 *
 * **Both are ordinary outcomes. Neither is an error state** (`ERD.md` §5.4). The
 * manual path is always available and never hidden (`TECHNICAL_SPEC.md` §11.1
 * step 2), and a `manual` crop carries no penalty in the confidence gate, in
 * review, or in training eligibility.
 *
 * **There is no third value.** A crop is drawn by a machine or by a person.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-51, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const LABEL_CROP_METHODS = ["auto_detected", "manual"] as const;

export type LabelCropMethod = (typeof LABEL_CROP_METHODS)[number];

/**
 * Stored value to display label. **The only place a T-51 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const LABEL_CROP_METHOD_LABELS: Readonly<
  Record<LabelCropMethod, string>
> = {
  auto_detected: "Detected automatically",
  manual: "Drawn by hand",
};
