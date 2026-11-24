import type { RequestContext } from "@/data/contracts/context";
import type { ScheduledJobContext } from "@/data/contracts/jobs";
import type {
  AddProducerProduct,
  ChangeProducerProductStates,
  CompleteObligationDeadline,
  DeadlineAlertDraft,
  DeadlineAlertReading,
  DeadlineAlertsRecorded,
  ObligationDeadlineQuery,
  ObligationDeadlineRepository,
  ProducerLastRun,
  ProducerObligationJobPlan,
  ProducerObligationQuery,
  ProducerObligationRepository,
  ProducerProductQuery,
  ProducerProductRepository,
  ProducerRunRecorded,
  ProducerRunWrite,
  RemoveProducerProduct,
  ReopenObligationDeadline,
} from "@/data/contracts/producer";
import type { Page } from "@/data/contracts/repository";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import {
  mayTakeProducerAction,
  rolesForProducerAction,
  type ProducerAction,
} from "@/domain/access/producer-actions";
import {
  deadlineOfAlertKey,
  RUN_TRIGGERS,
  type ProducerRunPlan,
  type RunTrigger,
} from "@/domain/producer";
import { civilDateInZone } from "@/domain/storage/clock-display";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import { ConflictError, PermissionError, ValidationError } from "@/lib/errors";
import type { IsoTimestamp, JsonObject, JsonValue, Uuid } from "@/types/common";
import type {
  ObligationDeadline,
  ProducerObligation,
  ProducerProduct,
} from "@/types/producer";
import type { Alert } from "@/types/storage";

import {
  writeJobAudit,
  writeTriggerAudit,
  type TriggerAuditBody,
} from "./audit-row";
import { now } from "./factory";
import { nextId } from "./ids";
import { mockPlatformConfiguration } from "./platform-configuration";
import { issuedPacketOf } from "./filing-writes";
import { deadlineAlertSubjects } from "./producer-alert-subjects";
import { activeProducts, gatherProducerInputs } from "./producer-inputs";
import { mockStore } from "./store";

/**
 * Producer obligations, read and written — `ProducerProductRepository`,
 * `ProducerObligationRepository`, `ObligationDeadlineRepository` and the
 * nightly job's half; Rules 8.6–8.16; T-43, T-44, T-68–T-70; D-78.
 *
 * **Nothing here decides a band, a status or a date.** The domain computed
 * every row a run writes; this applies the plan — new rows, the old ones
 * retired, deadlines carried — together with one
 * `producer_obligation.evaluated` row, or none of it (Rule 8.11). A done
 * deadline is never touched by a run (Rule 8.12). Every change and every
 * denial writes an `audit_event` (Rule 8.15): the denial is the Server
 * Action's, through the guard; the change is here.
 */

const store = () => mockStore();

const AUDIENCE: readonly string[] = ["producer_compliance_officer"];

function refuse(ctx: RequestContext, action: ProducerAction): never {
  const who = rolesForProducerAction(action)
    .filter((role) => role !== "facility_manager" && role !== "auditor")
    .map((role) => ROLE_LABELS[role])
    .join(" or ");
  throw new PermissionError({
    userMessage: `Your role cannot change producer obligations. ${who} can.`,
    correlationId: ctx.correlationId,
    context: { action, role: ctx.role, rule: "8.15" },
  });
}

function guard(ctx: RequestContext, action: ProducerAction): void {
  if (!mayTakeProducerAction(ctx.role, action)) refuse(ctx, action);
}

function invalid(ctx: RequestContext, message: string, field?: string): never {
  throw new ValidationError({
    userMessage: message,
    correlationId: ctx.correlationId,
    ...(field === undefined ? {} : { field }),
    context: { rule: "8.6" },
  });
}

