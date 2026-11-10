/**
 * T-65 · Photo check kind
 *
 * **Stored on:** `photo_check.check_kind`
 * **Cardinality:** single-select · **Phase:** B2 (from `b2-10`)
 *
 * Which of the three photo checks a run was: the model's damage suggestions
 * (Rule 6.25), the label look check against the catalog reference (Rule 2.36),
 * or the copy check on a photo's look-alike fingerprint (Rule 2.37). Check runs
 * are append-only, and **no number is stored on a run**.
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-65, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const PHOTO_CHECK_KINDS = [
  "damage_proposal",
  "label_look",
  "look_alike",
] as const;

export type PhotoCheckKind = (typeof PHOTO_CHECK_KINDS)[number];

/**
 * Stored value to display label. **The only place a T-65 label exists in this
 * codebase** (TAXONOMY.md §5.3).
 */
export const PHOTO_CHECK_KIND_LABELS: Readonly<Record<PhotoCheckKind, string>> =
  {
    damage_proposal: "Damage suggestions",
    label_look: "Label look check",
    look_alike: "Copy check",
  };
