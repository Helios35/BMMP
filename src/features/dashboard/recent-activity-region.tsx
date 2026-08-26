import Link from "next/link";
import type { ReactElement } from "react";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import {
  AUDIT_ACTOR_TYPES,
  AUDIT_ACTOR_TYPE_LABELS,
} from "@/domain/taxonomy/audit-actor-type";
import {
  AUDIT_EVENT_TYPES,
  AUDIT_EVENT_TYPE_LABELS,
} from "@/domain/taxonomy/audit-event-type";
import {
  HANDLER_ACTIVITY_TYPES,
  HANDLER_ACTIVITY_TYPE_LABELS,
} from "@/domain/taxonomy/handler-activity-type";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import type { RoleCode } from "@/domain/taxonomy/role";
import { relativeTimeLabel } from "@/features/shell/chrome/relative-time";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/page";
import type { AuditEvent } from "@/types/audit";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { StorageEvent } from "@/types/storage";

import {
  AUDIT_LOG,
  batteryRecordLink,
  catalogEntryLink,
  containerLink,
  documentLink,
  shipmentLink,
  type DashboardLink,
} from "./cross-route-links";
import {
  DashboardRegion,
  DashboardRegionEmpty,
  DashboardRegionError,
  DashboardRegionSkeleton,
  describeRegionFailure,
} from "./dashboard-regions";

/**
 * Recent activity — `UX_SPEC.md` §3.4: *"last ten `audit_event`s the role may
 * see, each linked."*
 *
 * **P1, P3 and P4 may see none** (Rule 12.8), and that is not a gap this screen
 * papers over: they read the history of the records they can already open, built
 * from `storage_event`, which is the source the audit contract itself names for
 * them. Calling `auditEvents.list` for those roles would raise a
 * `PermissionError` from `src/data/mock/policy.ts` — the mock faithfully
 * mirroring the RLS policy, not a bug — so the branch happens **before** the
 * read.
 *
 * **The branch asks `ROUTE_ACCESS`, not a role name.** One map, four consumers,
 * and this is one of them (`SITE_ARCHITECTURE.md` §5.3(3), §7.2).
 *
 * **T-60 is rendered, not summarised.** An actor type is read through the one
 * T-60 lookup and carried on `data-actor-type`, because a platform action that
 * is indistinguishable from a member's is not a recorded support grant
 * (Rules 1.18, 12.7).
 *
 * Times render as a relative caption from a **server-supplied** instant. A
 * relative caption is not an absolute timestamp, so it carries no zone — and the
 * zone it would need is the *site's*, which an audit row does not carry
 * (Rule 4.29).
 */

const ACTIVITY_LIMIT = 10;

const REGION_ID = "recent-activity";
const REGION_TITLE = "Recent activity";
const REGION_FAILURE =
  "We could not load recent activity. Nothing has changed — try again.";

export const RECENT_ACTIVITY_SOURCES = [
  "audit_event",
  "storage_event",
] as const;

export type RecentActivitySource = (typeof RECENT_ACTIVITY_SOURCES)[number];

/**
 * Which table this role's recent activity comes from — Rule 12.8.
 *
 * `read` on `/audit` is exactly P2, P5 and P6, which is exactly the SELECT set
 * on `audit_event`. The two agree because they are the same decision, taken
 * once.
 */
export function recentActivitySource(role: RoleCode): RecentActivitySource {
  return canReadRoute(role, AUDIT_LOG.route) ? "audit_event" : "storage_event";
}

export interface ActivityRow {
  readonly id: Uuid;
  /** The T-43 or T-16 display label, or the stored value where it is unrecognised. */
  readonly label: string;
  /** False where the stored value is not one this build knows (`TAXONOMY.md` §5.8). */
  readonly isRecognised: boolean;
  /** T-60 on an audit row; absent on a storage row, which has no actor type column. */
  readonly actorType?: string;
  readonly actorLabel: string | null;
  readonly at: IsoTimestamp;
  readonly href: string | null;
}

/**
 * Which screen an audit row's subject opens on, for this role.
 *
 * A table with no screen returns `null` — a `storage_clock`, a `membership` and
 * a `user` are all real subjects with no addressable page in B1a, and a link
 * that goes nowhere is worse than a row that does not link.
 */
export function auditRowLink(
  role: RoleCode,
  entityTable: string,
  entityId: Uuid,
): string | null {
  const link = auditSubjectLink(entityTable, entityId);
  if (link === null) return null;
  return canReadRoute(role, link.route) ? link.href : null;
}

function auditSubjectLink(
  entityTable: string,
  entityId: Uuid,
): DashboardLink | null {
  switch (entityTable) {
    case "battery_record":
      return batteryRecordLink(entityId);
    case "container":
      return containerLink(entityId);
    case "shipment":
      return shipmentLink(entityId);
    case "document_render":
      return documentLink(entityId);
    case "catalog_entry":
      return catalogEntryLink(entityId);
    default:
      return null;
  }
}

/** A storage row names its own subject; the record wins over the container. */
export function storageRowLink(
  role: RoleCode,
  event: StorageEvent,
): string | null {
  const link =
    event.batteryRecordId !== null
      ? batteryRecordLink(event.batteryRecordId)
      : event.containerId !== null
        ? containerLink(event.containerId)
        : null;
  if (link === null) return null;
  return canReadRoute(role, link.route) ? link.href : null;
}

