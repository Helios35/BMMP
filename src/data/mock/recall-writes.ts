import type { RequestContext } from "@/data/contracts/context";
import type { ScheduledJobContext } from "@/data/contracts/jobs";
import type {
  AirShipmentInvalidation,
  ReclassificationWrite,
  RecallCheckRecorded,
  RecallCheckRecording,
  RecallCheckRunQuery,
  RecallDecided,
  RecallMatchConfirmation,
  RecallMatchDismissal,
  RecallMatchQuery,
  RecallRecording,
  RecallRepository,
  RecallSyncPlan,
} from "@/data/contracts/recalls";
import type { Page } from "@/data/contracts/repository";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import {
  mayTakeRecallAction,
  rolesForRecallAction,
  type RecallAction,
} from "@/domain/access/recall-actions";
import { possibleRecallMatchAlert } from "@/domain/recalls/alerts";
import { RECALL_RECORDING_SOURCES } from "@/domain/recalls/hit";
import { matchedOnWords } from "@/domain/recalls/match";
import {
  holdsRecalledFlag,
  prohibitsAir,
  withRecalledFlag,
} from "@/domain/recalls/recalled-flag";
import type { BatteryRecordStatus } from "@/domain/taxonomy/battery-record-status";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import {
  ConflictError,
  NotFoundError,
  PermissionError,
  ValidationError,
} from "@/lib/errors";
import type { BatteryRecord } from "@/types/battery-record";
import type { IsoTimestamp, JsonObject, Uuid } from "@/types/common";
import type { RecallCheckRun, RecallMatch } from "@/types/condition";
import type { ClassificationDecision } from "@/types/documents";

import { raiseDraftAlert, resolveAlertWithKey } from "./alert-rows";
import {
  writeJobAudit,
  writeSystemAudit,
  writeTriggerAudit,
  type TriggerAuditBody,
} from "./audit-row";
import { now } from "./factory";
import { nextId } from "./ids";
import { mockPlatformConfiguration } from "./platform-configuration";
import { holdAirShipmentsFor } from "./shipment-writes";
import { mockStore } from "./store";

/**
 * Recall matching, written — `RecallRepository` and the nightly job's half;
 * Rules 6.14, 6.23, 6.24, 10.10–10.18; D-73.
 *
 * **Each decision is one operation.** The match row moves, the record's
 * `recalled` flag and air prohibition follow from the rows that remain, the
 * `recall_match` alert is resolved, the re-classification the caller
 * computed is written, Rule 6.14 holds any open air shipment, and every T-43
 * row goes in — or none of it does. The person's own act (the match row) is
 * policy-checked; its consequences go through the definer doors, as the
 * triggers behind a Postgres definer function would write them, because a P2
 * confirming a recall writes no record, decision or shipment of their own
 * (`TECHNICAL_SPEC.md` §9.5).
 *
 * **Who** is `mayTakeRecallAction`, held here as well as on the screen:
 * confirm and record are P1, P2 and P6; dismiss and withdraw are P1 and P6,
 * with a reason; P5 none.
 */

const store = () => mockStore();

/** T-22 — the statuses the nightly job checks (Rule 10.10). */
const NIGHTLY_STATUSES: readonly BatteryRecordStatus[] = [
  "confirmed",
  "classified",
  "reclassifying",
  "stored",
  "quarantined",
  "staged",
];

// --- all or nothing ---------------------------------------------------------------------------

function snapshot(): () => void {
  const s = store();
  const tables = [
    s.recallMatches,
    s.recallCheckRuns,
    s.batteryRecords,
    s.classificationDecisions,
    s.alerts,
    s.shipments,
    s.documentRenders,
    s.auditEvents,
  ] as const;
  const saved = tables.map((table) => [...table.all()]);
  return () => {
    tables.forEach((table, index) => {
      (table.replaceAll as (rows: readonly unknown[]) => void)(
        saved[index] ?? [],
      );
    });
  };
}

async function atomically<T>(write: () => Promise<T>): Promise<T> {
  const restore = snapshot();
  try {
    return await write();
  } catch (cause) {
    restore();
    throw cause;
  }
}

