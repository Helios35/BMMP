import type { ReactElement } from "react";

import { AUDIT_EVENT_TYPE_LABELS } from "@/domain/taxonomy/audit-event-type";
import { HANDLER_ACTIVITY_TYPE_LABELS } from "@/domain/taxonomy/handler-activity-type";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import { AUDIT_EVENT_TYPES } from "@/domain/taxonomy/audit-event-type";
import { absoluteInstant } from "@/features/battery-record/format-instant";
import type { AuditEvent } from "@/types/audit";
import type { JsonValue, TimeZone, Uuid } from "@/types/common";
import type { StorageEvent } from "@/types/storage";

import { HISTORY_EMPTY } from "./container-copy";

/**
 * **History** — `UX_SPEC.md` §3.10: the container's `storage_event`s and
 * `audit_event`s, **including any recorded remediation with its stated
 * reason**.
 *
 * Storage events render for every role that opens the container. The audit
 * trail renders only where the role reads the audit log — P1 does not
 * (Rule 12.8) — and the branch was taken by the read, from the one map.
 *
 * Every instant is in the site's zone, with the zone beside it (Rule 4.29).
 */

function payloadText(payload: JsonValue | null, key: string): string | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const value = (payload as { readonly [name: string]: JsonValue })[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function HistorySection({
  storageEvents,
  auditEvents,
  names,
  containerCodes,
  timeZone,
}: {
  readonly storageEvents: readonly StorageEvent[];
  readonly auditEvents: readonly AuditEvent[] | null;
  readonly names: ReadonlyMap<Uuid, string>;
  /** Container id → code, for a move's other end. */
  readonly containerCodes: ReadonlyMap<Uuid, string>;
  readonly timeZone: TimeZone;
}): ReactElement {
  if (storageEvents.length === 0 && (auditEvents ?? []).length === 0) {
    return (
      <p role="status" className="max-w-[72ch] text-body">
        {HISTORY_EMPTY}
      </p>
    );
  }
  return (
    <div data-container-history="true" className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h3 className="text-h2">Storage events</h3>
        <ol className="grid gap-4">
          {storageEvents.map((event) => {
            const statement = payloadText(event.payload, "statement");
            const note = payloadText(event.payload, "note");
            const from = payloadText(event.payload, "fromContainerId");
            const to = payloadText(event.payload, "toContainerId");
            const other = from ?? to;
            return (
              <li
                key={event.id}
                data-storage-event={event.activityType}
                className="grid gap-1 border-b border-border pb-4 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-body-strong">
                    {HANDLER_ACTIVITY_TYPE_LABELS[event.activityType]}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {absoluteInstant(event.occurredAt, timeZone)}
                  </span>
                  <span className="text-caption">
                    {event.recordedBy === null
                      ? "The alert job"
                      : (names.get(event.recordedBy) ?? "")}
                  </span>
                </div>
                {other === null ? null : (
                  <p className="text-caption">
                    {`${from !== null ? "From" : "To"} ${containerCodes.get(other) ?? "another container"}`}
                  </p>
                )}
                {statement === null ? null : (
                  <p
                    data-remediation-statement-text="true"
                    className="max-w-[72ch] text-body"
                  >
                    {statement}
                  </p>
                )}
                {note === null ? null : (
                  <p className="max-w-[72ch] text-body">{note}</p>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {auditEvents === null ? null : (
        <section className="flex flex-col gap-4">
          <h3 className="text-h2">Audit trail</h3>
          {auditEvents.length === 0 ? (
            <p className="text-body">No audit events name this container.</p>
          ) : (
            <ol data-container-audit="true" className="grid gap-4">
              {auditEvents.map((event) => {
                const type = readTaxonomyValue(
                  AUDIT_EVENT_TYPES,
                  AUDIT_EVENT_TYPE_LABELS,
                  event.eventType,
                );
                return (
                  <li
                    key={event.id}
                    className="grid gap-1 border-b border-border pb-4 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-body-strong">
                        {type.recognised ? type.label : type.storedValue}
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {absoluteInstant(event.occurredAt, timeZone)}
                      </span>
                      <span className="text-caption">
                        {event.actorUserId === null
                          ? (event.actorLabel ?? "")
                          : (names.get(event.actorUserId) ?? "")}
                      </span>
                    </div>
                    {event.reason === null ? null : (
                      <p className="max-w-[72ch] text-body">{event.reason}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
