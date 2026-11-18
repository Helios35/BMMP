import {
  evaluateProducerObligations,
  planProducerRun,
  validateObligationAlertConfiguration,
  wantedDeadlineAlerts,
} from "@/domain/producer";
import { civilDateInZone } from "@/domain/storage/clock-display";
import type { AuditEvent } from "@/types/audit";
import type { Uuid } from "@/types/common";
import type { ObligationDeadline, ProducerObligation } from "@/types/producer";
import type { Alert } from "@/types/storage";

import * as FIXTURES from "./fixtures";
import {
  AUDIT,
  JURISDICTION,
  ORG,
  PRODUCER_RUN,
  USER,
  obligationAlertRowId,
  obligationDeadlineRowId,
  producerObligationRowId,
} from "./fixtures/ids";
import { PLATFORM_OBLIGATION_ALERT_CONFIGURATION } from "./fixtures/platform-configuration";
import { deadlineAlertSubjects } from "./producer-alert-subjects";
import { gatherProducerInputs } from "./producer-inputs";

/**
 * Cascade's seeded producer-obligations run — spec §6; Rules 8.11–8.13.
 *
 * **Computed by the real domain from the fixtures**, as the nightly job would
 * have run it at {@link FIXTURES.SEEDED_OBLIGATIONS_AT}, so the page shows
 * results before anyone presses **Check now** and the seed can never drift
 * from the rule data it was computed from. Then, as the record says:
 *
 * 1. the job raised the alerts its deadlines wanted that morning;
 * 2. Priya marked DC's participation deadline done, which resolved its alert.
 *
 * Three audit rows: the run (actor `scheduled_job`), the completion and the
 * resolution (Priya). **Olympic and Rainier declare nothing**, so they have no
 * run and no row.
 */

export interface ProducerSeed {
  readonly obligations: readonly ProducerObligation[];
  readonly deadlines: readonly ObligationDeadline[];
  readonly alerts: readonly Alert[];
  readonly auditEvents: readonly AuditEvent[];
}

const JOB_LABEL = "producer-obligations";