export function auditActivityRow(
  event: AuditEvent,
  role: RoleCode,
): ActivityRow {
  const type = readTaxonomyValue(
    AUDIT_EVENT_TYPES,
    AUDIT_EVENT_TYPE_LABELS,
    event.eventType,
  );
  const actor = readTaxonomyValue(
    AUDIT_ACTOR_TYPES,
    AUDIT_ACTOR_TYPE_LABELS,
    event.actorType,
  );

  if (!type.recognised)
    warnUnrecognised("T-43 audit event type", type.storedValue);
  if (!actor.recognised)
    warnUnrecognised("T-60 audit actor type", actor.storedValue);

  return {
    id: event.id,
    label: type.recognised ? type.label : type.storedValue,
    isRecognised: type.recognised,
    actorType: event.actorType,
    actorLabel: actor.recognised ? actor.label : actor.storedValue,
    at: event.occurredAt,
    href: auditRowLink(role, event.entityTable, event.entityId),
  };
}

export function storageActivityRow(
  event: StorageEvent,
  role: RoleCode,
): ActivityRow {
  const activity = readTaxonomyValue(
    HANDLER_ACTIVITY_TYPES,
    HANDLER_ACTIVITY_TYPE_LABELS,
    event.activityType,
  );
  if (!activity.recognised) {
    warnUnrecognised("T-16 handler activity type", activity.storedValue);
  }

  return {
    id: event.id,
    label: activity.recognised ? activity.label : activity.storedValue,
    isRecognised: activity.recognised,
    actorLabel: null,
    at: event.occurredAt,
    href: storageRowLink(role, event),
  };
}

/**
 * `TAXONOMY.md` §5.8 — an unrecognised value is **rendered as stored**, warned
 * about, and never blanked, coerced or dropped from a count.
 */
function warnUnrecognised(system: string, storedValue: string): void {
  console.warn(`[dashboard] unrecognised ${system}: ${storedValue}`);
}

export async function RecentActivityRegion({
  ctx,
  asOf,
  retryHref,
}: {
  readonly ctx: RequestContext;
  readonly asOf: IsoTimestamp;
  readonly retryHref: string;
}): Promise<ReactElement> {
  const source = recentActivitySource(ctx.role);

  let rows: readonly ActivityRow[];
  try {
    if (source === "audit_event") {
      const page = await data.auditEvents.list(ctx, { limit: ACTIVITY_LIMIT });
      rows = page.items.map((event) => auditActivityRow(event, ctx.role));
    } else {
      const page = await data.storageEvents.list(ctx, {
        limit: ACTIVITY_LIMIT,
      });
      rows = page.items.map((event) => storageActivityRow(event, ctx.role));
    }
  } catch (cause) {
    console.error(
      `[dashboard] recent activity could not be loaded (correlationId=${ctx.correlationId})`,
      cause,
    );
    const failure = describeRegionFailure(cause, REGION_FAILURE);
    return (
      <DashboardRegion id={REGION_ID} title={REGION_TITLE} state="error">
        <DashboardRegionError
          message={failure.message}
          correlationId={failure.correlationId}
          retryHref={retryHref}
        />
      </DashboardRegion>
    );
  }

  const canOpenAuditLog = canReadRoute(ctx.role, AUDIT_LOG.route);

  if (rows.length === 0) {
    return (
      <DashboardRegion id={REGION_ID} title={REGION_TITLE} state="empty">
        <DashboardRegionEmpty
          title="Nothing has happened here yet."
          description="Every action this organization takes is recorded, and the most recent ten show here."
          action={
            canOpenAuditLog
              ? { label: AUDIT_LOG.label, href: AUDIT_LOG.href }
              : undefined
          }
          whoCanAct={canOpenAuditLog ? undefined : AUDIT_LOG.remedy}
        />
      </DashboardRegion>
    );
  }

  return (
    <DashboardRegion
      id={REGION_ID}
      title={REGION_TITLE}
      headingAction={
        canOpenAuditLog ? (
          <Link
            href={AUDIT_LOG.href}
            className="inline-flex min-h-11 items-center rounded-md px-3 text-label underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            {AUDIT_LOG.label}
          </Link>
        ) : undefined
      }
    >
      <SectionCard>
        <ul
          data-activity-source={source}
          className="flex list-none flex-col divide-y divide-border"
        >
          {rows.map((row) => (
            <li
              key={row.id}
              data-actor-type={row.actorType}
              className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {row.href === null ? (
                  <span
                    className={cn(
                      "inline-flex min-h-11 items-center",
                      // An unrecognised stored value renders exactly as
                      // stored, in mono (`TAXONOMY.md` §5.8).
                      row.isRecognised ? "text-body-strong" : "text-mono",
                    )}
                  >
                    {row.label}
                  </span>
                ) : (
                  // The row's own 44px target rather than a claimed inline
                  // exemption: this link is the row, not a phrase inside a
                  // sentence (§1.5, WCAG 2.5.8).
                  <Link
                    href={row.href}
                    className={cn(
                      "inline-flex min-h-11 min-w-11 items-center rounded-md underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                      row.isRecognised ? "text-body-strong" : "text-mono",
                    )}
                  >
                    {row.label}
                  </Link>
                )}
                {row.actorLabel === null ? null : (
                  <span className="text-caption text-muted-foreground">
                    {row.actorLabel}
                  </span>
                )}
              </span>
              <time
                dateTime={row.at}
                className="tabular text-caption text-muted-foreground"
              >
                {relativeTimeLabel(row.at, asOf)}
              </time>
            </li>
          ))}
        </ul>
      </SectionCard>
    </DashboardRegion>
  );
}

export function RecentActivityRegionSkeleton(): ReactElement {
  return (
    <DashboardRegion id={REGION_ID} title={REGION_TITLE} state="loading">
      <DashboardRegionSkeleton rows={1} rowClassName="h-64" />
    </DashboardRegion>
  );
}