async function atomically<T>(write: () => Promise<T>): Promise<T> {
  const s = store();
  const saved = {
    products: [...s.producerProducts.all()],
    obligations: [...s.producerObligations.all()],
    deadlines: [...s.obligationDeadlines.all()],
    alerts: [...s.alerts.all()],
    audit: [...s.auditEvents.all()],
  };
  try {
    return await write();
  } catch (cause) {
    s.producerProducts.replaceAll(saved.products);
    s.producerObligations.replaceAll(saved.obligations);
    s.obligationDeadlines.replaceAll(saved.deadlines);
    s.alerts.replaceAll(saved.alerts);
    s.auditEvents.replaceAll(saved.audit);
    throw cause;
  }
}

function productSnapshot(product: ProducerProduct): JsonObject {
  return {
    catalogEntryId: product.catalogEntryId,
    jurisdictionIds: [...product.jurisdictionIds],
    removedAt: product.removedAt,
  };
}

function uniqueStates(ids: readonly Uuid[]): readonly Uuid[] {
  return [...new Set(ids)];
}

function assertStates(ctx: RequestContext, ids: readonly Uuid[]): void {
  if (ids.length === 0) {
    invalid(ctx, "Choose at least one state it is sold in.", "jurisdictionIds");
  }
  const known = new Set(
    store()
      .jurisdictions.all()
      .filter((row) => row.level === "state")
      .map((row) => row.id),
  );
  if (ids.some((id) => !known.has(id))) {
    invalid(ctx, "One of those states is not on file.", "jurisdictionIds");
  }
}

// --- producer_product -----------------------------------------------------------------------

export const mockProducerProducts: ProducerProductRepository = {
  async list(ctx, query: ProducerProductQuery): Promise<Page<ProducerProduct>> {
    return store().producerProducts.list(
      ctx,
      query,
      (row) => query.includeRemoved === true || row.removedAt === null,
      (a, b) => a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id),
    );
  },

  async get(ctx, id) {
    return store().producerProducts.get(ctx, id);
  },

  async add(ctx, input: AddProducerProduct) {
    guard(ctx, "manage_products");
    const s = store();
    const entry = s.catalogEntries
      .all()
      .find((row) => row.id === input.catalogEntryId);
    if (entry === undefined || entry.status !== "published") {
      invalid(
        ctx,
        "Only a published catalog entry can be declared as a product.",
        "catalogEntryId",
      );
    }
    const states = uniqueStates(input.jurisdictionIds);
    assertStates(ctx, states);
    const already = activeProducts(
      { producerProducts: s.producerProducts.all() },
      ctx.organizationId,
    ).some((row) => row.catalogEntryId === input.catalogEntryId);
    if (already) {
      throw new ConflictError({
        userMessage:
          "That product is already declared. Edit its states instead.",
        correlationId: ctx.correlationId,
        context: { catalogEntryId: input.catalogEntryId },
      });
    }
    return atomically(async () => {
      const row: ProducerProduct = {
        id: nextId(),
        organizationId: ctx.organizationId,
        catalogEntryId: input.catalogEntryId,
        jurisdictionIds: states,
        addedAt: input.at,
        addedBy: ctx.userId,
        removedAt: null,
        removedBy: null,
        removalReason: null,
        createdAt: now(),
        updatedAt: now(),
      };
      await s.producerProducts.insert(ctx, row);
      await writeTriggerAudit(ctx, input.at, input.attribution, {
        eventType: "producer_product.added",
        entityTable: "producer_product",
        entityId: row.id,
        beforeState: null,
        afterState: productSnapshot(row),
        changedFields: ["catalogEntryId", "jurisdictionIds"],
      });
      return row;
    });
  },

  async changeStates(ctx, id, input: ChangeProducerProductStates) {
    guard(ctx, "manage_products");
    const s = store();
    const existing = await s.producerProducts.getOrThrow(ctx, id);
    if (existing.removedAt !== null) {
      invalid(ctx, "That product was removed. Add it again instead.");
    }
    const states = uniqueStates(input.jurisdictionIds);
    assertStates(ctx, states);
    return atomically(async () => {
      const updated = await s.producerProducts.update(ctx, id, {
        jurisdictionIds: states,
        updatedAt: now(),
      });
      await writeTriggerAudit(ctx, input.at, input.attribution, {
        eventType: "producer_product.changed",
        entityTable: "producer_product",
        entityId: id,
        beforeState: productSnapshot(existing),
        afterState: productSnapshot(updated),
        changedFields: ["jurisdictionIds"],
      });
      return updated;
    });
  },

  async remove(ctx, id, input: RemoveProducerProduct) {
    guard(ctx, "manage_products");
    const reason = input.reason.trim();
    if (reason === "") invalid(ctx, "Say why it is removed.", "reason");
    const s = store();
    const existing = await s.producerProducts.getOrThrow(ctx, id);
    if (existing.removedAt !== null) {
      invalid(ctx, "That product is already removed.");
    }
    return atomically(async () => {
      const updated = await s.producerProducts.update(ctx, id, {
        removedAt: input.at,
        removedBy: ctx.userId,
        removalReason: reason,
        updatedAt: now(),
      });
      await writeTriggerAudit(ctx, input.at, input.attribution, {
        eventType: "producer_product.removed",
        entityTable: "producer_product",
        entityId: id,
        beforeState: productSnapshot(existing),
        afterState: productSnapshot(updated),
        changedFields: ["removedAt", "removedBy", "removalReason"],
        reason,
      });
      return updated;
    });
  },
};

