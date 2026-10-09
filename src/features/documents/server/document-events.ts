import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import type { AuditEventType } from "@/domain/taxonomy/audit-event-type";
import { actorTypeFor } from "@/features/intake/server/audit";
import { nowIso } from "@/lib/auth/session";
import type { DocumentRender } from "@/types/documents";

/**
 * A stream of a document's stored bytes, recorded — `TECHNICAL_SPEC.md` §8.4:
 * "every download and every reprint appends an `audit_event`
 * (`document.viewed`, `document.reprinted`) with actor, time and correlation
 * id." **Written before a byte is sent**: a read nobody can see a record of
 * does not happen. Through the `security definer` door, because P5 holds no
 * INSERT on `audit_event` and her read is exactly the act that must be on the
 * record (Rules 12.3, 12.6).
 */

export interface DocumentRequestAttribution {
  readonly requestId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export async function recordDocumentAccess(
  ctx: RequestContext,
  render: DocumentRender,
  eventType: Extract<AuditEventType, "document.viewed" | "document.reprinted">,
  attribution: DocumentRequestAttribution,
): Promise<void> {
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
      contentHash: render.contentHash,
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