// --- reading the rows -------------------------------------------------------------------------

function recordOf(ctx: RequestContext, id: Uuid): BatteryRecord {
  const record = store()
    .batteryRecords.all()
    .find((row) => row.id === id && row.organizationId === ctx.organizationId);
  if (record === undefined) {
    // Absent and another tenant's are one answer (Rule 1.2).
    throw new NotFoundError({
      userMessage: "This record could not be found.",
      correlationId: ctx.correlationId,
      context: { entity: "battery_record", id },
    });
  }
  return record;
}

function matchesOf(ctx: RequestContext, recordId: Uuid): RecallMatch[] {
  return store()
    .recallMatches.all()
    .filter(
      (row) =>
        row.organizationId === ctx.organizationId &&
        row.batteryRecordId === recordId,
    );
}

function newestFirst<T extends { readonly createdAt: string }>(
  a: T,
  b: T,
): number {
  return b.createdAt.localeCompare(a.createdAt);
}

// --- who ---------------------------------------------------------------------------------------

function refuse(ctx: RequestContext, action: RecallAction): never {
  const who = rolesForRecallAction(action)
    .map((role) => ROLE_LABELS[role])
    .join(", ");
  throw new PermissionError({
    userMessage: `Your role cannot ${action === "check_now" ? "run a recall check" : `${action} a recall`}. ${who} can.`,
    correlationId: ctx.correlationId,
    context: { action, role: ctx.role, rule: "6.23, 6.24, 10.14–10.16" },
  });
}

function assertMay(ctx: RequestContext, action: RecallAction): void {
  if (!mayTakeRecallAction(ctx.role, action)) refuse(ctx, action);
}

// --- the consequences, through the definer doors -----------------------------------------------

function sameFlags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((flag) => b.includes(flag));
}

/**
 * The `recalled` flag, from the rows that remain (Rules 10.14, 10.16): set
 * while any confirmed recall exists, cleared when none does — the other flags
 * untouched, and air prohibited while any flag stands (Rule 6.24).
 */
async function settleRecalledFlag(
  ctx: RequestContext,
  record: BatteryRecord,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
  reason: string,
): Promise<{ readonly record: BatteryRecord; readonly changed: boolean }> {
  const flags = withRecalledFlag(
    record.ddrFlags,
    holdsRecalledFlag(matchesOf(ctx, record.id)),
  );
  const air = prohibitsAir(flags);
  if (
    sameFlags(flags, record.ddrFlags) &&
    air === record.isAirTransportProhibited
  ) {
    return { record, changed: false };
  }
  const updated = await store().batteryRecords.updateAsDefiner(ctx, record.id, {
    ddrFlags: flags,
    isAirTransportProhibited: air,
    updatedAt: now(),
  });
  await writeSystemAudit(ctx, at, "recall_decision", attribution, {
    eventType: "battery_record.ddr_flag_set",
    entityTable: "battery_record",
    entityId: record.id,
    beforeState: {
      ddrFlags: [...record.ddrFlags],
      isAirTransportProhibited: record.isAirTransportProhibited,
    },
    afterState: {
      ddrFlags: [...flags],
      isAirTransportProhibited: air,
    },
    changedFields: ["ddrFlags", "isAirTransportProhibited"],
    reason,
  });
  return { record: updated, changed: true };
}

/**
 * The re-classification the caller computed (`planReclassification`),
 * written as `reclassifyRecord` writes it — `reclassifying`, the decision,
 * the supersessions, the settled status, each audited as the step — but
 * through the definer doors, so every role that may decide a recall
 * re-classifies alike (Rules 3.15, 6.20, 10.14).
 */
