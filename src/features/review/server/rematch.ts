import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  isOpenRematchRaise,
  readRematchTrigger,
  type RematchTrigger,
} from "@/domain/review/queue";
import { applyCatalogRematch } from "@/features/battery-record/server/rematch";
import { userEvent } from "@/features/intake/server/audit";
import { NotFoundError } from "@/lib/errors";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { Alert } from "@/types/storage";

import { REMATCH_NOT_OPEN } from "../review-copy";

/**
 * A Flow F raise, worked — `SITE_ARCHITECTURE.md` Flow F steps 4–5;
 * `UX_SPEC.md` E-5; EC-10, EC-13; T-61.
 *
 * *"Re-matching never silently changes a confirmed chemistry — it raises the
 * record on `/review` for a human to confirm."* The approval raised the
 * record and changed nothing on it. What happens next is one of two acts by a
 * person, and nothing else moves the raise (Rule 2.23):
 *
 * - **Confirm the match.** The record's own re-match path
 *   (`applyCatalogRematch`, the one `/batteries/[id]` uses): the entry's
 *   chemistry becomes the record's with this person's confirmation, audited as
 *   T-43 `battery_record.confirmed` (D-45), and the record is re-classified
 *   (Rule 3.15; EC-13). Then the raise is resolved.
 * - **Keep the record as it is identified**, with a stated reason — a
 *   handler's rejection of a match always wins over the match (EC-10). The
 *   record is untouched and the raise is resolved with the reason.
 *
 * **Either way the raise's resolution is audited** as T-43 `alert.resolved`
 * with the reason (D-48), beside whatever the record's own path wrote.
 */

export interface OpenRematch {
  readonly raise: Alert;
  readonly trigger: RematchTrigger;
  readonly record: BatteryRecord;
  /** `null` where the entry is no longer visible to this organisation. */
  readonly entry: CatalogEntry | null;
}

/** The raise, its record and its entry — or not found, the same for absent and another tenant's (Rule 1.2). */
export async function loadOpenRematch(
  ctx: RequestContext,
  raiseId: Uuid,
): Promise<OpenRematch> {
  const raise = await data.alerts.get(ctx, raiseId);
  const trigger =
    raise === null ? null : readRematchTrigger(raise.triggerSnapshot);
  if (
    raise === null ||
    trigger === null ||
    !isOpenRematchRaise(raise) ||
    raise.batteryRecordId === null
  ) {
    throw new NotFoundError({
      userMessage: REMATCH_NOT_OPEN,
      correlationId: ctx.correlationId,
      context: { alertId: raiseId },
    });
  }
  const [record, entry] = await Promise.all([
    data.batteryRecords.get(ctx, raise.batteryRecordId),
    data.catalogEntries.get(ctx, trigger.catalogEntryId),
  ]);
  if (record === null) {
    throw new NotFoundError({
      userMessage: REMATCH_NOT_OPEN,
      correlationId: ctx.correlationId,
      context: { alertId: raiseId },
    });
  }
  return { raise, trigger, record, entry };
}

/** The resolution reason a confirmed match leaves on the raise. */
const RESOLVED_BY_CONFIRMATION = "rematch_confirmed";

export async function confirmRematchRaise(
  ctx: RequestContext,
  raiseId: Uuid,
  at: IsoTimestamp,
): Promise<{ readonly batteryRecordId: Uuid; readonly recordNumber: string }> {
  const { raise, trigger, record } = await loadOpenRematch(ctx, raiseId);
  // The record's own path: refuses an entry that is not published or not
  // visible, and a record that is past editing, with the reason stated.
  const outcome = await applyCatalogRematch(
    ctx,
    { recordId: record.id, catalogEntryId: trigger.catalogEntryId },
    at,
  );
  await resolveRaise(ctx, raise, RESOLVED_BY_CONFIRMATION, at);
  return {
    batteryRecordId: outcome.record.id,
    recordNumber: outcome.record.recordNumber,
  };
}

export async function declineRematchRaise(
  ctx: RequestContext,
  raiseId: Uuid,
  reason: string,
  at: IsoTimestamp,
): Promise<{ readonly batteryRecordId: Uuid; readonly recordNumber: string }> {
  const { raise, record } = await loadOpenRematch(ctx, raiseId);
  await resolveRaise(ctx, raise, reason, at);
  return { batteryRecordId: record.id, recordNumber: record.recordNumber };
}

/**
 * Close the raise and audit it — T-43 `alert.resolved`, with the reason
 * (D-48). The alert is never deleted; resolving it is its one closing act
 * (Rule 12.9), and it is a person's act (Rule 12.1).
 */
async function resolveRaise(
  ctx: RequestContext,
  raise: Alert,
  reason: string,
  at: IsoTimestamp,
): Promise<void> {
  const resolved = await data.alerts.update(ctx, raise.id, {
    acknowledgedAt: at,
    acknowledgedBy: ctx.userId,
    resolvedAt: at,
    resolutionReason: reason,
  });
  await data.auditEvents.write(
    ctx,
    userEvent(ctx, {
      eventType: "alert.resolved",
      entityTable: "alert",
      entityId: raise.id,
      at,
      beforeState: { resolvedAt: raise.resolvedAt },
      afterState: {
        resolvedAt: resolved.resolvedAt,
        batteryRecordId: raise.batteryRecordId,
        triggerSnapshot: raise.triggerSnapshot,
      },
      changedFields: ["resolvedAt", "resolutionReason", "acknowledgedAt"],
      reason,
    }),
  );
}
