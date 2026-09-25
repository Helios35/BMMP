"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { RequestContext } from "@/data/contracts";
import type { RequestAttribution } from "@/features/intake/server/audit";
import { requestAttribution } from "@/features/intake/server/session-action";
import { firstIssue } from "@/features/intake/schemas";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { requireWrite } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import { NotFoundError } from "@/lib/errors";
import type { IsoTimestamp } from "@/types/common";

import {
  approveProposal,
  rejectProposal,
  type ApprovalOutcome,
} from "./server/proposals";

/**
 * The `/settings/catalog` Server Actions — `UX_SPEC.md` §3.19;
 * `TECHNICAL_SPEC.md` §7.3 (`publishCatalogEntry` — P6 only);
 * `SITE_ARCHITECTURE.md` Flow F.
 *
 * **P6 only**, guarded on the route's capability: every other role is refused
 * by the server with the stated reason and the attempt is audited
 * (Rules 1.16, 12.6). Each decision needs a stated reason (§3.19: *"Approve /
 * Reject with a required reason"*), which is kept on the audit row.
 *
 * Not optimistic: the screen re-reads what the server wrote.
 */

const ROUTE = "/settings/catalog" as const;

/** Shape limit on a typed reason — not a regulatory figure (Rule 1.23). */
const MAX_REASON_LENGTH = 500;

const decisionSchema = z.object({
  catalogEntryId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "State the reason for this decision.")
    .max(MAX_REASON_LENGTH),
});

type Decision = z.infer<typeof decisionSchema>;

async function decide<T>(
  attempted: string,
  input: unknown,
  run: (
    ctx: RequestContext,
    parsed: Decision,
    at: IsoTimestamp,
    attribution: RequestAttribution,
  ) => Promise<T>,
): Promise<ActionResult<T>> {
  const guard = await requireWrite(ROUTE, attempted);
  if (!guard.ok) return guard;
  const { ctx } = guard;

  const parsed = decisionSchema.safeParse(input);
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
    const result = await run(
      ctx,
      parsed.data,
      new Date().toISOString(),
      await requestAttribution(),
    );
    revalidatePath(ROUTE);
    revalidatePath("/catalog");
    revalidatePath("/review");
    return actionSucceeded(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      await recordNotFound(ctx, "catalog_entry", parsed.data.catalogEntryId);
    }
    return actionFailedFrom(error, ctx.correlationId);
  }
}

/** Publish the entry and raise its unmatched records on `/review` (Flow F step 4). */
export async function approveCatalogProposal(
  input: unknown,
): Promise<ActionResult<ApprovalOutcome>> {
  return decide(
    "approveCatalogProposal",
    input,
    (ctx, parsed, at, attribution) =>
      approveProposal(
        ctx,
        parsed.catalogEntryId,
        parsed.reason,
        at,
        attribution,
      ),
  );
}

/** Reject the proposal — terminal (T-07). The proposing record is untouched. */
export async function rejectCatalogProposal(
  input: unknown,
): Promise<ActionResult<{ readonly catalogEntryId: string }>> {
  return decide(
    "rejectCatalogProposal",
    input,
    (ctx, parsed, at, attribution) =>
      rejectProposal(
        ctx,
        parsed.catalogEntryId,
        parsed.reason,
        at,
        attribution,
      ),
  );
}
