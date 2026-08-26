import type { ReactElement } from "react";

import { StatusBadge } from "@/components/status/status-badge";
import { Separator } from "@/components/ui/separator";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import { AUDIT_ACTOR_TYPE_LABELS } from "@/domain/taxonomy/audit-actor-type";
import { AUDIT_EVENT_TYPE_LABELS } from "@/domain/taxonomy/audit-event-type";
import { DAMAGE_FINDING_TYPE_LABELS } from "@/domain/taxonomy/damage-finding-type";
import { HANDLER_ACTIVITY_TYPE_LABELS } from "@/domain/taxonomy/handler-activity-type";
import { labelFor } from "@/domain/taxonomy/lookup";
import type { BatteryRecord } from "@/types/battery-record";
import type { IsoTimestamp, TimeZone, Uuid } from "@/types/common";
import type { DamageAssessment } from "@/types/condition";
import type { AuditEvent } from "@/types/audit";
import { absoluteInstant } from "./format-instant";
import { detailEntries, snapshotEntries } from "./json-text";
import { DetailCard, NotRecorded, SnapshotList } from "./record-display";
import { resolveUserNames } from "./user-names";

/**
 * `/batteries/[id]` — History. `UX_SPEC.md` §3.7.
 *
 * ## Two compositions, selected from the one map
 *
 * **P2, P5 and P6 read the `audit_event` trail; P1, P3 and P4 read the record's
 * own events.** The branch reads `canReadRoute(role, "/audit")` — the same
 * `ROUTE_ACCESS` the guard, the navigation and the command palette read — and
 * never a role literal.
 *
 * The branch is not a courtesy. **Rule 12.8 means P1 calling `auditEvents.list`
 * throws**, and it throws from the mock's policy matrix because that mirrors the
 * row-level security policy: the audit log belongs to the roles that audit. The
 * fallback is the source the audit contract itself names — the history of
 * records this role can already open, built from `storage_event`,
 * `damage_assessment` and `classification_decision`.
 *
 * ## The damage-assessment pair is unconditional
 *
 * **Any superseded `damage_assessment` is displayed alongside the current one**,
 * with its author, timestamp, findings and evidence, and **is not tucked into a
 * disclosure** (Rule 6.12). A reversed damage finding is the first thing an
 * auditor looks for, and the auditor is on the `audit_event` branch — so the
 * pair renders for every role rather than only for the branch that happens to
 * read the assessments for its trail.
 */

