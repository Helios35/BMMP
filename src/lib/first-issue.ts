import type { z } from "zod";

/**
 * The first issue a parse produced, as a field name and a message.
 *
 * One issue at a time, on the field it belongs to (`TECHNICAL_SPEC.md` §10.3 —
 * never a page replacement). Returning every issue at once on a four-field
 * form buries the one the person is looking at. Lifted here when the fourth
 * feature needed it (`b2-09`); every feature's `schemas.ts` re-exports it.
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
