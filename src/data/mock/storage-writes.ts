import type { RequestContext } from "@/data/contracts/context";
import type { CreateAuditEvent } from "@/data/contracts/audit";
import type {
  ContainerContentsMove,
  ContainerContentsMoveResult,
  ContainerStatusChange,
  ContainerStorageEvent,
  StorageWriteAttribution,
} from "@/data/contracts/storage";
import type { BatteryRecord } from "@/types/battery-record";
import type { IsoTimestamp, JsonObject, Uuid } from "@/types/common";
import type {
  Alert,
  Container,
  StorageClock,
  StorageEvent,
} from "@/types/storage";
import {
  evaluationTrace,
  governingRuleVersionId,
} from "@/domain/rules/outcome";
import { isInForceOn } from "@/domain/rules/resolve";
import {
  admitContentsMove,
  assertNeverLater,
  carriedAccumulationStart,
  CARRIED_START_PAYLOAD_KEY,
  emptiesSource,
  planReceipt,
  type MoveContainerFacts,
} from "@/domain/storage/accumulation";
import { civilDateInZone } from "@/domain/storage/clock-display";
import {
  evaluateStorageClock,
  storageClockAlert,
  type ClockEvaluation,
} from "@/domain/storage/clock-evaluation";
import {
  ACCUMULATION_RULE_KEY,
  startStorageClock,
} from "@/domain/storage/placement";
import type { AuditEventType } from "@/domain/taxonomy/audit-event-type";
import { compareDecimal, subtractDecimal, addDecimal } from "@/domain/units";
import {
  ConflictError,
  DataIntegrityError,
  PermissionError,
  RuleResolutionError,
  ValidationError,
} from "@/lib/errors";

import { buildAuditEvent } from "./audit-row";
import { now } from "./factory";
import { nextId } from "./ids";
import { assertPolicy } from "./policy";
import { mockStore } from "./store";

/**
 * The container writes that are wider than CRUD — `ContainerRepository`'s
 * `moveContents`, `recordStorageEvent` and `changeStatus`.
 *
 * **Each is one operation, all or nothing**, and in Postgres each is one
 * `security invoker` function whose rows are audited by trigger. The mock has
 * neither, so it does the next honest thing, exactly as `commitConfirmation`
 * does: it checks every precondition it can see, snapshots every table it can
 * touch, writes, and on any failure puts every table back. The audit rows and
 * the alert rows go in through the `security definer` door, because in
 * Postgres nobody's statement writes those — a trigger does (`ERD.md` §6.5,
 * §10.2).
 *
 * **This module is the authority on the dates.** A caller says which
 * batteries go where; the start date each carries, the receiving container's
 * new start and whether it moved are computed here from the rows, with the
 * pure functions in `src/domain/storage`, and a start that would move later is
 * refused rather than written (Rules 4.6, 4.9–4.12).
 */

const store = () => mockStore();

