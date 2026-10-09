"use server";

import { data } from "@/data";
import { canReadRoute } from "@/domain/access/route-capability";
import { requestAttribution } from "@/features/intake/server/session-action";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { recordNotFound } from "@/lib/auth/record-denial";
import { publicContext, resolveRequestContext } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";

import { recordDocumentAccess } from "./server/document-events";

/**
 * Print, for a render with **no stored file** — `UX_SPEC.md` §2.8, §3.14.
 *
 * A render with stored bytes prints and downloads through its stream route
 * (`GET /api/documents/[id]/pdf`), which records the read itself. This action
 * serves the renders written before document generation, whose page is
 * composed from their rows: the print is recorded first (T-43
 * `document.reprinted`), and a print that could not be recorded does not
 * start.
 *
 * **Never refused by role.** Every member reads `/documents/[id]`, and reading
 * and printing evidence is the auditor's whole task (Rule 5.27), so the only
 * gate is a signed-in member of the render's organization — a render in
 * another tenant is indistinguishable from none (Rule 1.2).
 */

const ROUTE = "/documents/[id]";

export async function recordDocumentPrint(
  input: unknown,
): Promise<ActionResult<null>> {
  const resolution = await resolveRequestContext();
  if (resolution.kind !== "resolved") {
    const pub = await publicContext();
    return actionFailed<null>({
      code: "UNAUTHENTICATED",
      message: "You were signed out. Sign in again and try that once more.",
      correlationId: pub.correlationId,
    });
  }
  const { ctx } = resolution.session;
  if (!canReadRoute(ctx.role, ROUTE)) {
    return actionFailed<null>({
      code: "FORBIDDEN",
      message: "Your role cannot open documents.",
      correlationId: ctx.correlationId,
    });
  }
  const renderId =
    typeof input === "object" && input !== null && "renderId" in input
      ? (input as { readonly renderId: unknown }).renderId
      : null;
  if (typeof renderId !== "string") {
    return actionFailed<null>({
      code: "VALIDATION",
      message: "That document could not be found.",
      correlationId: ctx.correlationId,
    });
  }
  try {
    const render = await data.documentRenders.get(ctx, renderId);
    if (render === null) {
      await recordNotFound(ctx, "document_render", renderId);
      throw new NotFoundError({
        userMessage: "That document could not be found.",
        correlationId: ctx.correlationId,
      });
    }
    await recordDocumentAccess(
      ctx,
      render,
      "document.reprinted",
      await requestAttribution(),
    );
    return actionSucceeded(null);
  } catch (error) {
    return actionFailedFrom<null>(error, ctx.correlationId);
  }
}
