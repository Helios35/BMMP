"use server";

import { revalidatePath } from "next/cache";

import type { RequestContext } from "@/data/contracts";
import { commitIntake, voidIntake } from "@/features/intake/server/commit";
import { sessionAction } from "@/features/intake/server/session-action";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { requireWrite } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import { NotFoundError } from "@/lib/errors";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { z } from "zod";

import { firstIssue } from "@/features/intake/schemas";
import { REVIEW_ROUTE } from "./review-hrefs";
import {
  confirmRematchSchema,
  confirmReviewItemSchema,
  declineRematchSchema,
  voidReviewItemSchema,
} from "./schemas";
import { confirmRematchRaise, declineRematchRaise } from "./server/rematch";

/**
 * The `/review` Server Actions — `UX_SPEC.md` §3.8a, E-8b;
 * `TECHNICAL_SPEC.md` §7.1, §7.3 (`resolveReviewItem`); Rules 2.22, 2.23,
 * 12.6.
 *
 * **Exactly two ways out of the queue, for every item**: a person confirms it,
 * or a person voids it with a stated reason (Rule 2.23). There is no bulk
 * action here, no dismiss, no snooze and no age-out, and there never will be
 * (D-33).
 *
 * **Guarded on `/review`, not on the intake route.** Every action here opens
 * with `requireWrite("/review", …)`, so a Facility Manager — who reads the
 * queue and holds no confirm (Rule 2.22) — is refused **by the server** with
 * that route's stated reason and the refusal is written to the audit log as
 * an attempt (Rules 1.16, 12.6). Her screen renders no confirm and no void at
 * all (E-8b), and that absence is a courtesy: **composition is never the
 * enforcement**, and the two are independent.
 *
 * **No second commit path.** An intake item commits through `commitIntake`
 * and voids through `voidIntake` — the functions `/batteries/new` calls
 * (`features/intake/server/commit.ts`). A Flow F raise confirms through the
 * record's own re-match path (`applyCatalogRematch`).
 *
 * Nothing is optimistic: each action returns what the server wrote, and the
 * screen re-reads (§6.4).
 */

function now(): IsoTimestamp {
  return new Date().toISOString();
}

export interface ResolvedReviewItem {
  readonly batteryRecordId: Uuid;
  readonly recordNumber: string;
}

// --- an intake held at the gate --------------------------------------------------------

/**
 * **Confirm and commit** (§3.8a) — the queue item's primary. The draft the
 * card and the condition form wrote is committed exactly as step 3 of
 * `/batteries/new` would commit it, D-42 included.
 */
export async function confirmReviewItem(
  input: unknown,
): Promise<ActionResult<ResolvedReviewItem>> {
  return sessionAction(
    REVIEW_ROUTE,
    "confirmReviewItem",
    confirmReviewItemSchema,
    input,
    async (ctx, parsed, attribution) => {
      const committed = await commitIntake(
        ctx,
        parsed.sessionId,
        attribution,
        now(),
      );
      revalidatePath("/");
      return {
        batteryRecordId: committed.batteryRecordId,
        recordNumber: committed.recordNumber,
      };
    },
  );
}

/** **Void this item** (§2.1.5) — with a stated reason, and everything retained (Rule 2.1). */
export async function voidReviewItem(
  input: unknown,
): Promise<ActionResult<ResolvedReviewItem>> {
  return sessionAction(
    REVIEW_ROUTE,
    "voidReviewItem",
    voidReviewItemSchema,
    input,
    async (ctx, parsed, attribution) => {
      const voided = await voidIntake(
        ctx,
        parsed.sessionId,
        parsed.reason,
        attribution,
        now(),
      );
      revalidatePath("/");
      return {
        batteryRecordId: voided.batteryRecordId,
        recordNumber: voided.recordNumber,
      };
    },
  );
}

// --- a Flow F raise ----------------------------------------------------------------

/**
 * The raise-shaped twin of `sessionAction`: the same guard on `/review`, the
 * same parse and the same envelope, with the raise as the thing that must
 * resolve. An absent or another tenant's raise reads as not found and is
 * recorded as an attempt (§5.3(5), Rule 1.2).
 */
async function rematchAction<TInput extends { readonly raiseId: string }>(
  attempted: string,
  schema: z.ZodType<TInput>,
  input: unknown,
  run: (ctx: RequestContext, parsed: TInput) => Promise<ResolvedReviewItem>,
): Promise<ActionResult<ResolvedReviewItem>> {
  const guard = await requireWrite(REVIEW_ROUTE, attempted);
  if (!guard.ok) return guard;
  const { ctx } = guard;

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = firstIssue(parsed.error);
    return actionFailed({
      code: "VALIDATION",
      message: issue.message,
      ...(issue.field === undefined ? {} : { field: issue.field }),
      correlationId: ctx.correlationId,
    });
  }

  try {
    const result = await run(ctx, parsed.data);
    revalidatePath(REVIEW_ROUTE);
    revalidatePath("/");
    revalidatePath(`/batteries/${result.batteryRecordId}`);
    return actionSucceeded(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      await recordNotFound(ctx, "alert", parsed.data.raiseId);
    }
    return actionFailedFrom(error, ctx.correlationId);
  }
}

/**
 * **Confirm the match** — the entry's chemistry and identifiers become the
 * record's, confirmed by this person now (Rule 2.32), audited as
 * `battery_record.confirmed`, and the record is re-classified (EC-13).
 */
export async function confirmRematch(
  input: unknown,
): Promise<ActionResult<ResolvedReviewItem>> {
  return rematchAction(
    "confirmRematch",
    confirmRematchSchema,
    input,
    (ctx, parsed) => confirmRematchRaise(ctx, parsed.raiseId, now()),
  );
}

/**
 * **Keep as identified** — a handler's rejection of a match always wins over
 * the match (EC-10). The record is untouched; the reason stays on the raise.
 */
export async function declineRematch(
  input: unknown,
): Promise<ActionResult<ResolvedReviewItem>> {
  return rematchAction(
    "declineRematch",
    declineRematchSchema,
    input,
    (ctx, parsed) =>
      declineRematchRaise(ctx, parsed.raiseId, parsed.reason, now()),
  );
}
