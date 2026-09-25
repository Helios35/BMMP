"use server";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import type { DownloadedDocument } from "@/components/documents/document-viewer";
import { canReadRoute } from "@/domain/access/route-capability";
import { actorTypeFor } from "@/features/intake/server/audit";
import { requestAttribution } from "@/features/intake/server/session-action";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { recordNotFound } from "@/lib/auth/record-denial";
import {
  nowIso,
  publicContext,
  resolveRequestContext,
} from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import type { AuditEventType } from "@/domain/taxonomy/audit-event-type";
import type { DocumentRender } from "@/types/documents";

/**
 * Print and Download on `/documents/[id]` — `UX_SPEC.md` §2.8, §3.14.
 *
 * **Never refused by role.** Every member reads `/documents/[id]`, and reading
 * and printing evidence is the auditor's whole task (Rule 5.27), so the only
 * gate is a signed-in member of the render's organization — a render in
 * another tenant is indistinguishable from none (Rule 1.2).
 *
 * **Every print is recorded first** (T-43 `document.reprinted`: *"an issued
 * document's stored bytes streamed again for print — a reprint never
 * re-renders"*), and a stream of the stored bytes to a reader is
 * `document.viewed`. Both go through the `security definer` door, because P5
 * holds no INSERT on `audit_event` and her print is exactly the act that must
 * be on the record (Rules 12.3, 12.6).
 */

const ROUTE = "/documents/[id]";

async function withRender<T>(
  input: unknown,
  run: (ctx: RequestContext, render: DocumentRender) => Promise<T>,
): Promise<ActionResult<T>> {
  const resolution = await resolveRequestContext();
  if (resolution.kind !== "resolved") {
    const pub = await publicContext();
    return actionFailed<T>({
      code: "UNAUTHENTICATED",
      message: "You were signed out. Sign in again and try that once more.",
      correlationId: pub.correlationId,
    });
  }
  const { ctx } = resolution.session;
  if (!canReadRoute(ctx.role, ROUTE)) {
    return actionFailed<T>({
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
    return actionFailed<T>({
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
    return actionSucceeded(await run(ctx, render));
  } catch (error) {
    return actionFailedFrom<T>(error, ctx.correlationId);
  }
}

async function audit(
  ctx: RequestContext,
  render: DocumentRender,
  eventType: AuditEventType,
): Promise<void> {
  const attribution = await requestAttribution();
  const at = nowIso();
  await data.auditEvents.write(ctx, {
    actorUserId: ctx.userId,
    actorType: actorTypeFor(ctx),
    actorLabel: null,
    eventType,
    entityTable: "document_render",
    entityId: render.id,
    occurredAt: at,
    recordedAt: at,
    beforeState: null,
    afterState: {
      documentType: render.documentType,
      status: render.status,
      verificationCode: render.verificationCode,
    },
    changedFields: null,
    governingRuleVersionId: null,
    ruleVersionsApplied: null,
    correlationId: ctx.correlationId,
    requestId: attribution.requestId,
    ipAddress: attribution.ipAddress,
    userAgent: attribution.userAgent,
    reason: null,
  });
}

/** Records the print before the browser prints. A print that is not recorded does not start. */
export async function recordDocumentPrint(
  input: unknown,
): Promise<ActionResult<null>> {
  return withRender(input, async (ctx, render) => {
    await audit(ctx, render, "document.reprinted");
    return null;
  });
}

/**
 * Streams the stored bytes — the file that was issued, never a re-render
 * (`TECHNICAL_SPEC.md` §8.4). A render whose bytes are not stored says so and
 * nothing downloads; it is never served as if it had passed.
 */
export async function downloadDocument(
  input: unknown,
): Promise<ActionResult<DownloadedDocument>> {
  return withRender(input, async (ctx, render) => {
    let stored: Awaited<ReturnType<typeof data.documentRenders.readBytes>>;
    try {
      stored = await data.documentRenders.readBytes(ctx, render.id);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError({
          userMessage:
            "This render's stored file is not available on the mock adapter, so nothing was downloaded. Print prints the page shown here.",
          correlationId: ctx.correlationId,
          context: { documentRenderId: render.id },
        });
      }
      throw error;
    }
    await audit(ctx, render, "document.viewed");
    return {
      fileName: `${render.documentType}-${render.verificationCode}.pdf`,
      contentType: "application/pdf",
      base64: Buffer.from(stored.bytes).toString("base64"),
    };
  });
}