/** The tables a storage write can touch, for the rollback. */
function snapshot(): () => void {
  const s = store();
  const tables = [
    s.batteryRecords,
    s.containers,
    s.storageClocks,
    s.storageEvents,
    s.alerts,
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

// --- reading what the rows say ---------------------------------------------------------

/**
 * A container's contents: every non-voided, non-draft record whose
 * `container_id` names it. A voided record is retained and sits outside every
 * operational count (Rule 12.12); a draft belongs to its intake session.
 */
function contentsOf(ctx: RequestContext, containerId: Uuid): BatteryRecord[] {
  return store()
    .batteryRecords.all()
    .filter(
      (record) =>
        record.organizationId === ctx.organizationId &&
        record.containerId === containerId &&
        record.status !== "voided" &&
        record.status !== "draft",
    );
}

/** The container's clock: the running one, else its most recent stopped one, else none. */
function clockOf(ctx: RequestContext, containerId: Uuid): StorageClock | null {
  const clocks = store()
    .storageClocks.all()
    .filter(
      (clock) =>
        clock.organizationId === ctx.organizationId &&
        clock.containerId === containerId,
    );
  return (
    clocks.find((clock) => clock.stoppedAt === null) ??
    [...clocks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
    null
  );
}

function facts(
  container: Container,
  clock: StorageClock | null,
  contentCount: number,
): MoveContainerFacts {
  return {
    id: container.id,
    status: container.status,
    containerType: container.containerType,
    siteTimeZone: container.siteTimeZone,
    siteAddress: container.siteAddress,
    accumulationStartedAt: container.accumulationStartedAt,
    clockStatus: clock?.status ?? null,
    contentCount,
  };
}

function massOf(records: readonly BatteryRecord[]): string {
  return records.reduce(
    (total, record) =>
      record.batteryMassKg === null
        ? total
        : addDecimal(total, record.batteryMassKg),
    "0",
  );
}

/** Never below zero: a fixture whose mass disagrees with its contents does not go negative. */
function lessMass(current: string | null, removed: string): string | null {
  if (current === null) return null;
  const next = subtractDecimal(current, removed);
  return compareDecimal(next, "0") < 0 ? "0" : next;
}

// --- writing ------------------------------------------------------------------------------

interface AuditBody {
  readonly eventType: AuditEventType;
  readonly entityTable: string;
  readonly entityId: Uuid;
  readonly beforeState: JsonObject | null;
  readonly afterState: JsonObject | null;
  readonly changedFields?: readonly string[] | null;
  readonly governingRuleVersionId?: Uuid | null;
  readonly reason?: string | null;
}

/** A person's act, as the trigger would record it — actor from `ctx`, attribution from the request. */
async function audit(
  ctx: RequestContext,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
  body: AuditBody,
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
    ruleVersionsApplied: null,
    correlationId: ctx.correlationId,
    requestId: attribution.requestId,
    ipAddress: attribution.ipAddress,
    userAgent: attribution.userAgent,
    reason: body.reason ?? null,
  };
  await store().auditEvents.insertAsDefiner(
    ctx,
    buildAuditEvent(ctx, row, nextId()),
  );
}

async function appendEvent(
  ctx: RequestContext,
  input: Omit<StorageEvent, "id" | "organizationId" | "createdAt">,
): Promise<StorageEvent> {
  return store().storageEvents.insert(ctx, {
    ...input,
    id: nextId(),
    organizationId: ctx.organizationId,
    createdAt: now(),
  });
}

/**
 * Raise a storage-clock alert as the evaluation job would — idempotent on the
 * dedupe key, and through the trigger's door: `alert` INSERT belongs to no
 * tenant role (`ERD.md` §6.5), because nobody types an alert.
 */
async function raiseClockAlert(
  ctx: RequestContext,
  container: Container,
  clock: StorageClock,
  evaluation: ClockEvaluation,
  at: IsoTimestamp,
): Promise<void> {
  if (!evaluation.changed || evaluation.alertBand === "none") return;
  const draft = storageClockAlert({
    containerCode: container.containerCode,
    containerId: container.id,
    storageClockId: clock.id,
    band: evaluation.alertBand,
    clockStartAt: clock.clockStartAt,
    dueAt: clock.dueAt,
    maxDurationDays: clock.maxDurationDays,
    timeZone: clock.timeZone,
    governingRuleVersionId: clock.governingRuleVersionId,
    asOf: at,
  });
  const existing = store()
    .alerts.all()
    .find(
      (alert) =>
        alert.organizationId === ctx.organizationId &&
        alert.dedupeKey === draft.dedupeKey &&
        alert.resolvedAt === null,
    );
  if (existing !== undefined) return;
  const row: Alert = {
    ...draft,
    id: nextId(),
    organizationId: ctx.organizationId,
    audienceRoles: [...draft.audienceRoles],
    batteryRecordId: null,
    shipmentId: null,
    intakeSessionId: null,
    recallMatchId: null,
    obligationDeadlineId: null,
    // No site entity exists (`ERD.md` §6.1): the routing column stays empty
    // rather than carrying a guess. Reported in the build-notes.
    siteIdRef: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolutionReason: null,
    deliveredChannels: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await store().alerts.insertAsDefiner(ctx, row);
}

function refuseMove(
  ctx: RequestContext,
  message: string,
  context: Record<string, unknown>,
): never {
  throw new ValidationError({
    userMessage: message,
    correlationId: ctx.correlationId,
    field: "targetContainerId",
    context,
  });
}

// --- moveContents -------------------------------------------------------------------------

export async function moveContents(
  ctx: RequestContext,
  input: ContainerContentsMove,
): Promise<ContainerContentsMoveResult> {
  assertPolicy(ctx, "battery_record", "update");
  assertPolicy(ctx, "container", "update");
  assertPolicy(ctx, "storage_event", "insert");
  assertPolicy(ctx, "storage_clock", "insert");
  assertPolicy(ctx, "storage_clock", "update");

  const s = store();
  const source = await s.containers.getOrThrow(ctx, input.sourceContainerId);
  const target = await s.containers.getOrThrow(ctx, input.targetContainerId);

  const requested = new Set(input.batteryRecordIds);
  const sourceContents = contentsOf(ctx, source.id);
  const targetContents = contentsOf(ctx, target.id);
  const moving = sourceContents.filter((record) => requested.has(record.id));
  if (moving.length !== requested.size) {
    refuseMove(
      ctx,
      "One of those batteries is not in this container. Nothing was moved.",
      { reason: "not_in_source" },
    );
  }

  const sourceClock = clockOf(ctx, source.id);
  const targetClock = clockOf(ctx, target.id);

  const admission = admitContentsMove({
    operation: input.operation,
    source: facts(source, sourceClock, sourceContents.length),
    target: facts(target, targetClock, targetContents.length),
    movingCount: moving.length,
  });
  if (!admission.ok) {
    refuseMove(ctx, admission.message, { reason: admission.reason });
  }

  // Rule 4.9 — each battery's own start, from its own `place` events.
  const events = s.storageEvents
    .all()
    .filter(
      (event) =>
        event.organizationId === ctx.organizationId &&
        event.batteryRecordId !== null &&
        requested.has(event.batteryRecordId),
    );
  const carried = new Map<Uuid, IsoTimestamp>();
  for (const record of moving) {
    const start = carriedAccumulationStart({
      events: events.filter((event) => event.batteryRecordId === record.id),
      containerAccumulationStartedAt: source.accumulationStartedAt,
    });
    if (start === null) {
      // A placed record whose container has no start is a broken row, and a
      // move built on it would invent a date. Refuse; never default.
      throw new DataIntegrityError({
        userMessage:
          "A battery in this container has no accumulation start date on record, so it cannot be moved. Nothing was changed.",
        correlationId: ctx.correlationId,
        context: { batteryRecordId: record.id, containerId: source.id },
      });
    }
    carried.set(record.id, start);
  }

  const plan = planReceipt({
    operation: input.operation,
    target: {
      accumulationStartedAt: target.accumulationStartedAt,
      accumulationStartSource: target.accumulationStartSource,
    },
    carriedStarts: [...carried.values()],
  });

  // --- the receiving clock: start it, move its start earlier, or join it ----------------
  const needsFigures = targetClock === null || plan.startChanged;
  const timeZone = targetClock?.timeZone ?? target.siteTimeZone;
  let figures: ReturnType<typeof startStorageClock> | null = null;
  if (needsFigures) {
    const rule = input.accumulationRule;
    const startDay = civilDateInZone(plan.accumulationStartedAt, timeZone);
    // Rule 4.5 — the period in force at the site on the start date. The caller
    // resolved it; a rule that is not in force on the date computed here means
    // the two read different rows, and nothing is written on a guess.
    if (
      rule === null ||
      rule.ruleKey !== ACCUMULATION_RULE_KEY ||
      !isInForceOn(rule.version, startDay)
    ) {
      throw new RuleResolutionError({
        userMessage:
          `No accumulation period is on record for this site on ${startDay}, the date the receiving ` +
          "container's clock would start from. Nothing was moved.",
        correlationId: ctx.correlationId,
        context: { rule: "4.5", startDay, targetContainerId: target.id },
      });
    }
    figures = startStorageClock(
      {
        placedAt: plan.accumulationStartedAt,
        timeZone,
        existingClock: null,
        basis: plan.clockStartBasis ?? "first_placement",
      },
      rule,
    );
  }

  return atomically(async () => {
    const at = input.at;

    // Each battery changes container. Only `containerId` moves — through the
    // table, not through `batteryRecords.update`, whose guard strips the two
    // legal booleans; nothing else about the record is touched.
    for (const record of moving) {
      await s.batteryRecords.update(ctx, record.id, {
        containerId: target.id,
        updatedAt: now(),
        updatedBy: ctx.userId,
      });
    }

    let clock: StorageClock;
    if (targetClock === null) {
      if (figures === null) throw new Error("unreachable: figures resolved");
      const result = figures.result;
      clock = await s.storageClocks.insert(ctx, {
        id: nextId(),
        organizationId: ctx.organizationId,
        subjectType: "container",
        batteryRecordId: null,
        containerId: target.id,
        clockStartAt: result.clockStartAt,
        clockStartBasis: plan.clockStartBasis ?? "first_placement",
        timeZone: result.timeZone,
        maxDurationDays: result.maxDurationDays,
        governingRuleVersionId: governingRuleVersionId(figures),
        evaluationTrace: evaluationTrace(figures),
        dueAt: result.dueAt,
        alertSchedule: result.alertSchedule,
        alertBand: "none",
        nextAlertAt: result.nextAlertAt,
        stoppedAt: null,
        stopReason: null,
        status: "running",
        createdAt: now(),
        updatedAt: now(),
      });
    } else if (figures !== null) {
      // The start moved earlier (Rule 4.10). The clock is re-based in place —
      // one instance per accumulation cycle — and never later than it was.
      assertNeverLater(targetClock.clockStartAt, figures.result.clockStartAt);
      clock = await s.storageClocks.update(ctx, targetClock.id, {
        clockStartAt: figures.result.clockStartAt,
        clockStartBasis: plan.clockStartBasis ?? targetClock.clockStartBasis,
        maxDurationDays: figures.result.maxDurationDays,
        governingRuleVersionId: governingRuleVersionId(figures),
        evaluationTrace: evaluationTrace(figures),
        dueAt: figures.result.dueAt,
        alertSchedule: figures.result.alertSchedule,
        updatedAt: now(),
      });
    } else {
      clock = targetClock;
    }

    // The job's evaluation, now, so receipt that makes a container overdue
    // shows it at the moment of the move (Rule 4.10; E-6).
    const evaluation = evaluateStorageClock(clock, at);
    if (evaluation.changed || evaluation.nextAlertAt !== clock.nextAlertAt) {
      clock = await s.storageClocks.update(ctx, clock.id, {
        status: evaluation.status,
        alertBand: evaluation.alertBand,
        nextAlertAt: evaluation.nextAlertAt,
        updatedAt: now(),
      });
    }

    assertNeverLater(target.accumulationStartedAt, plan.accumulationStartedAt);
    const becameOverdue =
      evaluation.status === "overdue" && target.status !== "overdue";
    const updatedTarget = await s.containers.update(ctx, target.id, {
      accumulationStartedAt: plan.accumulationStartedAt,
      accumulationStartSource: plan.accumulationStartSource,
      currentNetMassKg: addDecimal(
        target.currentNetMassKg ?? "0",
        massOf(moving),
      ),
      ...(becameOverdue ? { status: "overdue" as const } : {}),
      updatedAt: now(),
      updatedBy: ctx.userId,
    });

    const sourceEmptied = emptiesSource({
      contentCount: sourceContents.length,
      movingCount: moving.length,
    });
    const updatedSource = await s.containers.update(ctx, source.id, {
      currentNetMassKg: lessMass(source.currentNetMassKg, massOf(moving)),
      updatedAt: now(),
      updatedBy: ctx.userId,
    });
    let stoppedSourceClock: StorageClock | null = null;
    if (
      sourceEmptied &&
      sourceClock !== null &&
      sourceClock.stoppedAt === null
    ) {
      // Rule 4.7 — reaching empty closes the clock. Its start date stays on
      // the row as evidence, and the batteries carry it with them (Rule 4.8).
      stoppedSourceClock = await s.storageClocks.update(ctx, sourceClock.id, {
        status: "stopped",
        stoppedAt: at,
        stopReason: "emptied",
        nextAlertAt: null,
        updatedAt: now(),
      });
    }

    // T-16 — `repackage` off the source, then `place` into the receiving
    // container, one pair per battery. The `place` payload records the date
    // the battery carries, so the next move reads it rather than re-deriving.
    for (const record of moving) {
      const carriedStart = carried.get(record.id) ?? plan.accumulationStartedAt;
      await appendEvent(ctx, {
        activityType: "repackage",
        storageClockId: sourceClock?.id ?? null,
        containerId: source.id,
        batteryRecordId: record.id,
        lotId: source.lotId,
        occurredAt: at,
        recordedAt: at,
        recordedBy: ctx.userId,
        payload: { operation: input.operation, toContainerId: target.id },
        governingRuleVersionId: null,
      });
      await appendEvent(ctx, {
        activityType: "place",
        storageClockId: clock.id,
        containerId: target.id,
        batteryRecordId: record.id,
        lotId: target.lotId,
        occurredAt: at,
        recordedAt: at,
        recordedBy: ctx.userId,
        payload: {
          operation: input.operation,
          fromContainerId: source.id,
          [CARRIED_START_PAYLOAD_KEY]: carriedStart,
        },
        governingRuleVersionId: clock.governingRuleVersionId,
      });
      await audit(ctx, at, input.attribution, {
        eventType: "storage_event.recorded",
        entityTable: "battery_record",
        entityId: record.id,
        beforeState: { containerId: source.id },
        afterState: {
          containerId: target.id,
          operation: input.operation,
          [CARRIED_START_PAYLOAD_KEY]: carriedStart,
        },
        changedFields: ["containerId"],
        governingRuleVersionId: clock.governingRuleVersionId,
      });
    }

    if (plan.startChanged) {
      await audit(ctx, at, input.attribution, {
        eventType: "storage_event.recorded",
        entityTable: "container",
        entityId: target.id,
        beforeState: {
          accumulationStartedAt: plan.previousAccumulationStartedAt,
          accumulationStartSource: target.accumulationStartSource,
        },
        afterState: {
          accumulationStartedAt: plan.accumulationStartedAt,
          accumulationStartSource: plan.accumulationStartSource,
          operation: input.operation,
          fromContainerId: source.id,
        },
        changedFields: ["accumulationStartedAt", "accumulationStartSource"],
        governingRuleVersionId: clock.governingRuleVersionId,
      });
    }
    if (targetClock === null || evaluation.changed || figures !== null) {
      await audit(ctx, at, input.attribution, {
        eventType: "storage_clock.status_changed",
        entityTable: "storage_clock",
        entityId: clock.id,
        beforeState:
          targetClock === null
            ? { status: "not_started" }
            : {
                status: targetClock.status,
                alertBand: targetClock.alertBand,
                clockStartAt: targetClock.clockStartAt,
                dueAt: targetClock.dueAt,
              },
        afterState: {
          status: clock.status,
          alertBand: clock.alertBand,
          clockStartAt: clock.clockStartAt,
          clockStartBasis: clock.clockStartBasis,
          dueAt: clock.dueAt,
          containerId: target.id,
        },
        governingRuleVersionId: clock.governingRuleVersionId,
      });
    }
    if (becameOverdue) {
      await audit(ctx, at, input.attribution, {
        eventType: "container.status_changed",
        entityTable: "container",
        entityId: target.id,
        beforeState: { status: target.status },
        afterState: { status: "overdue" },
        changedFields: ["status"],
        governingRuleVersionId: clock.governingRuleVersionId,
      });
    }
    if (stoppedSourceClock !== null && sourceClock !== null) {
      await audit(ctx, at, input.attribution, {
        eventType: "storage_clock.status_changed",
        entityTable: "storage_clock",
        entityId: sourceClock.id,
        beforeState: { status: sourceClock.status },
        afterState: { status: "stopped", stopReason: "emptied" },
        changedFields: ["status", "stoppedAt", "stopReason"],
        governingRuleVersionId: sourceClock.governingRuleVersionId,
      });
    }

    await raiseClockAlert(ctx, updatedTarget, clock, evaluation, at);

    return {
      source: updatedSource,
      target: updatedTarget,
      targetClock: clock,
      previousTargetStart: plan.previousAccumulationStartedAt,
      targetStartChanged: plan.startChanged,
      targetBecameOverdue: becameOverdue,
      sourceEmptied,
    };
  });
}

// --- recordStorageEvent -------------------------------------------------------------------

/** P2 or P6 — `SITE_ARCHITECTURE.md` §5.5; T-16 `remediate`. */
function mayRemediate(ctx: RequestContext): boolean {
  return ctx.isPlatformAdmin || ctx.role === "facility_manager";
}

export async function recordStorageEvent(
  ctx: RequestContext,
  input: ContainerStorageEvent,
): Promise<StorageEvent> {
  assertPolicy(ctx, "storage_event", "insert");
  const container = await store().containers.getOrThrow(ctx, input.containerId);
  const clock = clockOf(ctx, container.id);

  if (Date.parse(input.occurredAt) > Date.parse(input.at)) {
    throw new ValidationError({
      userMessage: "A storage event cannot be recorded in the future.",
      correlationId: ctx.correlationId,
      field: "occurredAt",
      context: { occurredAt: input.occurredAt },
    });
  }

  if (input.kind === "remediate") {
    if (!mayRemediate(ctx)) {
      throw new PermissionError({
        userMessage:
          "Only a Facility Manager or a Platform Admin can record a remediation.",
        correlationId: ctx.correlationId,
        context: { rule: "4.17", role: ctx.role },
      });
    }
    if (container.status !== "overdue") {
      throw new ValidationError({
        userMessage:
          "A remediation is recorded against an overdue container. This one is not overdue.",
        correlationId: ctx.correlationId,
        context: { rule: "4.17", status: container.status },
      });
    }
    if (input.statement.trim() === "") {
      throw new ValidationError({
        userMessage:
          "State what was done with the contents, and why. A remediation is never recorded without it.",
        correlationId: ctx.correlationId,
        field: "statement",
        context: { rule: "4.17" },
      });
    }
  }

  return atomically(async () => {
    const statement =
      input.kind === "remediate" ? input.statement.trim() : null;
    const note =
      input.kind === "inspect" &&
      input.note !== null &&
      input.note.trim() !== ""
        ? input.note.trim()
        : null;
    const event = await appendEvent(ctx, {
      activityType: input.kind,
      storageClockId: clock?.id ?? null,
      containerId: container.id,
      batteryRecordId: null,
      lotId: container.lotId,
      occurredAt: input.occurredAt,
      recordedAt: input.at,
      recordedBy: ctx.userId,
      payload: input.kind === "remediate" ? { statement } : { note },
      governingRuleVersionId: null,
    });
    // A remediation changes no date and no status (Rule 4.17; owner's call in
    // this unit): the event and its audit row are the whole of it.
    await audit(ctx, input.at, input.attribution, {
      eventType: "storage_event.recorded",
      entityTable: "container",
      entityId: container.id,
      beforeState: null,
      afterState: {
        activityType: input.kind,
        storageEventId: event.id,
        occurredAt: input.occurredAt,
        ...(note === null ? {} : { note }),
      },
      reason: statement,
    });
    return event;
  });
}

// --- changeStatus -------------------------------------------------------------------------

/** From where a person may close a container — T-24: overdue ships out too. */
const CLOSABLE: readonly Container["status"][] = ["open", "full", "overdue"];

export async function changeStatus(
  ctx: RequestContext,
  input: ContainerStatusChange,
): Promise<Container> {
  assertPolicy(ctx, "container", "update");
  const container = await store().containers.getOrThrow(ctx, input.containerId);
  const contents = contentsOf(ctx, container.id);
  const clock = clockOf(ctx, container.id);

  if (input.status === "closed") {
    if (!CLOSABLE.includes(container.status)) {
      throw new ConflictError({
        userMessage:
          "This container cannot be marked ready to ship from its current status.",
        correlationId: ctx.correlationId,
        context: { status: container.status },
      });
    }
    if (contents.length === 0) {
      throw new ValidationError({
        userMessage:
          "This container holds nothing, so there is nothing to ship.",
        correlationId: ctx.correlationId,
        context: { containerId: container.id },
      });
    }
  } else {
    // Rule 4.30 — P2 or P6, an empty container, a clock that is closed or
    // never started. A container is never deleted.
    if (!(ctx.isPlatformAdmin || ctx.role === "facility_manager")) {
      throw new PermissionError({
        userMessage:
          "Only a Facility Manager or a Platform Admin can retire a container.",
        correlationId: ctx.correlationId,
        context: { rule: "4.30", role: ctx.role },
      });
    }
    const clockRunning = clock !== null && clock.stoppedAt === null;
    if (contents.length > 0 || clockRunning || container.status === "retired") {
      throw new ValidationError({
        userMessage:
          "Only an empty container whose storage clock has closed can be retired.",
        correlationId: ctx.correlationId,
        context: { rule: "4.30", contents: contents.length, clockRunning },
      });
    }
  }

  return atomically(async () => {
    const updated = await store().containers.update(ctx, container.id, {
      status: input.status,
      ...(input.status === "closed" ? { sealedAt: input.at } : {}),
      updatedAt: now(),
      updatedBy: ctx.userId,
    });
    await audit(ctx, input.at, input.attribution, {
      eventType: "container.status_changed",
      entityTable: "container",
      entityId: container.id,
      beforeState: { status: container.status },
      afterState: { status: input.status },
      changedFields:
        input.status === "closed" ? ["status", "sealedAt"] : ["status"],
    });
    // TODO(T-16, T-44) — §3.10 C4(c): marking ready to ship "writes a
    // storage_event" and "raises it on / for P1 and P6". T-16 has no activity
    // for it and T-44 no alert type, so neither is written — a row under a
    // near neighbour is worse than none (TAXONOMY.md §1.1). Build-notes.
    return updated;
  });
}
