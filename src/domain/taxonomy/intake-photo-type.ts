/**
 * T-50 · Intake photo type
 *
 * **Stored on:** `intake_photo.photo_type`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Names what a captured image is, so the pipeline knows which image to read, which images are evidence, and which are the training pair.
 *
 * **Single-select**, assigned at capture by the surface that captured it.
 *
 * **`label_crop` is the only value that requires a parent.** Every other value
 * is a top-level capture with `parent_intake_photo_id` null.
 *
 * **The training pair is the `label_crop` plus the human-confirmed answer**
 * (Rule 7.10) — not the `label`, and not the `whole_pack`. Data-use eligibility
 * (T-12) is stamped once at capture on every row regardless of type and is never
 * recomputed by any role including P6.
 *
 * **A photo is never deleted to correct a mistake.** A wrongly-typed capture is
 * superseded by a new one; the original is retained for audit (Rule 12.13).
 *
 * **Form factor may be proposed from a `whole_pack` image and still passes the
 * confidence gate. It never implies, suggests or contributes to a chemistry
 * determination** (Rules 2.9, 2.25).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-50, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const INTAKE_PHOTO_TYPES = [
  "label",
  "label_crop",
  "whole_pack",
  "damage",
  "clearing_evidence",
] as const;

export type IntakePhotoType = (typeof INTAKE_PHOTO_TYPES)[number];

/**
 * Stored value to display label. **The only place a T-50 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const INTAKE_PHOTO_TYPE_LABELS: Readonly<
  Record<IntakePhotoType, string>
> = {
  label: "Label",
  label_crop: "Label crop",
  whole_pack: "Whole pack",
  damage: "Damage evidence",
  clearing_evidence: "Clearing evidence",
};
