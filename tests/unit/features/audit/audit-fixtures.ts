import type { AuditActorDirectory } from "@/features/audit/audit-actors";
import type { AuditEvent } from "@/types/audit";

/**
 * Small, explicit audit rows for the unit tests in this folder.
 *
 * Hand-built rather than read through the adapter, because these tests are about
 * how one row **renders and exports**, not about how the log is queried. The
 * adapter's own behaviour is covered in `tests/integration`.
 */

export const TEST_ZONE = "America/Los_Angeles";

export function auditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "0a000010-0000-4000-8000-000000000001",
    sequenceNo: 1,
    organizationId: "0a000001-0000-4000-8000-000000000001",
    actorUserId: "0a000002-0000-4000-8000-000000000001",
    actorType: "user",
    actorLabel: null,
    eventType: "battery_record.confirmed",
    entityTable: "battery_record",
    entityId: "0a000009-0000-4000-8000-000000000001",
    occurredAt: "2026-06-12T14:30:00.000Z",
    recordedAt: "2026-06-12T14:30:00.000Z",
    beforeState: { status: "pending_review", chemistry: null },
    afterState: { status: "confirmed", chemistry: "li_nmc" },
    changedFields: ["status", "chemistry", "chemistryConfirmedBy"],
    governingRuleVersionId: null,
    ruleVersionsApplied: null,
    correlationId: "corr-vehicle-0001",
    requestId: null,
    ipAddress: null,
    userAgent: null,
    reason: null,
    createdAt: "2026-06-12T14:30:00.000Z",
    ...overrides,
  };
}

export const TEST_DIRECTORY: AuditActorDirectory = {
  byUserId: new Map([
    [
      "0a000002-0000-4000-8000-000000000001",
      {
        userId: "0a000002-0000-4000-8000-000000000001",
        name: "Dana Reyes",
        role: "compliance_handler" as const,
        isActive: true,
      },
    ],
    [
      "0a000002-0000-4000-8000-000000000004",
      {
        userId: "0a000002-0000-4000-8000-000000000004",
        name: "Platform Support",
        role: "facility_manager" as const,
        isActive: true,
      },
    ],
  ]),
  options: [],
};