async function writeReclassification(
  ctx: RequestContext,
  record: BatteryRecord,
  write: ReclassificationWrite | null,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<{
  readonly record: BatteryRecord;
  readonly decisionId: Uuid | null;
}> {
  if (write === null) return { record, decisionId: null };
  if (!sameFlags(write.forDdrFlags, record.ddrFlags)) {
    throw new ConflictError({
      userMessage:
        "This record changed while you were working. Refresh it and decide again.",
      correlationId: ctx.correlationId,
      context: {
        plannedFor: [...write.forDdrFlags],
        flags: [...record.ddrFlags],
      },
    });
  }
  const s = store();
  const label = `reclassification:${write.trigger}`;
  const audit = (body: TriggerAuditBody) =>
    writeSystemAudit(ctx, at, label, attribution, body);

  await s.batteryRecords.updateAsDefiner(ctx, record.id, {
    status: "reclassifying",
    updatedAt: now(),
  });
  await audit({
    eventType: "battery_record.status_changed",
    entityTable: "battery_record",
    entityId: record.id,
    beforeState: { status: record.status },
    afterState: { status: "reclassifying" },
    changedFields: ["status"],
    reason: write.trigger,
  });

  const decision: ClassificationDecision = {
    ...write.decision,
    id: nextId(),
    organizationId: ctx.organizationId,
    createdAt: now(),
  };
  await s.classificationDecisions.insertAsDefiner(ctx, decision);
  for (const id of write.supersedeDecisionIds) {
    await s.classificationDecisions.updateAsDefiner(ctx, id, {
      status: "superseded",
    });
  }
  await audit({
    eventType: "classification_decision.recorded",
    entityTable: "classification_decision",
    entityId: decision.id,
    beforeState:
      write.supersedeDecisionIds.length === 0
        ? null
        : {
            supersededDecisionIds: [...write.supersedeDecisionIds],
            wasteClassification: write.priorWasteClassification,
          },
    afterState: {
      wasteClassification: decision.wasteClassification,
      status: decision.status,
      basisCodes: [...decision.basisCodes],
      governingDate: write.governingDate,
      trigger: write.trigger,
    },
    governingRuleVersionId: decision.governingRuleVersionId,
    ruleVersionsApplied: decision.evaluationTrace,
    reason: write.trigger,
  });

  const settled = await s.batteryRecords.updateAsDefiner(ctx, record.id, {
    status: write.settledStatus,
    updatedAt: now(),
  });
  await audit({
    eventType: "battery_record.status_changed",
    entityTable: "battery_record",
    entityId: record.id,
    beforeState: { status: "reclassifying" },
    afterState: { status: write.settledStatus },
    changedFields: ["status"],
    governingRuleVersionId: decision.governingRuleVersionId,
    reason: write.trigger,
  });
  return { record: settled, decisionId: decision.id };
}

/** Everything a decision sets running once its row has moved. */
async function applyDecision(
  ctx: RequestContext,
  match: RecallMatch,
  write: ReclassificationWrite | null,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
  reason: string,
): Promise<RecallDecided> {
  const before = recordOf(ctx, match.batteryRecordId);
  const flagged = await settleRecalledFlag(
    ctx,
    before,
    at,
    attribution,
    reason,
  );
  const classified = flagged.changed
    ? await writeReclassification(ctx, flagged.record, write, at, attribution)
    : { record: flagged.record, decisionId: null };
  const airShipments: readonly AirShipmentInvalidation[] =
    match.status === "confirmed_match"
      ? await holdAirShipmentsFor(
          ctx,
          classified.record,
          "recall",
          at,
          attribution,
        )
      : [];
  return {
    match,
    record: classified.record,
    classificationDecisionId: classified.decisionId,
    flagsChanged: flagged.changed,
    airShipments,
  };
}

function matchSnapshot(match: RecallMatch): JsonObject {
  return {
    batteryRecordId: match.batteryRecordId,
    status: match.status,
    source: match.source,
    providerRecordId: match.providerRecordId,
    recallNumber: match.recallNumber,
  };
}

// --- a check ------------------------------------------------------------------------------------

type CheckActor =
  | { readonly kind: "person" }
  | { readonly kind: "job"; readonly label: string };

async function writeCheck(
  ctx: RequestContext,
  input: RecallCheckRecording,
  actor: CheckActor,
): Promise<RecallCheckRecorded> {
  if (input.runs.length === 0) {
    throw new ValidationError({
      userMessage:
        "A recall check records at least one run — nothing to match against is itself a run.",
      correlationId: ctx.correlationId,
    });
  }
  const record = recordOf(ctx, input.batteryRecordId);
  const s = store();
  const label = `recall_check:${input.trigger}`;
  const audit = (body: TriggerAuditBody) =>
    actor.kind === "job"
      ? writeJobAudit(ctx, input.at, actor.label, body)
      : writeSystemAudit(ctx, input.at, label, input.attribution, body);

  return atomically(async () => {
    const runs: RecallCheckRun[] = [];
    const found: RecallMatch[] = [];
    for (const run of input.runs) {
      const matchIds: Uuid[] = [];
      for (const candidate of run.candidates) {
        const existing = matchesOf(ctx, record.id).find(
          (row) =>
            row.source === candidate.hit.source &&
            row.providerRecordId === candidate.hit.providerRecordId,
        );
        // Rule 10.18 — found again makes no second row, whatever its status.
        if (existing !== undefined) {
          matchIds.push(existing.id);
          continue;
        }
        const identity = run.identity;
        const words = matchedOnWords(
          identity ?? "battery",
          candidate.fields,
          candidate.hit.recallNumber,
        );
        const row: RecallMatch = {
          id: nextId(),
          organizationId: ctx.organizationId,
          batteryRecordId: record.id,
          source: candidate.hit.source,
          providerRecordId: candidate.hit.providerRecordId,
          matchedOn: { identity, fields: [...candidate.fields] },
          // Rule 10.13 — never written.
          matchConfidence: null,
          identity,
          status: "possible_match",
          recallNumber: candidate.hit.recallNumber,
          recallTitle: candidate.hit.title,
          recallUrl: candidate.hit.url,
          recallPublishedOn: candidate.hit.publishedOn,
          remedySummary: candidate.hit.remedy,
          checkedAt: input.at,
          checkErrorCode: null,
          confirmedBy: null,
          confirmedAt: null,
          dismissedBy: null,
          dismissedReason: null,
          dismissedAt: null,
          createdAt: now(),
          updatedAt: now(),
        };
        await s.recallMatches.insertAsDefiner(ctx, row);
        found.push(row);
        matchIds.push(row.id);
        await audit({
          eventType: "recall_match.found",
          entityTable: "recall_match",
          entityId: row.id,
          beforeState: null,
          afterState: { ...matchSnapshot(row), matchedOn: words },
        });
        await raiseDraftAlert(
          ctx,
          possibleRecallMatchAlert({
            matchId: row.id,
            recordNumber: record.recordNumber,
            recallNumber: row.recallNumber ?? row.providerRecordId,
            matchedOn: words,
            raisedAt: input.at,
          }),
          { batteryRecordId: record.id, recallMatchId: row.id },
        );
      }

      const checkRun: RecallCheckRun = {
        id: nextId(),
        organizationId: ctx.organizationId,
        batteryRecordId: record.id,
        source: run.source,
        identity: run.identity,
        trigger: input.trigger,
        outcome: run.outcome,
        checkErrorCode: run.outcome === "failed" ? run.checkErrorCode : null,
        matchIds,
        configurationVersion: input.configurationVersion,
        ranAt: input.at,
        ranBy: actor.kind === "person" ? ctx.userId : null,
        createdAt: now(),
      };
      await s.recallCheckRuns.insertAsDefiner(ctx, checkRun);
      runs.push(checkRun);
      await audit({
        eventType:
          run.outcome === "failed"
            ? "recall_check.failed"
            : "recall_check.completed",
        entityTable: "recall_check",
        entityId: checkRun.id,
        beforeState: null,
        afterState: {
          batteryRecordId: record.id,
          recordNumber: record.recordNumber,
          source: run.source,
          identity: run.identity,
          trigger: input.trigger,
          outcome: run.outcome,
          checkErrorCode: checkRun.checkErrorCode,
          matchIds: [...matchIds],
          configurationVersion: input.configurationVersion,
        },
        reason: checkRun.checkErrorCode,
      });
    }
    return { runs, found };
  });
}

// --- the repository -----------------------------------------------------------------------------

export const mockRecalls: RecallRepository = {
  async listMatches(
    ctx: RequestContext,
    query: RecallMatchQuery,
  ): Promise<Page<RecallMatch>> {
    return store().recallMatches.list(
      ctx,
      query,
      (row) =>
        (query.batteryRecordId === undefined ||
          row.batteryRecordId === query.batteryRecordId) &&
        (query.status === undefined || row.status === query.status),
      newestFirst,
    );
  },

  async listCheckRuns(
    ctx: RequestContext,
    query: RecallCheckRunQuery,
  ): Promise<Page<RecallCheckRun>> {
    return store().recallCheckRuns.list(
      ctx,
      query,
      (row) => row.batteryRecordId === query.batteryRecordId,
      (a, b) =>
        b.ranAt.localeCompare(a.ranAt) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  },

  recordCheck(ctx, input) {
    return writeCheck(ctx, input, { kind: "person" });
  },

  async confirm(ctx, input: RecallMatchConfirmation) {
    assertMay(ctx, "confirm");
    const match = await store().recallMatches.getOrThrow(ctx, input.matchId);
    if (match.status !== "possible_match") {
      throw new ConflictError({
        userMessage:
          "This match was already decided. Refresh the record to see how.",
        correlationId: ctx.correlationId,
        context: { status: match.status },
      });
    }
    return atomically(async () => {
      const confirmed = await store().recallMatches.update(ctx, match.id, {
        status: "confirmed_match",
        confirmedBy: ctx.userId,
        confirmedAt: input.at,
        updatedAt: now(),
      });
      await writeTriggerAudit(ctx, input.at, input.attribution, {
        eventType: "recall_match.confirmed",
        entityTable: "recall_match",
        entityId: match.id,
        beforeState: matchSnapshot(match),
        afterState: matchSnapshot(confirmed),
        changedFields: ["status", "confirmedBy", "confirmedAt"],
      });
      await resolveAlertWithKey(
        ctx,
        `recall_match:${match.id}`,
        "Confirmed as a recall.",
        input.at,
        input.attribution,
      );
      return applyDecision(
        ctx,
        confirmed,
        input.reclassification,
        input.at,
        input.attribution,
        `Recall ${confirmed.recallNumber ?? confirmed.providerRecordId} confirmed.`,
      );
    });
  },

  async dismiss(ctx, input: RecallMatchDismissal) {
    const match = await store().recallMatches.getOrThrow(ctx, input.matchId);
    const action: RecallAction =
      match.status === "confirmed_match" ? "withdraw" : "dismiss";
    assertMay(ctx, action);
    if (match.status === "dismissed") {
      throw new ConflictError({
        userMessage:
          "This match was already dismissed. Refresh the record to see by whom.",
        correlationId: ctx.correlationId,
        context: { status: match.status },
      });
    }
    const reason = input.reason.trim();
    if (reason === "") {
      throw new ValidationError({
        userMessage:
          action === "withdraw"
            ? "State why the recall is being withdrawn. The reason stays on the record beside the confirmation (Rule 6.24)."
            : "State why this is not a match. The reason stays on the record (Rule 6.24).",
        field: "reason",
        correlationId: ctx.correlationId,
      });
    }
    return atomically(async () => {
      const dismissed = await store().recallMatches.update(ctx, match.id, {
        status: "dismissed",
        dismissedBy: ctx.userId,
        dismissedAt: input.at,
        dismissedReason: reason,
        updatedAt: now(),
      });
      await writeTriggerAudit(ctx, input.at, input.attribution, {
        eventType: "recall_match.dismissed",
        entityTable: "recall_match",
        entityId: match.id,
        beforeState: matchSnapshot(match),
        afterState: {
          ...matchSnapshot(dismissed),
          withdrawn: action === "withdraw",
        },
        changedFields: [
          "status",
          "dismissedBy",
          "dismissedAt",
          "dismissedReason",
        ],
        reason,
      });
      await resolveAlertWithKey(
        ctx,
        `recall_match:${match.id}`,
        reason,
        input.at,
        input.attribution,
      );
      return applyDecision(
        ctx,
        dismissed,
        input.reclassification,
        input.at,
        input.attribution,
        reason,
      );
    });
  },

  async record(ctx, input: RecallRecording) {
    assertMay(ctx, "record");
    if (!RECALL_RECORDING_SOURCES.includes(input.source)) {
      throw new ValidationError({
        userMessage:
          "A recall is recorded from a manufacturer notice or another source a person cites.",
        field: "source",
        correlationId: ctx.correlationId,
      });
    }
    const reference = input.reference.trim();
    if (reference === "") {
      throw new ValidationError({
        userMessage:
          "Enter the notice's reference. A recall is recorded with where it came from (Rule 6.23).",
        field: "reference",
        correlationId: ctx.correlationId,
      });
    }
    const record = recordOf(ctx, input.batteryRecordId);
    const existing = matchesOf(ctx, record.id).find(
      (row) =>
        row.source === input.source && row.providerRecordId === reference,
    );
    if (existing !== undefined) {
      // One row per record, source and recall (Rule 10.18).
      throw new ConflictError({
        userMessage:
          "This recall is already on the record from that source. It is listed in the Recalls section.",
        correlationId: ctx.correlationId,
        context: { matchId: existing.id, status: existing.status },
      });
    }
    const title = input.title?.trim() ?? "";
    return atomically(async () => {
      const row: RecallMatch = {
        id: nextId(),
        organizationId: ctx.organizationId,
        batteryRecordId: record.id,
        source: input.source,
        providerRecordId: reference,
        matchedOn: {},
        matchConfidence: null,
        identity: null,
        // Rule 10.15 — a person entered it, so it is confirmed at once.
        status: "confirmed_match",
        recallNumber: reference,
        recallTitle: title === "" ? null : title,
        recallUrl: null,
        recallPublishedOn: null,
        remedySummary: null,
        checkedAt: input.at,
        checkErrorCode: null,
        confirmedBy: ctx.userId,
        confirmedAt: input.at,
        dismissedBy: null,
        dismissedReason: null,
        dismissedAt: null,
        createdAt: now(),
        updatedAt: now(),
      };
      await store().recallMatches.insert(ctx, row);
      await writeTriggerAudit(ctx, input.at, input.attribution, {
        eventType: "recall_match.recorded",
        entityTable: "recall_match",
        entityId: row.id,
        beforeState: null,
        afterState: { ...matchSnapshot(row), recallTitle: row.recallTitle },
      });
      return applyDecision(
        ctx,
        row,
        input.reclassification,
        input.at,
        input.attribution,
        `Recall ${reference} recorded by hand.`,
      );
    });
  },
};

// --- the nightly job ------------------------------------------------------------------------------

function jobScope(organizationId: Uuid, correlationId: string): RequestContext {
  return {
    userId: "00000000-0000-0000-0000-000000000000",
    organizationId,
    role: "auditor",
    isPlatformAdmin: false,
    correlationId,
  };
}

/**
 * Every record the nightly check covers (Rule 10.10) — across organizations,
 * because the job belongs to none — with its catalog entry and the
 * configuration the run applies. Read-only.
 */
export async function recallSyncPlan(
  job: ScheduledJobContext,
): Promise<RecallSyncPlan> {
  const s = store();
  const configuration =
    await mockPlatformConfiguration.readRecallMatchConfiguration(
      jobScope("00000000-0000-0000-0000-000000000000", job.correlationId),
    );
  const targets = s.batteryRecords
    .all()
    .filter((record) => NIGHTLY_STATUSES.includes(record.status))
    .map((record) => ({
      organizationId: record.organizationId,
      record,
      catalogEntry:
        record.catalogEntryId === null
          ? null
          : (s.catalogEntries
              .all()
              .find((entry) => entry.id === record.catalogEntryId) ?? null),
    }));
  return { configuration, targets };
}

/** One nightly check, written as the job — T-60 `scheduled_job`, no person. */
export async function recordRecallCheckForJob(
  job: ScheduledJobContext,
  organizationId: Uuid,
  input: RecallCheckRecording,
): Promise<RecallCheckRecorded> {
  return writeCheck(jobScope(organizationId, job.correlationId), input, {
    kind: "job",
    label: job.job,
  });
}