// --- applying a run -------------------------------------------------------------------------

type RunActor =
  | { readonly kind: "person"; readonly attribution: StorageWriteAttribution }
  | { readonly kind: "job"; readonly label: string };

async function writeAudit(
  ctx: RequestContext,
  at: IsoTimestamp,
  actor: RunActor,
  body: TriggerAuditBody,
): Promise<void> {
  if (actor.kind === "person") {
    await writeTriggerAudit(ctx, at, actor.attribution, body);
  } else {
    await writeJobAudit(ctx, at, actor.label, body);
  }
}

function openDeadlineAlerts(ctx: RequestContext): readonly Alert[] {
  return store()
    .alerts.all()
    .filter(
      (alert) =>
        alert.organizationId === ctx.organizationId &&
        alert.alertType === "obligation_deadline" &&
        alert.resolvedAt === null,
    );
}

async function resolveAlert(
  ctx: RequestContext,
  alert: Alert,
  reason: string,
  at: IsoTimestamp,
  actor: RunActor,
): Promise<void> {
  await store().alerts.updateAsDefiner(ctx, alert.id, {
    resolvedAt: at,
    resolutionReason: reason,
    updatedAt: now(),
  });
  await writeAudit(ctx, at, actor, {
    eventType: "alert.resolved",
    entityTable: "alert",
    entityId: alert.id,
    beforeState: { resolvedAt: null },
    afterState: { resolvedAt: at, alertType: alert.alertType },
    changedFields: ["resolvedAt", "resolutionReason"],
    reason,
  });
}

/** A deadline that is done or withdrawn wants no alert (Rule 8.13). */
async function resolveAlertsOfClosedDeadlines(
  ctx: RequestContext,
  at: IsoTimestamp,
  actor: RunActor,
): Promise<number> {
  const deadlines = new Map(
    store()
      .obligationDeadlines.all()
      .filter((row) => row.organizationId === ctx.organizationId)
      .map((row) => [row.id, row]),
  );
  let resolved = 0;
  for (const alert of openDeadlineAlerts(ctx)) {
    const deadline =
      alert.obligationDeadlineId === null
        ? undefined
        : deadlines.get(alert.obligationDeadlineId);
    if (deadline === undefined || deadline.status === "open") continue;
    await resolveAlert(
      ctx,
      alert,
      deadline.status === "completed"
        ? "The deadline was marked done."
        : "The obligation stopped applying, so the deadline was withdrawn.",
      at,
      actor,
    );
    resolved += 1;
  }
  return resolved;
}

function triggerOf(value: JsonValue | undefined): RunTrigger | null {
  return typeof value === "string" &&
    (RUN_TRIGGERS as readonly string[]).includes(value)
    ? (value as RunTrigger)
    : null;
}

