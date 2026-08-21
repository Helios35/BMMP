import type { ReactElement } from "react";

import {
  AlertCard,
  AlertCardEmpty,
  AlertCardSkeleton,
  AlertRegionError,
  type AlertCardAction,
} from "@/components";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import type { RoleCode } from "@/domain/taxonomy/role";
import { sortAlertsForBell } from "@/features/shell/chrome/alert-order";
import type { Alert } from "@/types/storage";

import {
  batteryRecordLink,
  CONTAINERS_WITH_ALERTS,
  REVIEW_QUEUE,
  shipmentLink,
  type DashboardLink,
} from "./cross-route-links";
import { DashboardRegion, describeRegionFailure } from "./dashboard-regions";

/**
 * The alerts region — `UX_SPEC.md` §3.4, and **the delivery**.
 *
 * **Alerts are in-product only in B1a** (D-34): no email, no push, no SMS. This
 * region and the bell in the shell are how a person finds out, which is why a
 * failure here renders an honest error rather than an empty list — an empty
 * region is indistinguishable from *"you have no alerts"*, and that is the one
 * thing it must never imply.
 *
 * **An alert is a stored record and no screen derives one on render**
 * (`SITE_ARCHITECTURE.md` §7.6a). `audienceRoles` is T-44 routing, not
 * permission: it is what makes Rule 4.14 true without this screen re-deriving
 * who should see what.
 *
 * **The order comes from `sortAlertsForBell` and is not rewritten here.** Pinned
 * first, then newest — one ordering, read by the bell and by this region, so the
 * two can never disagree about what is at the top. §3.4's fuller ordering needs
 * a T-48 severity rank, T-48 has no module, and a rank constant written here
 * would be the second T-48 lookup `TAXONOMY.md` §5.7 rejects.
 *
 * **An overdue storage clock pins above everything and is dismissible by no
 * role, including P6** (E-6, Rules 4.15, 4.16). `AlertCard` renders the pin and
 * carries no dismiss control at all — there is nothing to disable, and nothing
 * here adds one.
 */

const ALERT_LIMIT = 20;

const REGION_ID = "alerts";
const REGION_TITLE = "Alerts";
const REGION_EMPTY = "Nothing needs your attention right now.";
const REGION_FAILURE =
  "We could not load your alerts. Nothing has changed — try again.";

export interface AlertRouting {
  /** The one primary action. Absent where this role cannot reach the target. */
  readonly action: AlertCardAction | null;
  /** Who can act instead — **no dead button** (§2.11, Rule 1.26). */
  readonly deniedNote: string | null;
}

/**
 * Where one alert points, for one role.
 *
 * **Resolved from the alert's own subject columns**, not from a per-type table
 * of screens someone guessed at: the row already says which container, record,
 * session or shipment it is about, and a second table keyed on alert type would
 * be a place for the two to drift. An alert whose subject has no screen renders
 * informationally — an alert that links to nothing is better than one that links
 * somewhere wrong.
 */
export function routeAlert(alert: Alert, role: RoleCode): AlertRouting {
  const target = alertTarget(alert);
  if (target === null) return { action: null, deniedNote: null };

  if (!canReadRoute(role, target.route)) {
    return { action: null, deniedNote: target.remedy };
  }
  return {
    action: { label: target.label, href: target.href },
    deniedNote: null,
  };
}

function alertTarget(alert: Alert): DashboardLink | null {
  // The containers screen is where a container alert is resolved, and the
  // filtered list is the link `SITE_ARCHITECTURE.md` §2.6 names for it. The page
  // arrives with unit 04; the link is correct against the map today.
  if (alert.containerId !== null) return CONTAINERS_WITH_ALERTS;
  if (alert.batteryRecordId !== null) {
    return batteryRecordLink(alert.batteryRecordId);
  }
  if (alert.intakeSessionId !== null) return REVIEW_QUEUE;
  if (alert.shipmentId !== null) return shipmentLink(alert.shipmentId);
  return null;
}

/**
 * Whether an open storage-clock alert is routed to this role.
 *
 * Read separately from the region because the header renders before the region
 * streams, and P2's primary action **is** that alert's action (§3.4). A failed
 * read answers `false`: an action offered on the strength of a read that did not
 * happen is a dead CTA, and the region below states the failure honestly.
 */
export async function hasOpenStorageClockAlert(
  ctx: RequestContext,
): Promise<boolean> {
  try {
    const page = await data.alerts.list(ctx, {
      isOpen: true,
      audienceRole: ctx.role,
      alertType: "storage_clock",
      limit: 1,
    });
    return page.total > 0;
  } catch (cause) {
    console.error(
      `[dashboard] storage-clock alert probe failed (correlationId=${ctx.correlationId})`,
      cause,
    );
    return false;
  }
}

export async function AlertsRegion({
  ctx,
  retryHref,
}: {
  readonly ctx: RequestContext;
  readonly retryHref: string;
}): Promise<ReactElement> {
  let alerts: readonly Alert[];
  try {
    const page = await data.alerts.list(ctx, {
      isOpen: true,
      // T-44 routing, not permission (Rule 4.14).
      audienceRole: ctx.role,
      limit: ALERT_LIMIT,
    });
    alerts = sortAlertsForBell(page.items);
  } catch (cause) {
    // Nothing is swallowed: the cause is logged and the region says so.
    console.error(
      `[dashboard] alerts could not be loaded (correlationId=${ctx.correlationId})`,
      cause,
    );
    const failure = describeRegionFailure(cause, REGION_FAILURE);
    return (
      <DashboardRegion id={REGION_ID} title={REGION_TITLE} state="error">
        <AlertRegionError
          message={failure.message}
          correlationId={failure.correlationId}
          retryHref={retryHref}
        />
      </DashboardRegion>
    );
  }

  if (alerts.length === 0) {
    return (
      <DashboardRegion id={REGION_ID} title={REGION_TITLE} state="empty">
        <AlertCardEmpty message={REGION_EMPTY} />
      </DashboardRegion>
    );
  }

  return (
    <DashboardRegion id={REGION_ID} title={REGION_TITLE}>
      <ul className="flex list-none flex-col gap-3">
        {alerts.map((alert) => {
          const routing = routeAlert(alert, ctx.role);
          return (
            <li key={alert.id}>
              <AlertCard
                alert={alert}
                action={routing.action ?? undefined}
                deniedNote={routing.deniedNote ?? undefined}
              />
            </li>
          );
        })}
      </ul>
    </DashboardRegion>
  );
}

/** Three cards, per §2.11. */
export function AlertsRegionSkeleton(): ReactElement {
  return (
    <DashboardRegion id={REGION_ID} title={REGION_TITLE} state="loading">
      <div className="flex flex-col gap-3">
        <AlertCardSkeleton />
        <AlertCardSkeleton />
        <AlertCardSkeleton />
      </div>
    </DashboardRegion>
  );
}
