import type { PhotoCheckOutcome } from "@/domain/taxonomy/photo-check-outcome";
import type { Uuid } from "@/types/common";

/**
 * The label look check — Rule 2.36; D-56 level 2, D-68, D-75 #1, #7; T-52
 * `label_look_differs`, T-66.
 *
 * **A reason to look, never a verdict.** The record's label crop — or its
 * label photo when there is no crop — is compared with the matched catalog
 * entry's current reference photo by the vision model, which answers with one
 * of three closed values and no words. Only **looks different** routes the
 * record to review. **Could not compare**, **no reference on file** and
 * **failed** are recorded and none of them flags (D-75 #7) — and none of them
 * ever reads as "looks like the reference" (Rule 2.36).
 *
 * Pure.
 */

/** What the model may answer. `no_reference` and `failed` are the caller's, never the model's. */
export const LABEL_LOOK_MODEL_OUTCOMES = [
  "looks_consistent",
  "looks_different",
  "cannot_compare",
] as const satisfies readonly PhotoCheckOutcome[];

export type LabelLookModelOutcome = (typeof LABEL_LOOK_MODEL_OUTCOMES)[number];

/** Whether a label look outcome sends the record to review. Exactly one does. */
export function labelLookRoutesToReview(outcome: PhotoCheckOutcome): boolean {
  return outcome === "looks_different";
}

/**
 * Which photo is compared (Rule 2.36): the label crop when the record has one,
 * the label photo otherwise, or nothing when there is neither.
 */
export function labelLookSubject<
  T extends { readonly id: Uuid; readonly photoType: string },
>(labelPhoto: T | null, crop: T | null): T | null {
  return crop ?? labelPhoto;
}
