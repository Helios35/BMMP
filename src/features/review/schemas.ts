import { z } from "zod";

import {
  confirmIntakeSchema,
  voidIntakeSessionSchema,
} from "@/features/intake/schemas";

/**
 * Input parsing for the `/review` writes — `TECHNICAL_SPEC.md` §7.1 step 3.
 *
 * A queue item that is an intake session is confirmed and voided with the
 * intake's own input shapes, because it is the intake's own commit and void
 * (`features/intake/server/commit.ts`). A Flow F raise is named by its own id.
 */

/** Shape limit on a typed reason — not a regulatory figure (Rule 1.23). */
const MAX_REASON_LENGTH = 500;

export const confirmReviewItemSchema = confirmIntakeSchema;

/** Rule 2.23 — the other way out, and only with a stated reason. */
export const voidReviewItemSchema = voidIntakeSessionSchema;

export const confirmRematchSchema = z.object({ raiseId: z.uuid() });

/**
 * Keeping the record as it is identified, with the reason a person gives —
 * the second way out of a Flow F raise (Rule 2.23).
 */
export const declineRematchSchema = z.object({
  raiseId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "State why this record does not match the approved entry.")
    .max(MAX_REASON_LENGTH),
});