function buildSeed(): ProducerSeed {
  const configuration = validateObligationAlertConfiguration(
    PLATFORM_OBLIGATION_ALERT_CONFIGURATION,
  );
  if (!configuration.ok) {
    throw new Error(
      `The fixture alert configuration is invalid: ${configuration.issues.join("; ")}`,
    );
  }
  const at = FIXTURES.SEEDED_OBLIGATIONS_AT;
  const inputs = gatherProducerInputs(
    {
      organizations: FIXTURES.organizations,
      producerProducts: FIXTURES.producerProducts,
      catalogEntries: FIXTURES.catalogEntries,
      jurisdictions: FIXTURES.jurisdictions,
      jurisdictionRules: FIXTURES.jurisdictionRules,
      ruleVersions: FIXTURES.ruleVersions,
      producerObligations: [],
      obligationDeadlines: [],
    },
    ORG.cascade,
  );
  const today = civilDateInZone(at, inputs.timeZone);
  const evaluation = evaluateProducerObligations(inputs.evaluation, today);
  const plan = planProducerRun(
    evaluation,
    { obligations: [], deadlines: [] },
    "nightly_job",
  );

  // The first run: every obligation and every deadline is new.
  const ids = new Map<string, Uuid>();
  const obligations: ProducerObligation[] = plan.inserts.map((draft, index) => {
    const id = producerObligationRowId(index + 1);
    ids.set(draft.ref, id);
    return {
      id,
      organizationId: ORG.cascade,
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
      determinedBy: null,
      isCurrent: true,
      supersedesProducerObligationId: null,
      createdAt: at,
      updatedAt: at,
    };
  });
  let deadlines: ObligationDeadline[] = plan.deadlineChanges.flatMap(
    (change, index): ObligationDeadline[] => {
      if (change.kind !== "insert" || change.target.kind !== "new") return [];
      const obligationId = ids.get(change.target.ref);
      if (obligationId === undefined) return [];
      return [
        {
          id: obligationDeadlineRowId(index + 1),
          organizationId: ORG.cascade,
          producerObligationId: obligationId,
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
          createdAt: at,
          updatedAt: at,
        },
      ];
    },
  );

  // 1 — the alerts the job raised that morning.
  const subjects = deadlineAlertSubjects(obligations, deadlines);
  let alerts: Alert[] = wantedDeadlineAlerts(
    subjects,
    configuration.configuration,
    today,
  ).map((draft, index) => ({
    id: obligationAlertRowId(index + 1),
    organizationId: ORG.cascade,
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
    audienceRoles: ["producer_compliance_officer"],
    governingRuleVersionId: null,
    triggerSnapshot: draft.triggerSnapshot,
    raisedAt: at,
    dedupeKey: draft.dedupeKey,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolutionReason: null,
    deliveredChannels: null,
    createdAt: at,
    updatedAt: at,
  }));

  // 2 — Priya marks DC's deadline done; its alert resolves.
  const completion = FIXTURES.SEEDED_COMPLETION;
  const dcObligation = obligations.find(
    (row) =>
      row.jurisdictionId === JURISDICTION[completion.jurisdiction] &&
      row.obligationKey === completion.obligationKey,
  );
  const done = deadlines.find(
    (row) => row.producerObligationId === dcObligation?.id,
  );
  if (done === undefined) {
    throw new Error(
      "The seeded completion names a deadline the run did not write.",
    );
  }
  deadlines = deadlines.map((row) =>
    row.id === done.id
      ? {
          ...row,
          status: "completed",
          completedOn: completion.completedOn,
          completedAt: completion.completedAt,
          completedBy: USER.priyaProducer,
          completionNote: completion.note,
          completionReference: completion.reference,
          updatedAt: completion.completedAt,
        }
      : row,
  );
  const resolved = alerts.find(
    (alert) => alert.obligationDeadlineId === done.id,
  );
  alerts = alerts.map((alert) =>
    alert.id === resolved?.id
      ? {
          ...alert,
          resolvedAt: completion.completedAt,
          resolutionReason: "The deadline was marked done.",
          updatedAt: completion.completedAt,
        }
      : alert,
  );

  // After the fixtures' rows and b2-11's seeded ranking row.
  const firstSequence = FIXTURES.auditEvents.length + 2;
  const base = {
    organizationId: ORG.cascade,
    changedFields: null,
    requestId: null,
    ipAddress: null,
    userAgent: null,
  } as const;
  const auditEvents: AuditEvent[] = [
    {
      ...base,
      id: AUDIT.producerObligationsSeeded,
      sequenceNo: firstSequence,
      actorUserId: null,
      actorType: "scheduled_job",
      actorLabel: JOB_LABEL,
      eventType: "producer_obligation.evaluated",
      entityTable: "producer_obligation",
      entityId: PRODUCER_RUN.cascadeSeeded,
      occurredAt: at,
      recordedAt: at,
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
      governingRuleVersionId:
        plan.ruleVersionsApplied[0]?.ruleVersionId ?? null,
      ruleVersionsApplied: plan.ruleVersionsApplied,
      correlationId: "corr-producer-obligations-seed",
      reason: null,
      createdAt: at,
    },
    {
      ...base,
      id: AUDIT.dcDeadlineCompleted,
      sequenceNo: firstSequence + 1,
      actorUserId: USER.priyaProducer,
      actorType: "user",
      actorLabel: null,
      eventType: "obligation_deadline.completed",
      entityTable: "obligation_deadline",
      entityId: done.id,
      occurredAt: completion.completedAt,
      recordedAt: completion.completedAt,
      beforeState: { status: "open", dueOn: done.dueOn },
      afterState: {
        status: "completed",
        dueOn: done.dueOn,
        completedOn: completion.completedOn,
        completionNote: completion.note,
        completionReference: completion.reference,
      },
      governingRuleVersionId: done.governingRuleVersionId,
      ruleVersionsApplied: null,
      correlationId: "corr-producer-completion-seed",
      reason: null,
      createdAt: completion.completedAt,
    },
  ];
  if (resolved !== undefined) {
    auditEvents.push({
      ...base,
      id: AUDIT.dcDeadlineAlertResolved,
      sequenceNo: firstSequence + 2,
      actorUserId: USER.priyaProducer,
      actorType: "user",
      actorLabel: null,
      eventType: "alert.resolved",
      entityTable: "alert",
      entityId: resolved.id,
      occurredAt: completion.completedAt,
      recordedAt: completion.completedAt,
      beforeState: { resolvedAt: null },
      afterState: {
        resolvedAt: completion.completedAt,
        alertType: "obligation_deadline",
      },
      governingRuleVersionId: null,
      ruleVersionsApplied: null,
      correlationId: "corr-producer-completion-seed",
      reason: "The deadline was marked done.",
      createdAt: completion.completedAt,
    });
  }
  return { obligations, deadlines, alerts, auditEvents };
}

export const PRODUCER_SEED: ProducerSeed = buildSeed();
