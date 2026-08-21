import {
  AUDIT_ACTOR_TYPE_LABELS,
  AUDIT_ACTOR_TYPES,
  type AuditActorType,
} from "@/domain/taxonomy/audit-actor-type";
import {
  AUDIT_EVENT_TYPE_LABELS,
  AUDIT_EVENT_TYPES,
} from "@/domain/taxonomy/audit-event-type";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { AuditEvent } from "@/types/audit";
import type { JsonObject, TimeZone, Uuid } from "@/types/common";

import type { AuditActorDirectory } from "./audit-actors";
import { auditEntityHref } from "./audit-entity-link";
import {
  formatAuditTimestamp,
  type AuditTimestampDisplay,
} from "./audit-timestamp";

/**
 * One audit row, resolved once, for every surface that renders it.
 *
 * The table and the CSV export read the **same** view model, so a column that is
 * on screen and a column that is in the file cannot disagree about what a row
 * says — which matters most for the platform-action mark, where a difference
 * between the two would mean an export that hides what the screen showed
 * (Rules 1.18, 12.7).
 *
 * Everything on it is plain and serialisable, so a client disclosure can receive
 * the before/after detail without the page handing a client component a record,
 * a context or a capability.
 */

export interface AuditRuleVersionView {
  readonly ruleKey: string;
  readonly versionLabel: string;
  readonly citation: string;
  readonly outcome: string;
}

export interface AuditRowView {
  readonly id: Uuid;
  readonly sequenceNo: number;
  readonly timestamp: AuditTimestampDisplay;
  /** The person's name, the job or integration's label, or the T-60 label. */
  readonly actorName: string;
  readonly actorType: AuditActorType;
  readonly actorTypeLabel: string;
  /** T-60 — Rules 1.18, 12.7. Drives the badge **and** the export column. */
  readonly isPlatformAction: boolean;
  /** T-37. Absent for a non-user actor: a scheduled job holds no role. */
  readonly actorRole: RoleCode | null;
  /** T-43, or `null` where the stored value is not one this build knows. */
  readonly eventTypeLabel: string | null;
  readonly eventTypeStored: string;
  readonly entityTable: string;
  readonly entityId: Uuid;
  /** Role-filtered through `ROUTE_ACCESS`; `null` where there is no page. */
  readonly entityHref: string | null;
  /** `reason` where the event carried one, the changed-field list otherwise. */
  readonly summary: string;
  readonly changedFields: readonly string[];
  readonly beforeState: JsonObject | null;
  readonly afterState: JsonObject | null;
  readonly correlationId: string | null;
  readonly governingRuleVersionId: Uuid | null;
  readonly ruleVersions: readonly AuditRuleVersionView[];
}

/**
 * The name in the Actor column.
 *
 * A user id resolves through the tenant's own membership directory. A non-user
 * actor uses `actorLabel` — which carries the job or the integration that ran
 * (Rule 12.5) — and falls back to T-60's label rather than to a word written
 * here, because a label written inline is a defect even when it matches
 * (`TAXONOMY.md` §5.3).
 */
function actorNameFor(
  event: AuditEvent,
  directory: AuditActorDirectory,
): string {
  if (event.actorUserId !== null) {
    const actor = directory.byUserId.get(event.actorUserId);
    if (actor !== undefined) return actor.name;
    // A user who has no membership here at all: the identifier is what is
    // known, and it is shown rather than blanked.
    return event.actorUserId;
  }
  if (event.actorLabel !== null && event.actorLabel !== "") {
    return event.actorLabel;
  }
  return AUDIT_ACTOR_TYPE_LABELS[event.actorType];
}

export function toAuditRowView(
  event: AuditEvent,
  directory: AuditActorDirectory,
  role: RoleCode,
  timeZone: TimeZone,
): AuditRowView {
  const eventTypeRead = readTaxonomyValue(
    AUDIT_EVENT_TYPES,
    AUDIT_EVENT_TYPE_LABELS,
    event.eventType,
  );

  // T-60 is a narrowed union on the row, and a value outside it still has to
  // render: an unrecognised actor type reads as the stored string and is never
  // guessed into `platform_admin` or out of it.
  const actorTypeRead = readTaxonomyValue(
    AUDIT_ACTOR_TYPES,
    AUDIT_ACTOR_TYPE_LABELS,
    event.actorType,
  );

  if (!eventTypeRead.recognised) {
    // TAXONOMY.md §5.8 — surfaced, never coerced and never dropped from a count.
    // The warning is how a value written by a newer deployment becomes visible
    // to us instead of only to the reader.
    console.warn(
      `[audit] unrecognised audit_event.event_type "${eventTypeRead.storedValue}" on event ${event.id}`,
    );
  }
  if (!actorTypeRead.recognised) {
    console.warn(
      `[audit] unrecognised audit_event.actor_type "${actorTypeRead.storedValue}" on event ${event.id}`,
    );
  }

  const changedFields = event.changedFields ?? [];

  return {
    id: event.id,
    sequenceNo: event.sequenceNo,
    timestamp: formatAuditTimestamp(event.occurredAt, timeZone),
    actorName: actorNameFor(event, directory),
    actorType: event.actorType,
    actorTypeLabel: actorTypeRead.recognised
      ? actorTypeRead.label
      : actorTypeRead.storedValue,
    isPlatformAction: event.actorType === "platform_admin",
    actorRole:
      event.actorUserId === null
        ? null
        : (directory.byUserId.get(event.actorUserId)?.role ?? null),
    eventTypeLabel: eventTypeRead.recognised ? eventTypeRead.label : null,
    eventTypeStored: event.eventType,
    entityTable: event.entityTable,
    entityId: event.entityId,
    entityHref: auditEntityHref(event.entityTable, event.entityId, role),
    summary:
      event.reason !== null && event.reason !== ""
        ? event.reason
        : changedFields.join(", "),
    changedFields,
    beforeState: event.beforeState,
    afterState: event.afterState,
    correlationId: event.correlationId,
    governingRuleVersionId: event.governingRuleVersionId,
    ruleVersions: (event.ruleVersionsApplied ?? []).map((applied) => ({
      ruleKey: applied.ruleKey,
      versionLabel: applied.versionLabel,
      citation: applied.citation,
      outcome: applied.outcome,
    })),
  };
}
