import "server-only";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { z } from "zod";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import type { AppRoute } from "@/domain/access/routes";
import { requireIntakeGate } from "@/features/consent/read-intake-gate";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { requireWrite } from "@/lib/auth/guard";
import { recordNotFound } from "@/lib/auth/record-denial";
import { NotFoundError } from "@/lib/errors";

import { firstIssue } from "../schemas";
import { sessionThread, type RequestAttribution } from "./audit";

/**
 * Steps 1–3 and 5 of every Server Action that writes an intake session —
 * `TECHNICAL_SPEC.md` §7.1.
 *
 * **One wrapper, two doors.** `/batteries/new` and `/review` both write
 * intake sessions, and a queue item is resolved through the same commit the
 * intake flow uses (`./commit.ts`). What differs is the guard: an action on
 * `/review` is refused on `/review`'s capability, so a Facility Manager — who
 * reads the queue and never confirms from it (Rule 2.22) — is refused with
 * that route's reason and the refusal is audited as an attempt on that route
 * (Rules 1.16, 12.6). The route is an argument here for that reason alone; the
 * rest is identical on both doors.
 *
 * The steps, in order: (1) the write guard for `route`, (2) the Terms of
 * Service gate — the block is on intake, not the app, and resolving a queue
 * item logs a battery (Rules 7.1, 7.2), (3) a zod parse, (4) `run`, (5)
 * `revalidatePath(route)`. It returns `ActionResult` and never throws across
 * the boundary.
 *
 * `run` is step 4. A thrown `AppError` becomes the returned failure with its
 * code, field and correlation id intact; a `NotFoundError` on the session is
 * also recorded as a denial, because an identifier that resolves to nothing
 * is an attempt (§5.3(5), E-15) — and it reads the same whether the row is
 * absent or another tenant's (Rule 1.2).
 *
 * **One intake, one thread.** Once the parsed input names a session that
 * resolves in this tenant, the handler runs — and every failure envelope and
 * denial row after that point is built — as the session's thread
 * (`sessionThread`), so `/audit` reads the start, each photo, the read, the
 * confirmations, the commit and any refusal under `intake_session.
 * correlation_id`, whichever route the request came from. A session that does
 * not resolve keeps the request's own id, and so does the `NotFound` denial
 * it records: there was no session to thread it on.
 */
export async function sessionAction<TInput, TData>(
  route: AppRoute,
  attempted: string,
  schema: z.ZodType<TInput>,
  input: unknown,
  run: (
    ctx: RequestContext,
    parsed: TInput,
    attribution: RequestAttribution,
  ) => Promise<TData>,
): Promise<ActionResult<TData>> {
  const guard = await requireWrite(route, attempted);
  if (!guard.ok) return guard;
  const { ctx } = guard;

  const blocked = await requireIntakeGate(ctx);
  if (blocked !== null) return blocked;

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = firstIssue(parsed.error);
    return actionFailed<TData>({
      code: "VALIDATION",
      message: issue.message,
      ...(issue.field === undefined ? {} : { field: issue.field }),
      correlationId: ctx.correlationId,
    });
  }

  // The request's own context until the session is known; the session's
  // thread from then on. Declared outside the `try` so the `catch` answers
  // with whichever id the failure happened under.
  let bound: RequestContext = ctx;
  const sessionId = (parsed.data as { sessionId?: unknown }).sessionId;
  try {
    if (typeof sessionId === "string") {
      const session = await data.intakeSessions.get(ctx, sessionId);
      if (session !== null) bound = sessionThread(ctx, session);
    }
    const attribution = await requestAttribution();
    const result = await run(bound, parsed.data, attribution);
    revalidatePath(route);
    return actionSucceeded(result);
  } catch (error) {
    if (error instanceof NotFoundError && typeof sessionId === "string") {
      await recordNotFound(bound, "intake_session", sessionId);
    }
    return actionFailedFrom<TData>(error, bound.correlationId);
  }
}

/** The caller's request, as the audit row records it. Read once per action. */
export async function requestAttribution(): Promise<RequestAttribution> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const firstAddress = forwarded?.split(",")[0]?.trim();
  return {
    requestId: headerList.get("x-request-id"),
    ipAddress:
      firstAddress === undefined || firstAddress === "" ? null : firstAddress,
    userAgent: headerList.get("user-agent"),
  };
}
