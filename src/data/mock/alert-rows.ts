import type { RequestContext } from "@/data/contracts/context";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import type { RecallAlertDraft } from "@/domain/recalls/alerts";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { Alert } from "@/types/storage";

import { writeTriggerAudit } from "./audit-row";
import { now } from "./factory";
import { nextId } from "./ids";
import { mockStore as store } from "./store";

/**
 * Raising and resolving the alerts the recall decisions and Rule 6.14 write —
 * through the trigger's door, as `raiseClockAlert` does: `alert` INSERT
 * belongs to no tenant role (`ERD.md` §6.5), because nobody types an alert.
 * Idempotent on the dedupe key: an open alert with the same key is returned,
 * never doubled.
 */

export interface AlertSubjects {
  readonly batteryRecordId?: Uuid | null;
  readonly shipmentId?: Uuid | null;
  readonly recallMatchId?: Uuid | null;
}

function openAlertWithKey(
  ctx: RequestContext,
  dedupeKey: string,
): Alert | undefined {
  return store()
    .alerts.all()
    .find(
      (alert) =>
        alert.organizationId === ctx.organizationId &&
        alert.dedupeKey === dedupeKey &&
        alert.resolvedAt === null,
    );
}

export async function raiseDraftAlert(
  ctx: RequestContext,
  draft: RecallAlertDraft,
  subjects: AlertSubjects,
): Promise<Alert> {
  const existing = openAlertWithKey(ctx, draft.dedupeKey);
  if (existing !== undefined) return existing;
  const row: Alert = {
    id: nextId(),
    organizationId: ctx.organizationId,
    alertType: draft.alertType,
    severity: draft.severity,
    title: draft.title,
    body: draft.body,
    storageClockId: null,
    containerId: null,
    batteryRecordId: subjects.batteryRecordId ?? null,
    shipmentId: subjects.shipmentId ?? null,
    intakeSessionId: null,
    recallMatchId: subjects.recallMatchId ?? null,
    obligationDeadlineId: null,
    // No site entity exists (`ERD.md` §6.1), as for every alert so far.
    siteIdRef: null,
    audienceRoles: [...draft.audienceRoles],
    governingRuleVersionId: null,
    triggerSnapshot: draft.triggerSnapshot,
    raisedAt: draft.raisedAt,
    dedupeKey: draft.dedupeKey,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolutionReason: null,
    deliveredChannels: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await store().alerts.insertAsDefiner(ctx, row);
  return row;
}

/**
 * Resolve the open alert on a key, where there is one — the condition it
 * reported has cleared. The resolution is itself audited (T-43
 * `alert.resolved`; Rule 12.9), as the person whose act cleared it.
 */
export async function resolveAlertWithKey(
  ctx: RequestContext,
  dedupeKey: string,
  reason: string,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<Alert | null> {
  const open = openAlertWithKey(ctx, dedupeKey);
  if (open === undefined) return null;
  const resolved = await store().alerts.updateAsDefiner(ctx, open.id, {
    resolvedAt: at,
    resolutionReason: reason,
    updatedAt: now(),
  });
  await writeTriggerAudit(ctx, at, attribution, {
    eventType: "alert.resolved",
    entityTable: "alert",
    entityId: open.id,
    beforeState: { resolvedAt: null },
    afterState: { resolvedAt: at, alertType: open.alertType },
    changedFields: ["resolvedAt", "resolutionReason"],
    reason,
  });
  return resolved;
}
