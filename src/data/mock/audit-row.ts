import type { RequestContext } from "@/data/contracts/context";
import type { CreateAuditEvent } from "@/data/contracts/audit";
import type { Uuid } from "@/types/common";

import { now } from "./factory";
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
