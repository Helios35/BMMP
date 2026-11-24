import {
  buildFilingPacketContent,
  buildFilingPacketPayload,
} from "@/domain/documents/build-filing-packet-payload";
import { documentIdentity } from "@/domain/documents/document-identity";
import { verificationCodeOf } from "@/domain/documents/snapshot";
import {
  evaluateProducerObligations,
  FILINGS_RULE_KEY,
  filingPacketInputs,
  planProducerRun,
  resolveFiling,
  resolvePeriod,
  validateObligationAlertConfiguration,
  wantedDeadlineAlerts,
} from "@/domain/producer";
import { civilDateInZone } from "@/domain/storage/clock-display";
import type { AuditEvent } from "@/types/audit";
import type { Uuid } from "@/types/common";
import type { DocumentRender } from "@/types/documents";
import type { ObligationDeadline, ProducerObligation } from "@/types/producer";
import type { Alert } from "@/types/storage";

import * as FIXTURES from "./fixtures";
import {
  AUDIT,
  DOCUMENT_RENDER,
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
import { ruleVersionCandidate } from "./rule-candidate";

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
  /** b1b-13 — California's notice (Rule 8.19). */
  readonly documentRenders: readonly DocumentRender[];
}

/**
 * The template the seeded notice names — the same key and version as
 * `FILING_PACKET_TEMPLATE` (a test holds the two together; the mock does not
 * import a feature's template).
 */
const SEEDED_TEMPLATE = {
  templateKey: "producer_filing",
  templateVersion: "1",
};
const SEEDED_RENDERER = { name: "react-pdf", version: "4.x" };

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

  // 3 — b1b-13: Priya's California notice, and its deadline marked done
  // with the notice as its evidence (spec §6; Rule 8.19).
  const packet = seededPacket(obligations, deadlines);
  deadlines = deadlines.map((row) =>
    row.id === packet.deadline.id
      ? {
          ...row,
          status: "completed",
          completedOn: FIXTURES.SEEDED_PACKET.completedOn,
          completedAt: FIXTURES.SEEDED_PACKET.completedAt,
          completedBy: USER.priyaProducer,
          completionNote: FIXTURES.SEEDED_PACKET.note,
          completionReference: FIXTURES.SEEDED_PACKET.reference,
          evidenceDocumentRenderId: packet.render.id,
          updatedAt: FIXTURES.SEEDED_PACKET.completedAt,
        }
      : row,
  );
  const packetAlert = alerts.find(
    (alert) =>
      alert.obligationDeadlineId === packet.deadline.id &&
      alert.resolvedAt === null,
  );
  alerts = alerts.map((alert) =>
    alert.id === packetAlert?.id
      ? {
          ...alert,
          resolvedAt: FIXTURES.SEEDED_PACKET.completedAt,
          resolutionReason: "The deadline was marked done.",
          updatedAt: FIXTURES.SEEDED_PACKET.completedAt,
        }
      : alert,
  );
  const next = firstSequence + auditEvents.length;
  auditEvents.push(
    {
      ...base,
      id: AUDIT.caNoticeIssued,
      sequenceNo: next,
      actorUserId: USER.priyaProducer,
      actorType: "user",
      actorLabel: null,
      eventType: "document_render.issued",
      entityTable: "document_render",
      entityId: packet.render.id,
      occurredAt: packet.render.renderedAt,
      recordedAt: packet.render.renderedAt,
      beforeState: null,
      afterState: {
        documentType: packet.render.documentType,
        obligationDeadlineId: packet.deadline.id,
        verificationCode: packet.render.verificationCode,
        supersedesDocumentRenderId: null,
      },
      governingRuleVersionId:
        packet.render.ruleVersionsApplied[0]?.ruleVersionId ?? null,
      ruleVersionsApplied: packet.render.ruleVersionsApplied,
      correlationId: "corr-filing-packet-seed",
      reason: null,
      createdAt: packet.render.renderedAt,
    },
    {
      ...base,
      id: AUDIT.caNoticeDeadlineCompleted,
      sequenceNo: next + 1,
      actorUserId: USER.priyaProducer,
      actorType: "user",
      actorLabel: null,
      eventType: "obligation_deadline.completed",
      entityTable: "obligation_deadline",
      entityId: packet.deadline.id,
      occurredAt: FIXTURES.SEEDED_PACKET.completedAt,
      recordedAt: FIXTURES.SEEDED_PACKET.completedAt,
      beforeState: { status: "open", dueOn: packet.deadline.dueOn },
      afterState: {
        status: "completed",
        dueOn: packet.deadline.dueOn,
        completedOn: FIXTURES.SEEDED_PACKET.completedOn,
        completionNote: FIXTURES.SEEDED_PACKET.note,
        completionReference: FIXTURES.SEEDED_PACKET.reference,
        evidenceDocumentRenderId: packet.render.id,
      },
      governingRuleVersionId: packet.deadline.governingRuleVersionId,
      ruleVersionsApplied: null,
      correlationId: "corr-filing-packet-completion-seed",
      reason: null,
      createdAt: FIXTURES.SEEDED_PACKET.completedAt,
    },
  );
  if (packetAlert !== undefined) {
    auditEvents.push({
      ...base,
      id: AUDIT.caNoticeAlertResolved,
      sequenceNo: next + 2,
      actorUserId: USER.priyaProducer,
      actorType: "user",
      actorLabel: null,
      eventType: "alert.resolved",
      entityTable: "alert",
      entityId: packetAlert.id,
      occurredAt: FIXTURES.SEEDED_PACKET.completedAt,
      recordedAt: FIXTURES.SEEDED_PACKET.completedAt,
      beforeState: { resolvedAt: null },
      afterState: {
        resolvedAt: FIXTURES.SEEDED_PACKET.completedAt,
        alertType: "obligation_deadline",
      },
      governingRuleVersionId: null,
      ruleVersionsApplied: null,
      correlationId: "corr-filing-packet-completion-seed",
      reason: "The deadline was marked done.",
      createdAt: FIXTURES.SEEDED_PACKET.completedAt,
    });
  }
  return {
    obligations,
    deadlines,
    alerts,
    auditEvents,
    documentRenders: [packet.render],
  };
}

