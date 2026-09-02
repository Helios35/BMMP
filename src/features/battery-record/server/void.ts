import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { ValidationError } from "@/lib/errors";
import type { BatteryRecord } from "@/types/battery-record";
import type { IsoTimestamp, Uuid } from "@/types/common";
import { userEvent, writeAuditEvent } from "./audit";

/**
 * **Void this record** — Rules 3.25, 12.12; T-22 `voided`.
 *
 * A battery record is never deleted. Voiding moves the status and records the
 * typed reason on the audit row; the record, its decisions, its assessments
 * and its photos stay exactly as they were, readable by the roles that could
 * read them before. `/batteries` already excludes voided rows from every
 * operational count (`excludeVoided`).
 *
 * Voiding is the one write on this screen that is not re-doable, which is why
 * it is the one that requires a typed reason rather than a chosen one.
 */

export interface VoidBatteryRecordOutcome {
  readonly record: BatteryRecord;
  readonly statusBefore: BatteryRecord["status"];
}

export async function voidBatteryRecordFor(
  ctx: RequestContext,
  input: { readonly recordId: Uuid; readonly reason: string },
  at: IsoTimestamp,
): Promise<VoidBatteryRecordOutcome> {
  const record = await data.batteryRecords.get(ctx, input.recordId);
  if (record === null) {
    throw new ValidationError({
      userMessage: "This record could not be found.",
      correlationId: ctx.correlationId,
    });
  }
  if (record.status === "voided") {
    throw new ValidationError({
      userMessage: "This record is already voided.",
      correlationId: ctx.correlationId,
    });
  }
  if (record.status === "shipped" || record.status === "closed") {
    // A record that has left on a shipping paper is part of that document's
    // trail; voiding it here would contradict a filed paper (Rule 12.16).
    throw new ValidationError({
      userMessage:
        "This record has been shipped and cannot be voided from this screen.",
      correlationId: ctx.correlationId,
    });
  }

  const statusBefore = record.status;
  const updated = await data.batteryRecords.update(ctx, record.id, {
    status: "voided",
  });

  await writeAuditEvent(
    ctx,
    userEvent(ctx, {
      eventType: "battery_record.status_changed",
      entityTable: "battery_record",
      entityId: record.id,
      occurredAt: at,
      beforeState: { status: statusBefore },
      afterState: { status: updated.status },
      changedFields: ["status"],
      reason: input.reason,
    }),
  );

  return { record: updated, statusBefore };
}
