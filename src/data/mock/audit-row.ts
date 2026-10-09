import type { RequestContext } from "@/data/contracts/context";
import type { CreateAuditEvent } from "@/data/contracts/audit";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";
import type { AuditEventType } from "@/domain/taxonomy/audit-event-type";
import type { IsoTimestamp, JsonObject, Uuid } from "@/types/common";

import { now } from "./factory";
import { nextId } from "./ids";
import { mockStore, type TenantAuditEvent } from "./store";

/**
 * The audit row, built once, so every door that writes one — the
 * policy-checked `append`, the `security definer` `write`, and the storage
 * writes that stand in for Postgres's triggers — allocates a sequence number
 * and a tenant the same way.
 */
export function buildAuditEvent(
  ctx: RequestContext,
  input: CreateAuditEvent,
  id: Uuid,
): TenantAuditEvent {
  return {
    ...input,
    id,
    sequenceNo: mockStore().auditEvents.all().length + 1,
    organizationId: ctx.organizationId,
    createdAt: now(),
  };
}

export interface TriggerAuditBody {
  readonly eventType: AuditEventType;
  readonly entityTable: string;
  readonly entityId: Uuid;
  readonly beforeState: JsonObject | null;
  readonly afterState: JsonObject | null;
  readonly changedFields?: readonly string[] | null;
  readonly governingRuleVersionId?: Uuid | null;
  readonly ruleVersionsApplied?: readonly AppliedRuleVersion[] | null;
  readonly reason?: string | null;
}

/**
 * A person's act, as the Postgres trigger would record it — actor from `ctx`,
 * attribution from the request — written through the `security definer`
 * door, because in Postgres no tenant statement writes `audit_event`. The
 * storage writes and the shipment writes both stand in for triggers, and
 * both write their rows here.
 */
export async function writeTriggerAudit(
  ctx: RequestContext,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
  body: TriggerAuditBody,
): Promise<void> {
  const row: CreateAuditEvent = {
    actorUserId: ctx.userId,
    actorType: ctx.isPlatformAdmin ? "platform_admin" : "user",
    actorLabel: null,
    eventType: body.eventType,
    entityTable: body.entityTable,
    entityId: body.entityId,
    occurredAt: at,
    recordedAt: at,
    beforeState: body.beforeState,
    afterState: body.afterState,
    changedFields: body.changedFields ?? null,
    governingRuleVersionId: body.governingRuleVersionId ?? null,
    ruleVersionsApplied: body.ruleVersionsApplied ?? null,
    correlationId: ctx.correlationId,
    requestId: attribution.requestId,
    ipAddress: attribution.ipAddress,
    userAgent: attribution.userAgent,
    reason: body.reason ?? null,
  };
  await mockStore().auditEvents.insertAsDefiner(
    ctx,
    buildAuditEvent(ctx, row, nextId()),
  );
}