async function applyRun(
  ctx: RequestContext,
  plan: ProducerRunPlan,
  at: IsoTimestamp,
  actor: RunActor,
): Promise<ProducerRunRecorded> {
  return atomically(async () => {
    const s = store();
    const runId = nextId();
    const ids = new Map<string, Uuid>();

    // The superseded rows stop being current before their successors land
    // (the partial unique index on `is_current`).
    for (const id of plan.retire) {
      await s.producerObligations.updateAsDefiner(ctx, id, {
        isCurrent: false,
        updatedAt: now(),
      });
    }
    for (const draft of plan.inserts) {
      const id = nextId();
      ids.set(draft.ref, id);
      await s.producerObligations.insertAsDefiner(ctx, {
        id,
        organizationId: ctx.organizationId,
        jurisdictionId: draft.jurisdictionId,
        jurisdictionRuleId: draft.jurisdictionRuleId,
        governingRuleVersionId: draft.governingRuleVersionId,
        obligationKey: draft.obligationKey,
        obligationTitle: draft.obligationTitle,
        citation: draft.citation,
        appliesBecause: draft.appliesBecause,
        evaluationTrace: draft.evaluationTrace,
        stewardshipOrgName: draft.stewardshipOrgName,
        status: draft.status,
        determinedAt: at,
        determinedBy: actor.kind === "person" ? ctx.userId : null,
        isCurrent: true,
        supersedesProducerObligationId: draft.supersedesProducerObligationId,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    const targetId = (
      target: ProducerRunPlan["deadlineChanges"][number]["target"],
    ): Uuid => {
      if (target.kind === "existing") return target.id;
      const id = ids.get(target.ref);
      if (id === undefined) {
        throw new RangeError(
          `a deadline names an obligation the run did not write: ${target.ref}`,
        );
      }
      return id;
    };
    for (const change of plan.deadlineChanges) {
      if (change.kind === "insert") {
        await s.obligationDeadlines.insertAsDefiner(ctx, {
          id: nextId(),
          organizationId: ctx.organizationId,
          producerObligationId: targetId(change.target),
          deadlineKey: change.deadlineKey,
          dueOn: change.dueOn,
          dueBasis: change.dueBasis,
          citation: change.citation,
          governingRuleVersionId: change.governingRuleVersionId,
          status: "open",
          completedOn: null,
          completedAt: null,
          completedBy: null,
          completionNote: null,
          completionReference: null,
          evidenceDocumentRenderId: null,
          reminderSchedule: null,
          nextReminderAt: null,
          createdAt: now(),
          updatedAt: now(),
        });
        continue;
      }
      const existing = s.obligationDeadlines
        .all()
        .find((row) => row.id === change.id);
      // A run never undoes a completion (Rule 8.12) — refused rather than applied.
      if (existing?.status === "completed" && change.status !== "completed") {
        throw new RangeError("a run tried to undo a completed deadline");
      }
      await s.obligationDeadlines.updateAsDefiner(ctx, change.id, {
        producerObligationId: targetId(change.target),
        status: change.status,
        citation: change.citation,
        governingRuleVersionId: change.governingRuleVersionId,
        updatedAt: now(),
      });
    }

    const alertsResolved = await resolveAlertsOfClosedDeadlines(ctx, at, actor);

    const recorded: ProducerRunRecorded = {
      runId,
      asOf: plan.asOf,
      trigger: plan.trigger,
      evaluatedAt: at,
      counts: plan.counts,
      alertsResolved,
    };
    await writeAudit(ctx, at, actor, {
      eventType: "producer_obligation.evaluated",
      entityTable: "producer_obligation",
      entityId: runId,
      beforeState: null,
      afterState: {
        trigger: plan.trigger,
        asOf: plan.asOf,
        states: plan.counts.states,
        obligations: plan.counts.obligations,
        written: plan.counts.written,
        unchanged: plan.counts.unchanged,
        deadlinesAdded: plan.counts.deadlinesAdded,
        withdrawn: plan.counts.withdrawn,
        reopened: plan.counts.reopened,
      },
      ruleVersionsApplied: plan.ruleVersionsApplied,
      governingRuleVersionId:
        plan.ruleVersionsApplied[0]?.ruleVersionId ?? null,
    });
    return recorded;
  });
}

function sourceFromStore() {
  const s = store();
  return {
    organizations: s.organizations.all(),
    producerProducts: s.producerProducts.all(),
    catalogEntries: s.catalogEntries.all(),
    jurisdictions: s.jurisdictions.all(),
    jurisdictionRules: s.jurisdictionRules.all(),
    ruleVersions: s.ruleVersions.all(),
    producerObligations: s.producerObligations.all(),
    obligationDeadlines: s.obligationDeadlines.all(),
  };
}

function obligationMatches(
  row: ProducerObligation,
  query: ProducerObligationQuery,
): boolean {
  return (
    (query.jurisdictionId === undefined ||
      row.jurisdictionId === query.jurisdictionId) &&
    (query.isCurrent === undefined || row.isCurrent === query.isCurrent) &&
    (query.status === undefined || row.status === query.status)
  );
}

export const mockProducerObligations: ProducerObligationRepository = {
  async list(ctx, query) {
    return store().producerObligations.list(
      ctx,
      query,
      (row) => obligationMatches(row, query),
      (a, b) =>
        a.jurisdictionId.localeCompare(b.jurisdictionId) ||
        a.obligationKey.localeCompare(b.obligationKey) ||
        b.determinedAt.localeCompare(a.determinedAt),
    );
  },

  async inputs(ctx) {
    // A read like any other: latency, seeded failure and tenant scope all
    // apply through the table it is anchored on.
    await store().producerProducts.list(ctx, { limit: 1 }, () => false);
    return gatherProducerInputs(sourceFromStore(), ctx.organizationId);
  },

  async run(ctx, input: ProducerRunWrite) {
    guard(ctx, "check_now");
    return applyRun(ctx, input.plan, now(), {
      kind: "person",
      attribution: input.attribution,
    });
  },

  async lastRun(ctx): Promise<ProducerLastRun | null> {
    await store().producerObligations.list(ctx, { limit: 1 }, () => false);
    // Read as the definer reads it: the latest run's own audit row. A
    // P3 cannot open the audit log (Rule 12.8); the time of the check is
    // shown on the page they can open (UX §3.21).
    const latest = store()
      .auditEvents.all()
      .filter(
        (event) =>
          event.organizationId === ctx.organizationId &&
          event.eventType === "producer_obligation.evaluated",
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
    if (latest === undefined) return null;
    const trigger = triggerOf(latest.afterState?.trigger);
    return trigger === null ? null : { at: latest.occurredAt, trigger };
  },
};

// --- obligation_deadline --------------------------------------------------------------------

function deadlineMatches(
  row: ObligationDeadline,
  query: ObligationDeadlineQuery,
): boolean {
  return (
    (query.producerObligationId === undefined ||
      row.producerObligationId === query.producerObligationId) &&
    (query.status === undefined || row.status === query.status)
  );
}

function deadlineSnapshot(row: ObligationDeadline): JsonObject {
  return {
    status: row.status,
    dueOn: row.dueOn,
    completedOn: row.completedOn,
    completionNote: row.completionNote,
    completionReference: row.completionReference,
    evidenceDocumentRenderId: row.evidenceDocumentRenderId,
  };
}

function organizationToday(ctx: RequestContext, at: IsoTimestamp): string {
  const organization = store()
    .organizations.all()
    .find((row) => row.id === ctx.organizationId);
  return civilDateInZone(at, organization?.timeZone ?? "UTC");
}

export const mockObligationDeadlines: ObligationDeadlineRepository = {
  async list(ctx, query) {
    return store().obligationDeadlines.list(
      ctx,
      query,
      (row) => deadlineMatches(row, query),
      (a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id),
    );
  },

  async get(ctx, id) {
    return store().obligationDeadlines.get(ctx, id);
  },

  async complete(ctx, id, input: CompleteObligationDeadline) {
    guard(ctx, "mark_deadline");
    const s = store();
    const existing = await s.obligationDeadlines.getOrThrow(ctx, id);
    if (existing.status !== "open") {
      throw new ConflictError({
        userMessage:
          existing.status === "completed"
            ? "That deadline is already marked done."
            : "That deadline was withdrawn — its obligation no longer applies.",
        correlationId: ctx.correlationId,
        context: { id, status: existing.status },
      });
    }
    const note = input.note.trim();
    if (note === "") {
      invalid(ctx, "Say what was done — the note is required.", "note");
    }
    if (input.completedOn > organizationToday(ctx, input.at)) {
      invalid(
        ctx,
        "The date it was met cannot be in the future.",
        "completedOn",
      );
    }
    const reference = input.reference?.trim() ?? "";
    // Rule 8.19 — the evidence is one of this deadline's issued packets, or
    // nothing. A superseded packet, or another deadline's, is refused.
    const evidenceId = input.evidenceDocumentRenderId ?? null;
    if (evidenceId !== null && issuedPacketOf(ctx, id, evidenceId) === null) {
      invalid(
        ctx,
        "That packet isn't an issued packet of this deadline. Pick one listed under it, or none.",
        "evidenceDocumentRenderId",
      );
    }
    return atomically(async () => {
      const updated = await s.obligationDeadlines.update(ctx, id, {
        status: "completed",
        completedOn: input.completedOn,
        completedAt: input.at,
        completedBy: ctx.userId,
        completionNote: note,
        completionReference: reference === "" ? null : reference,
        evidenceDocumentRenderId: evidenceId,
        updatedAt: now(),
      });
      await writeTriggerAudit(ctx, input.at, input.attribution, {
        eventType: "obligation_deadline.completed",
        entityTable: "obligation_deadline",
        entityId: id,
        beforeState: deadlineSnapshot(existing),
        afterState: deadlineSnapshot(updated),
        changedFields: [
          "status",
          "completedOn",
          "completedAt",
          "completedBy",
          "completionNote",
          "completionReference",
          "evidenceDocumentRenderId",
        ],
        governingRuleVersionId: existing.governingRuleVersionId,
      });
      await resolveAlertsOfClosedDeadlines(ctx, input.at, {
        kind: "person",
        attribution: input.attribution,
      });
      return updated;
    });
  },

  async reopen(ctx, id, input: ReopenObligationDeadline) {
    guard(ctx, "mark_deadline");
    const reason = input.reason.trim();
    if (reason === "") invalid(ctx, "Say why it is reopened.", "reason");
    const s = store();
    const existing = await s.obligationDeadlines.getOrThrow(ctx, id);
    if (existing.status !== "completed") {
      throw new ConflictError({
        userMessage: "Only a deadline marked done can be reopened.",
        correlationId: ctx.correlationId,
        context: { id, status: existing.status },
      });
    }
    return atomically(async () => {
      const updated = await s.obligationDeadlines.update(ctx, id, {
        status: "open",
        completedOn: null,
        completedAt: null,
        completedBy: null,
        completionNote: null,
        completionReference: null,
        // The packet stays issued and readable; it is no longer this
        // deadline's evidence of completion.
        evidenceDocumentRenderId: null,
        updatedAt: now(),
      });
      await writeTriggerAudit(ctx, input.at, input.attribution, {
        eventType: "obligation_deadline.reopened",
        entityTable: "obligation_deadline",
        entityId: id,
        beforeState: deadlineSnapshot(existing),
        afterState: deadlineSnapshot(updated),
        changedFields: [
          "status",
          "completedOn",
          "completedAt",
          "completedBy",
          "completionNote",
          "completionReference",
          "evidenceDocumentRenderId",
        ],
        governingRuleVersionId: existing.governingRuleVersionId,
        reason,
      });
      return updated;
    });
  },
};

// --- the job --------------------------------------------------------------------------------

const NO_ONE = "00000000-0000-0000-0000-000000000000";

function jobScope(organizationId: Uuid, correlationId: string): RequestContext {
  return {
    userId: NO_ONE,
    organizationId,
    role: "auditor",
    isPlatformAdmin: false,
    correlationId,
  };
}

/** Every organization with a declared product, and the alert configuration. Read-only. */
export async function producerObligationPlan(
  job: ScheduledJobContext,
): Promise<ProducerObligationJobPlan> {
  const configuration =
    await mockPlatformConfiguration.readObligationAlertConfiguration(
      jobScope(NO_ONE, job.correlationId),
    );
  const source = sourceFromStore();
  const organizations = store()
    .organizations.all()
    .filter(
      (organization) => activeProducts(source, organization.id).length > 0,
    )
    .map((organization) => ({
      organizationId: organization.id,
      inputs: gatherProducerInputs(source, organization.id),
    }));
  return { configuration, organizations };
}

/** One organization's run, written as the job — T-60 `scheduled_job`, no person. */
export async function recordProducerObligationsForJob(
  job: ScheduledJobContext,
  organizationId: Uuid,
  plan: ProducerRunPlan,
): Promise<ProducerRunRecorded> {
  return applyRun(jobScope(organizationId, job.correlationId), plan, now(), {
    kind: "job",
    label: job.job,
  });
}

/** The organization's deadlines on current obligations, with what their alerts say. */
export async function deadlineAlertSubjectsForJob(
  job: ScheduledJobContext,
  organizationId: Uuid,
): Promise<DeadlineAlertReading> {
  const ctx = jobScope(organizationId, job.correlationId);
  const mine = <T extends { readonly organizationId: Uuid }>(
    rows: readonly T[],
  ) => rows.filter((row) => row.organizationId === ctx.organizationId);
  const subjects = deadlineAlertSubjects(
    mine(store().producerObligations.all()),
    mine(store().obligationDeadlines.all()),
  );
  return { subjects };
}

/** Raise what is wanted and not open; resolve what is open and not wanted. */
export async function recordDeadlineAlertsForJob(
  job: ScheduledJobContext,
  organizationId: Uuid,
  wanted: readonly DeadlineAlertDraft[],
  at: IsoTimestamp,
): Promise<DeadlineAlertsRecorded> {
  const ctx = jobScope(organizationId, job.correlationId);
  const actor: RunActor = { kind: "job", label: job.job };
  return atomically(async () => {
    const open = openDeadlineAlerts(ctx);
    const openKeys = new Set(open.map((alert) => alert.dedupeKey));
    const wantedKeys = new Set(wanted.map((draft) => draft.dedupeKey));
    let resolved = 0;
    for (const alert of open) {
      if (wantedKeys.has(alert.dedupeKey)) continue;
      const deadlineId = deadlineOfAlertKey(alert.dedupeKey);
      const stillWanted = wanted.some(
        (draft) => draft.deadlineId === deadlineId,
      );
      await resolveAlert(
        ctx,
        alert,
        stillWanted
          ? "The deadline moved to a nearer notice."
          : "The deadline no longer needs this notice.",
        at,
        actor,
      );
      resolved += 1;
    }
    let raised = 0;
    for (const draft of wanted) {
      if (openKeys.has(draft.dedupeKey)) continue;
      await store().alerts.insertAsDefiner(ctx, {
        id: nextId(),
        organizationId: ctx.organizationId,
        alertType: "obligation_deadline",
        severity: draft.severity,
        title: draft.title,
        body: draft.body,
        storageClockId: null,
        containerId: null,
        batteryRecordId: null,
        shipmentId: null,
        intakeSessionId: null,
        recallMatchId: null,
        obligationDeadlineId: draft.deadlineId,
        siteIdRef: null,
        audienceRoles: [...AUDIENCE],
        governingRuleVersionId: null,
        triggerSnapshot: draft.triggerSnapshot,
        raisedAt: at,
        dedupeKey: draft.dedupeKey,
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolutionReason: null,
        deliveredChannels: null,
        createdAt: now(),
        updatedAt: now(),
      });
      raised += 1;
    }
    return { raised, resolved };
  });
}
