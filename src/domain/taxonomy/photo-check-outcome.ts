import type { PhotoCheckKind } from "./photo-check-kind";

/**
 * T-66 · Photo check outcome
 *
 * **Stored on:** `photo_check.outcome`
 * **Cardinality:** single-select · **Phase:** B2 (from `b2-10`)
 *
 * What a photo check run concluded, as one closed value and never a number
 * (Rules 1.25, 2.36, 2.37, 6.25). `failed` carries its reason code on the run
 * and is **never shown as any other outcome**: a failed check is not "looks
 * like the reference", not "no suggestions" and not "no copy found" (Rules
 * 2.36, 6.26).
 *
 * "No suggestions" (`nothing_proposed`) is **never a finding and never "none
 * observed"** — a person still inspects (Rule 6.25).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-66, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — the display label, and which
 * kind each value belongs to, which T-66's definitions state; it owns no
 * transition.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const PHOTO_CHECK_OUTCOMES = [
  "proposed",
  "nothing_proposed",
  "looks_consistent",
  "looks_different",
  "cannot_compare",
  "no_reference",
  "copy_found",
  "no_copy_found",
  "failed",
] as const;

export type PhotoCheckOutcome = (typeof PHOTO_CHECK_OUTCOMES)[number];

/**
 * Stored value to display label. **The only place a T-66 label exists in this
 * codebase** (TAXONOMY.md §5.3).
 */
export const PHOTO_CHECK_OUTCOME_LABELS: Readonly<
  Record<PhotoCheckOutcome, string>
> = {
  proposed: "Suggestions made",
  nothing_proposed: "No suggestions",
  looks_consistent: "Looks like the reference",
  looks_different: "Looks different from the reference",
  cannot_compare: "Could not compare",
  no_reference: "No reference photo on file",
  copy_found: "Looks like a copy",
  no_copy_found: "No copy found",
  failed: "Check failed",
};

/**
 * The outcomes each kind may record, as T-66's definitions assign them.
 * `failed` belongs to every kind. A run whose outcome is not its kind's is a
 * defect the writer refuses rather than stores.
 */
export const PHOTO_CHECK_OUTCOMES_BY_KIND: Readonly<
  Record<PhotoCheckKind, readonly PhotoCheckOutcome[]>
> = {
  damage_proposal: ["proposed", "nothing_proposed", "failed"],
  label_look: [
    "looks_consistent",
    "looks_different",
    "cannot_compare",
    "no_reference",
    "failed",
  ],
  look_alike: ["copy_found", "no_copy_found", "failed"],
};