/**
 * California's notice, **built by the real domain** from the fixtures — the
 * same reader, period and builder the Make packet dialog uses — so the seeded
 * packet can never say something the rule data and the sales don't.
 *
 * It has **no stored file**: the mock store is built synchronously and a PDF
 * render is not, so `/documents/[id]` shows the page composed from its stored
 * input and says so. Its hashes are fixture values, as every seeded render's
 * are.
 */
function seededPacket(
  obligations: readonly ProducerObligation[],
  deadlines: readonly ObligationDeadline[],
): { readonly render: DocumentRender; readonly deadline: ObligationDeadline } {
  const spec = FIXTURES.SEEDED_PACKET;
  const jurisdictionId = JURISDICTION[spec.jurisdiction];
  const obligation = obligations.find(
    (row) =>
      row.jurisdictionId === jurisdictionId &&
      row.obligationKey === spec.obligationKey,
  );
  const deadline = deadlines.find(
    (row) =>
      row.producerObligationId === obligation?.id && row.dueOn === spec.dueOn,
  );
  const state = FIXTURES.jurisdictions.find((row) => row.id === jurisdictionId);
  const organization = FIXTURES.organizations.find(
    (row) => row.id === ORG.cascade,
  );
  const priya = FIXTURES.users.find((row) => row.id === USER.priyaProducer);
  if (
    obligation === undefined ||
    deadline === undefined ||
    state === undefined ||
    organization === undefined ||
    priya === undefined
  ) {
    throw new Error("The seeded packet names a row the fixtures don't have.");
  }
  const filingRules = new Map(
    FIXTURES.jurisdictionRules
      .filter(
        (rule) =>
          rule.ruleKey === FILINGS_RULE_KEY &&
          rule.jurisdictionId === jurisdictionId,
      )
      .map((rule) => [rule.id, rule]),
  );
  const entries = new Map(FIXTURES.catalogEntries.map((row) => [row.id, row]));
  const rows = {
    deadline,
    obligation,
    state: { jurisdictionId, code: state.code, name: state.name },
    filingCandidates: FIXTURES.ruleVersions.flatMap((version) => {
      const rule = filingRules.get(version.jurisdictionRuleId);
      return rule === undefined ? [] : [ruleVersionCandidate(rule, version)];
    }),
    organization,
    contact: { userId: priya.id, name: priya.fullName, email: priya.email },
    products: FIXTURES.producerProducts
      .filter(
        (product) =>
          product.organizationId === ORG.cascade &&
          product.removedAt === null &&
          product.jurisdictionIds.includes(jurisdictionId),
      )
      .flatMap((product) => {
        const entry = entries.get(product.catalogEntryId);
        return entry === undefined ? [] : [{ product, entry }];
      }),
    sales: FIXTURES.producerSalesRecords.filter(
      (row) =>
        row.jurisdictionId === jurisdictionId && row.supersededById === null,
    ),
  };
  const asOf = civilDateInZone(spec.renderedAt, organization.timeZone);
  const resolved = resolveFiling(rows, asOf);
  if (resolved === null) {
    throw new Error("The seeded packet's state has no filing on file.");
  }
  const period = resolvePeriod(resolved.filing.period, deadline.dueOn, null);
  if (!period.ok) throw new Error("The seeded packet's period needs a year.");
  const content = buildFilingPacketContent(
    filingPacketInputs(rows, resolved, period.period),
  );
  if (!content.ok) throw new Error(`The seeded packet: ${content.words}`);
  const id = DOCUMENT_RENDER.caNoticePacket;
  const payload = buildFilingPacketPayload({
    content: content.outcome,
    document: documentIdentity({
      documentRenderId: id,
      documentType: resolved.filing.documentType,
      status: "issued",
      templateKey: SEEDED_TEMPLATE.templateKey,
      templateVersion: SEEDED_TEMPLATE.templateVersion,
      renderedAt: spec.renderedAt,
      timeZone: organization.timeZone,
      producer: `BMMP document engine (${SEEDED_RENDERER.name} ${SEEDED_RENDERER.version})`,
      draftNotice: "",
    }),
  });
  if (!payload.ok) {
    throw new Error(
      `The seeded packet is missing ${payload.missing.join(", ")}.`,
    );
  }
  // A fixture hash, as every seeded render carries — there are no bytes.
  const inputSnapshotHash =
    "f1a2c3e4b5d60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
  return {
    deadline,
    render: {
      id,
      organizationId: ORG.cascade,
      documentType: resolved.filing.documentType,
      shipmentId: null,
      containerId: null,
      batteryRecordId: null,
      evidencePackId: null,
      obligationDeadlineId: deadline.id,
      templateKey: SEEDED_TEMPLATE.templateKey,
      templateVersion: SEEDED_TEMPLATE.templateVersion,
      rendererName: SEEDED_RENDERER.name,
      rendererVersion: SEEDED_RENDERER.version,
      inputSnapshot: payload.outcome.result,
      inputSnapshotHash,
      verificationCode: verificationCodeOf(inputSnapshotHash),
      ruleVersionsApplied: payload.outcome.ruleVersionsApplied,
      storageObjectPath: `org/${ORG.cascade}/${resolved.filing.documentType}/${id}.pdf`,
      contentHash:
        "0b1c2d3e4f5a69788796a5b4c3d2e1f00b1c2d3e4f5a69788796a5b4c3d2e1f0",
      byteSize: 38_912,
      pageCount: 1,
      renderedAt: spec.renderedAt,
      renderedBy: USER.priyaProducer,
      renderDurationMs: 842,
      status: "issued",
      supersedesDocumentRenderId: null,
      supersededAt: null,
      createdAt: spec.renderedAt,
    },
  };
}

export const PRODUCER_SEED: ProducerSeed = buildSeed();
