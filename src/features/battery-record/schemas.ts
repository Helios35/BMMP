import { z } from "zod";

import { DAMAGE_FINDING_TYPES } from "@/domain/taxonomy/damage-finding-type";

/**
 * Input parsing for the four write paths on `/batteries/[id]` —
 * `TECHNICAL_SPEC.md` §7.1 step 2, `UX_SPEC.md` §3.7.
 *
 * **Validation is server-side.** These run inside the Server Actions, where the
 * caller cannot skip them; the dialogs render the same requirements as a
 * courtesy so nobody learns a rule only after submitting. A field that reaches
 * a `damage_assessment` or a `classification_decision` reaches a document, so
 * the action's parse is the enforcement and the dialog's is not.
 *
 * What is **not** here, on purpose:
 *
 * - No finding is judged. `findingTypes` is checked for T-29 membership only;
 *   whether `none_observed` stands alone and what the set implies is
 *   `validateFindings` / `assessDamage` in `src/domain/condition` (Rules 6.3,
 *   6.4), and this file never re-derives that.
 * - No threshold, no rule, no jurisdiction value. Nothing on this surface is a
 *   regulatory number (Rule 1.23).
 */

const uuidField = z.string().trim().min(1, "This record could not be found.");

/** A free-text reason, trimmed; empty becomes absent so the action can decide whether it was required. */
const optionalReason = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const optionalId = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

/**
 * **Edit assessed condition** — Rules 6.2, 6.3, 6.11.
 *
 * `reason` and `clearingPhotoIntakePhotoId` are optional at the schema level
 * because whether they are required depends on the assessment being replaced
 * — a fact the action reads through `src/data`, never one the client is
 * trusted to state.
 */
export const recordDamageAssessmentSchema = z.object({
  recordId: uuidField,
  findingTypes: z
    .array(z.enum(DAMAGE_FINDING_TYPES))
    .min(1, "Choose at least one finding. None observed is a finding."),
  isDefective: z.boolean(),
  reason: optionalReason,
  clearingPhotoIntakePhotoId: optionalId,
});

export type RecordDamageAssessmentInput = z.infer<
  typeof recordDamageAssessmentSchema
>;

/** **Re-run catalog matching** — the read that lists candidates. */
export const findCatalogCandidatesSchema = z.object({
  recordId: uuidField,
});

export type FindCatalogCandidatesInput = z.infer<
  typeof findCatalogCandidatesSchema
>;

/** **Re-run catalog matching** — the human's pick (Rule 2.19: never auto-selected). */
export const applyCatalogRematchSchema = z.object({
  recordId: uuidField,
  catalogEntryId: z.string().trim().min(1, "Choose a catalog entry."),
});

export type ApplyCatalogRematchInput = z.infer<
  typeof applyCatalogRematchSchema
>;

/**
 * **Void this record** — Rule 3.25: the row and its decisions stay; the
 * status moves and the reason is recorded on the audit row.
 */
export const voidBatteryRecordSchema = z.object({
  recordId: uuidField,
  reason: z.string().trim().min(1, "Enter the reason this record is voided."),
});

export type VoidBatteryRecordInput = z.infer<typeof voidBatteryRecordSchema>;

/**
 * The first issue a parse produced, as a field name and a message.
 *
 * One issue at a time, on the field it belongs to (§10.3). The same helper
 * lives in `src/features/auth/schemas.ts`; it is small enough that a copy
 * costs less than a cross-feature import, and lifting it to `src/lib` is a
 * one-line follow-up once a third feature needs it.
 */
export function firstIssue(error: z.ZodError): {
  readonly field: string | undefined;
  readonly message: string;
} {
  const issue = error.issues[0];
  const path = issue?.path[0];
  return {
    field: typeof path === "string" ? path : undefined,
    message: issue?.message ?? "Check the details and try again.",
  };
}
