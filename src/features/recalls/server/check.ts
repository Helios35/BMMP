import { data } from "@/data";
import type {
  RecallCheckRecorded,
  RecallCheckRunWrite,
  RequestContext,
} from "@/data/contracts";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import {
  candidatesFor,
  recallIdentities,
  recallQueryFor,
  type RecallCheckTrigger,
  type RecallIdentity,
  type RecallMatchConfiguration,
} from "@/domain/recalls";
import type { BatteryRecordStatus } from "@/domain/taxonomy/battery-record-status";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { isRecallProviderError, recallProvider } from "@/lib/recalls";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type { IsoTimestamp, Uuid } from "@/types/common";

import { systemEvent } from "@/features/battery-record/server/audit";

/**
 * A recall check — Rules 10.10–10.13, 10.17; D-73.
 *
 * The identities come from the record and its confirmed catalog entry
 * (`recallIdentities`); each is asked of its source through the recall seam
 * (`src/lib/recalls`); the domain decides the candidates (`candidatesFor`);
 * `src/data` writes the runs and the possible matches. **Nothing here
 * confirms anything** (Rule 10.7) and nothing here is a number.
 *
 * **A source that does not answer is a failed run with its reason code**,
 * never an empty result: the record then reads "Not checked — source
 * unavailable", never "No match" (Rule 10.17).
 */

/** T-22 — the statuses a check, and a recall decision, act on (Rule 10.10). */
export const CHECKABLE_STATUSES: readonly BatteryRecordStatus[] = [
  "confirmed",
  "classified",
  "reclassifying",
  "stored",
  "quarantined",
  "staged",
];

/** Recorded on a failed run when the failure was not the source's own. */
const UNEXPECTED_FAILURE = "unexpected_error";

/** Bounded read — one record carries a handful of recalls. */
export const RECALLS_PER_RECORD_LIMIT = 200;

export interface CheckSubject {
  readonly record: BatteryRecord;
  readonly catalogEntry: CatalogEntry | null;
}

/** What this record can be checked on (Rule 10.11) — the catalog entry's names first. */
export function identitiesOf(subject: CheckSubject): readonly RecallIdentity[] {
  const { record, catalogEntry } = subject;
  return recallIdentities({
    hasConfirmedCatalogEntry:
      record.catalogEntryId !== null && catalogEntry !== null,
    manufacturerName: catalogEntry?.manufacturerName ?? record.manufacturerName,
    brandName: catalogEntry?.brandName ?? record.brandName,
    modelName: catalogEntry?.modelName ?? record.modelName,
    partNumber: catalogEntry?.partNumber ?? record.partNumber,
    provenanceSourceType: record.provenanceSourceType,
    sourceDeviceMake: record.sourceDeviceMake,
    sourceDeviceModel: record.sourceDeviceModel,
    sourceDeviceModelYear: record.sourceDeviceModelYear,
  });
}

/**
 * Ask each identity's source, and say what each run concluded. A record with
 * no identity is one run that found nothing to match against — a recorded
 * fact, not a failure (Rule 10.11).
 */
export async function askSources(
  identities: readonly RecallIdentity[],
  configuration: RecallMatchConfiguration,
  correlationId: string,
): Promise<readonly RecallCheckRunWrite[]> {
  if (identities.length === 0) {
    return [
      {
        source: null,
        identity: null,
        outcome: "nothing_to_match",
        checkErrorCode: null,
        candidates: [],
      },
    ];
  }
  const runs: RecallCheckRunWrite[] = [];
  for (const identity of identities) {
    try {
      const hits = await recallProvider().search(recallQueryFor(identity));
      const candidates = candidatesFor(identity, hits, configuration);
      runs.push({
        source: identity.source,
        identity: identity.kind,
        outcome: candidates.length > 0 ? "candidates_found" : "no_match",
        checkErrorCode: null,
        candidates: candidates.map((candidate) => ({
          hit: candidate.hit,
          fields: candidate.fields,
        })),
      });
    } catch (error) {
      // Not swallowed: the failure is the run, recorded with its reason code
      // and written to the audit log as `recall_check.failed` (Rule 10.17).
      if (!isRecallProviderError(error)) {
        console.error(
          `[recalls] a recall source failed unexpectedly (correlationId=${correlationId})`,
          error,
        );
      }
      runs.push({
        source: identity.source,
        identity: identity.kind,
        outcome: "failed",
        checkErrorCode: isRecallProviderError(error)
          ? error.code
          : UNEXPECTED_FAILURE,
        candidates: [],
      });
    }
  }
  return runs;
}

