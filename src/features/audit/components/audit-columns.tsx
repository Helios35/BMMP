import Link from "next/link";

import type { RecordTableColumn } from "@/components/record-table/record-table";
import { StatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";

import type { AuditRowView } from "../audit-row";
import { AuditChangeDetail } from "./audit-change-detail";

/**
 * `/audit`'s six columns — `UX_SPEC.md` §3.20.
 *
 * Timestamp · Actor · Role · Event type · Entity · Summary. **Only the timestamp
 * is sortable**: an audit log ordered by actor or by event type stops being a
 * chronology, and the chronology is the evidence
 * (`src/data/contracts/audit.ts`).
 */

/**
 * Why an audit row does not open.
 *
 * There is no `/audit/[id]`; the row's deep link is the record it names, in the
 * Entity column. The sentence **names the remedy rather than only refusing**
 * (§I1, D-35).
 */
export const AUDIT_ROW_NOT_LINKED_REASON =
  "An audit event has no page of its own. Open the record it names in the Entity column.";

export function auditColumns(): readonly RecordTableColumn<AuditRowView>[] {
  return [
    {
      id: "occurredAt",
      header: "Timestamp",
      sortable: true,
      primary: true,
      cell: (row) => (
        <span className="tabular" title={row.timestamp.full}>
          {row.timestamp.value}{" "}
          {/* The zone is beside every absolute timestamp — Rule 12.20. */}
          <span className="text-caption text-muted-foreground">
            {row.timestamp.zone}
          </span>
        </span>
      ),
    },
    {
      id: "actor",
      header: "Actor",
      secondary: true,
      cell: (row) => (
        <span
          // T-60 — Rules 1.18, 12.7. A support grant that is invisible in the
          // log is not a recorded support grant, so the mark is an attribute a
          // test can assert on as well as a badge a person can read.
          data-actor-type={row.isPlatformAction ? row.actorType : undefined}
          className="flex flex-col items-start gap-1"
        >
          <span>{row.actorName}</span>
          {row.isPlatformAction ? (
            // Text plus border, never colour alone (§1.2 Rule 4). The label is
            // T-60's own and is never written inline (TAXONOMY.md §5.3).
            <Badge variant="outline" className="rounded-md text-caption">
              {row.actorTypeLabel}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: "actorRole",
      header: "Role",
      status: true,
      // Absent for a non-user actor: a scheduled job holds no role, and
      // "Not set" would say one is missing (§3.20).
      cell: (row) =>
        row.actorRole === null ? null : (
          <StatusBadge system="role" value={row.actorRole} size="sm" />
        ),
    },
    {
      id: "eventType",
      header: "Event type",
      cell: (row) =>
        row.eventTypeLabel !== null ? (
          <span>{row.eventTypeLabel}</span>
        ) : (
          // TAXONOMY.md §5.8 — a value this build does not know renders as
          // stored, in mono. Never blank, never coerced, never dropped.
          <span
            className="text-mono"
            title="Retired or unrecognised value in audit_event.event_type"
          >
            {row.eventTypeStored}
          </span>
        ),
    },
    {
      id: "entity",
      header: "Entity",
      mono: true,
      cell: (row) =>
        row.entityHref !== null ? (
          <Link
            href={row.entityHref}
            data-entity-link={row.entityTable}
            className="inline-flex min-h-11 items-center rounded-md underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            {row.entityTable}
          </Link>
        ) : (
          // The table name as stored. There is no authored vocabulary of
          // audited tables, and inventing one would be inventing a taxonomy
          // (TAXONOMY.md §1.1) — see this unit's build notes.
          <span>{row.entityTable}</span>
        ),
    },
    {
      id: "summary",
      header: "Summary",
      cell: (row) => <AuditChangeDetail row={row} />,
    },
  ];
}