export async function HistoryTab({
  ctx,
  record,
  timeZone,
}: {
  readonly ctx: RequestContext;
  readonly record: BatteryRecord;
  readonly timeZone: TimeZone;
}): Promise<ReactElement> {
  const assessments = await data.damageAssessments.list(ctx, {
    batteryRecordId: record.id,
    limit: 50,
  });

  const trail = canReadRoute(ctx.role, "/audit")
    ? await readAuditTrail(ctx, record.id)
    : await readRecordTrail(ctx, record.id, assessments.items);

  const names = await resolveUserNames(ctx, [
    ...trail.actorIds,
    ...assessments.items.flatMap((row) => [row.assessedBy, row.confirmedBy]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <DetailCard title="History" description={trail.description}>
        {trail.entries.length === 0 ? (
          <p role="status" className="max-w-[72ch] text-body">
            Nothing has been recorded against this record yet.
          </p>
        ) : (
          <ol data-trail-source={trail.source} className="grid gap-4">
            {trail.entries.map((entry) => (
              <li
                key={entry.id}
                className="grid gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-body-strong">{entry.title}</span>
                  <span className="text-caption text-muted-foreground">
                    {absoluteInstant(entry.occurredAt, timeZone)}
                  </span>
                  <span
                    className="text-caption"
                    data-actor-type={
                      entry.actorTypeLabel === null
                        ? undefined
                        : entry.actorType
                    }
                  >
                    {entry.actorId === null
                      ? (entry.actorFallback ?? "")
                      : (names.get(entry.actorId) ?? "")}
                    {entry.actorTypeLabel === null
                      ? null
                      : ` · ${entry.actorTypeLabel}`}
                  </span>
                </div>

                {entry.changedFields.length === 0 ? null : (
                  <p className="text-caption text-muted-foreground">
                    {entry.changedFields.join(", ")}
                  </p>
                )}

                {entry.before.length === 0 &&
                entry.after.length === 0 ? null : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <h3 className="text-label">Before</h3>
                      {entry.before.length === 0 ? (
                        <NotRecorded />
                      ) : (
                        <SnapshotList entries={entry.before} />
                      )}
                    </div>
                    <div className="grid gap-1">
                      <h3 className="text-label">After</h3>
                      {entry.after.length === 0 ? (
                        <NotRecorded />
                      ) : (
                        <SnapshotList entries={entry.after} />
                      )}
                    </div>
                  </div>
                )}

                {entry.reason === null ? null : (
                  <p className="max-w-[72ch] text-body">{entry.reason}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </DetailCard>

      <DamageAssessments
        assessments={assessments.items}
        names={names}
        timeZone={timeZone}
      />
    </div>
  );
}

interface TrailEntry {
  readonly id: string;
  readonly title: string;
  readonly occurredAt: IsoTimestamp;
  readonly actorId: Uuid | null;
  /** Where the actor was not a person — an automated step names itself (Rule 12.5). */
  readonly actorFallback: string | null;
  readonly actorType: string;
  /** Rendered only where the actor was not an ordinary user (T-60, Rule 12.7). */
  readonly actorTypeLabel: string | null;
  readonly changedFields: readonly string[];
  readonly before: ReturnType<typeof snapshotEntries>;
  readonly after: ReturnType<typeof snapshotEntries>;
  readonly reason: string | null;
}

interface Trail {
  readonly source: "audit_event" | "record_events";
  readonly description: string;
  readonly entries: readonly TrailEntry[];
  readonly actorIds: readonly (Uuid | null)[];
}

async function readAuditTrail(
  ctx: RequestContext,
  batteryRecordId: Uuid,
): Promise<Trail> {
  const events = await data.auditEvents.list(ctx, {
    entityTable: "battery_record",
    entityId: batteryRecordId,
    limit: 50,
  });

  const entries = [...events.items]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map(auditEntry);

  return {
    source: "audit_event",
    description: "The audit trail for this record, newest first.",
    entries,
    actorIds: events.items.map((event) => event.actorUserId),
  };
}

function auditEntry(event: AuditEvent): TrailEntry {
  return {
    id: event.id,
    title: labelFor(AUDIT_EVENT_TYPE_LABELS, event.eventType),
    occurredAt: event.occurredAt,
    actorId: event.actorUserId,
    actorFallback: event.actorLabel,
    actorType: event.actorType,
    // A support grant that is invisible in the log is not a recorded support
    // grant (Rules 1.18, 12.7), so anything other than an ordinary user says so.
    actorTypeLabel:
      event.actorType === "user"
        ? null
        : labelFor(AUDIT_ACTOR_TYPE_LABELS, event.actorType),
    changedFields: event.changedFields ?? [],
    before: snapshotEntries(event.beforeState),
    after: snapshotEntries(event.afterState),
    reason: event.reason,
  };
}

/**
 * The trail for a role that may not read the audit log.
 *
 * Built from the record's own rows rather than from the raw log — the same
 * history, seen through the records this role can already open.
 */
async function readRecordTrail(
  ctx: RequestContext,
  batteryRecordId: Uuid,
  assessments: readonly DamageAssessment[],
): Promise<Trail> {
  const [storage, decisions] = await Promise.all([
    data.storageEvents.list(ctx, { batteryRecordId, limit: 50 }),
    data.classificationDecisions.list(ctx, { batteryRecordId, limit: 50 }),
  ]);

  const entries: TrailEntry[] = [
    ...storage.items.map((event): TrailEntry => ({
      id: event.id,
      title: labelFor(HANDLER_ACTIVITY_TYPE_LABELS, event.activityType),
      occurredAt: event.occurredAt,
      actorId: event.recordedBy,
      actorFallback: null,
      actorType: "user",
      actorTypeLabel: null,
      changedFields: [],
      before: [],
      after: detailEntries(event.payload),
      reason: null,
    })),
    ...assessments.map((assessment): TrailEntry => ({
      id: assessment.id,
      title: "Condition assessed",
      occurredAt: assessment.assessedAt,
      actorId: assessment.assessedBy,
      actorFallback: null,
      actorType: "user",
      actorTypeLabel: null,
      changedFields: assessment.findingTypes.map((finding) =>
        labelFor(DAMAGE_FINDING_TYPE_LABELS, finding),
      ),
      before: [],
      after: detailEntries(assessment.findingDetail),
      reason: null,
    })),
    ...decisions.items.map((decision): TrailEntry => ({
      id: decision.id,
      title: "Classified",
      occurredAt: decision.decidedAt,
      actorId: decision.decidedBy,
      // A decision with no person behind it was taken by rule evaluation, and
      // saying so is more honest than an empty attribution.
      actorFallback: "Rule evaluation",
      actorType: "system",
      actorTypeLabel: null,
      changedFields: [],
      before: [],
      after: snapshotEntries(decision.inputsSnapshot),
      reason: decision.reasoning,
    })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return {
    source: "record_events",
    description:
      "What has happened to this record, newest first, built from the record's own events.",
    entries,
    actorIds: entries.map((entry) => entry.actorId),
  };
}

/**
 * Every damage assessment on the record, current and superseded, side by side.
 *
 * **Not a list with one hidden and not a disclosure** (Rule 6.12). The
 * append-only shape is what makes this possible: a correction is a new row
 * carrying `supersedes_damage_assessment_id`, and the superseded row stays and
 * stays readable.
 */
function DamageAssessments({
  assessments,
  names,
  timeZone,
}: {
  readonly assessments: readonly DamageAssessment[];
  readonly names: ReadonlyMap<Uuid, string>;
  readonly timeZone: TimeZone;
}) {
  if (assessments.length === 0) return null;

  const ordered = [...assessments].sort((a, b) =>
    b.assessedAt.localeCompare(a.assessedAt),
  );

  return (
    <DetailCard
      title="Condition assessments"
      description="Every assessment on this record, current and superseded, shown together."
    >
      <ul className="grid gap-4 md:grid-cols-2">
        {ordered.map((assessment) => (
          <li
            key={assessment.id}
            data-assessment-status={assessment.status}
            data-assessment-superseded={
              assessment.supersedesDamageAssessmentId === null
                ? undefined
                : "true"
            }
            className="grid gap-2 rounded-md border border-border p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                system="damage_assessment_status"
                value={assessment.status}
                size="sm"
              />
              {assessment.findingTypes.map((finding) => (
                <span key={finding} className="text-body-strong">
                  {labelFor(DAMAGE_FINDING_TYPE_LABELS, finding)}
                </span>
              ))}
            </div>

            <dl className="grid gap-1 text-body sm:grid-cols-[minmax(8rem,auto)_1fr]">
              <div className="contents">
                <dt className="text-label">Assessed</dt>
                <dd>{absoluteInstant(assessment.assessedAt, timeZone)}</dd>
              </div>
              <div className="contents">
                <dt className="text-label">Assessed by</dt>
                <dd>
                  {assessment.assessedBy === null ? (
                    <NotRecorded />
                  ) : (
                    (names.get(assessment.assessedBy) ?? <NotRecorded />)
                  )}
                </dd>
              </div>
              <div className="contents">
                <dt className="text-label">Confirmed by</dt>
                <dd>
                  {assessment.confirmedBy === null ? (
                    <NotRecorded />
                  ) : (
                    (names.get(assessment.confirmedBy) ?? <NotRecorded />)
                  )}
                </dd>
              </div>
              {assessment.intakePhotoId === null ? null : (
                <div className="contents">
                  <dt className="text-label">Evidence</dt>
                  <dd className="text-mono break-all">
                    {assessment.intakePhotoId}
                  </dd>
                </div>
              )}
            </dl>

            <Separator />
            <SnapshotList entries={detailEntries(assessment.findingDetail)} />
          </li>
        ))}
      </ul>
    </DetailCard>
  );
}