export async function readCheckSubject(
  ctx: RequestContext,
  recordId: Uuid,
): Promise<CheckSubject> {
  const record = await data.batteryRecords.get(ctx, recordId);
  if (record === null) {
    throw new NotFoundError({
      userMessage: "This record could not be found.",
      correlationId: ctx.correlationId,
      context: { entity: "battery_record", id: recordId },
    });
  }
  const catalogEntry =
    record.catalogEntryId === null
      ? null
      : await data.catalogEntries.get(ctx, record.catalogEntryId);
  return { record, catalogEntry };
}

/** Refuse a check or a decision on a record outside the statuses Rule 10.10 names. */
export function assertCheckable(
  ctx: RequestContext,
  record: BatteryRecord,
): void {
  if (CHECKABLE_STATUSES.includes(record.status)) return;
  throw new ValidationError({
    userMessage:
      record.status === "voided"
        ? "This record is voided. It is kept for the trail and its recalls cannot change."
        : record.status === "shipped" || record.status === "closed"
          ? "This record has left on a shipment. Its recalls are kept as they stand."
          : "This record is still being identified. Its recalls are checked once it is confirmed.",
    correlationId: ctx.correlationId,
    context: { batteryRecordId: record.id, status: record.status },
  });
}

/** One check of one record, written. */
export async function runRecallCheck(
  ctx: RequestContext,
  recordId: Uuid,
  trigger: RecallCheckTrigger,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<RecallCheckRecorded> {
  const subject = await readCheckSubject(ctx, recordId);
  assertCheckable(ctx, subject.record);
  const configuration =
    await data.platformConfiguration.readRecallMatchConfiguration(ctx);
  const runs = await askSources(
    identitiesOf(subject),
    configuration,
    ctx.correlationId,
  );
  return data.recalls.recordCheck(ctx, {
    batteryRecordId: recordId,
    trigger,
    configurationVersion: configuration.configurationVersion,
    runs,
    at,
    attribution,
  });
}

/**
 * The check a commit or an identity change sets running — **it never blocks
 * the act that ran it** (Rule 10.17). A source that does not answer is
 * already a recorded run; this catches the rarer failure of the check itself,
 * logs it with the correlation id and writes `recall_check.failed` against
 * the record, so the attempt is evidence. The record then reads "Not checked"
 * — true — and the nightly job runs it again.
 */
export async function runRecallCheckWithoutBlocking(
  ctx: RequestContext,
  recordId: Uuid,
  trigger: RecallCheckTrigger,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<RecallCheckRecorded | null> {
  try {
    return await runRecallCheck(ctx, recordId, trigger, at, attribution);
  } catch (error) {
    console.error(
      `[recalls] the ${trigger} recall check did not complete (correlationId=${ctx.correlationId})`,
      error,
    );
    try {
      await data.auditEvents.write(
        ctx,
        systemEvent(ctx, `recall_check:${trigger}`, {
          eventType: "recall_check.failed",
          entityTable: "battery_record",
          entityId: recordId,
          occurredAt: at,
          beforeState: null,
          afterState: { trigger, checkErrorCode: UNEXPECTED_FAILURE },
          reason: UNEXPECTED_FAILURE,
        }),
      );
    } catch (auditError) {
      console.error(
        `[recalls] the failed check could not be audited either (correlationId=${ctx.correlationId})`,
        auditError,
      );
    }
    return null;
  }
}
