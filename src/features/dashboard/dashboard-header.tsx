import Link from "next/link";
import type { ReactElement } from "react";

import { canReadRoute, canWriteRoute } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";
import { Button } from "@/components/ui/button";

import {
  AUDIT_LOG,
  CONTAINERS_WITH_ALERTS,
  LOG_A_BATTERY,
  type DashboardLink,
} from "./cross-route-links";

/**
 * The dashboard's one primary action — `UX_SPEC.md` §3.4.
 *
 * §3.4 states the answer per role; **this resolves it from `ROUTE_ACCESS`
 * instead of from a role literal**, because the map is the one structure the
 * guard, the navigation, the palette and every cross-route link read
 * (`SITE_ARCHITECTURE.md` §5.3(3), §7.2). A role name written here is a second
 * copy of the map that drifts the first time a capability moves — and B3 already
 * moves one (P4 gains `write` on `/batteries/new`).
 *
 * The branches, in order, and what each resolves to today:
 *
 * | Capability asked | Roles that hold it | Action |
 * |---|---|---|
 * | `write` on `/batteries/new` | P1, P6 | **Log a battery** |
 * | `write` on `/containers/[id]` | P2 | the most urgent storage-clock alert's own action |
 * | `read` on `/audit` | P5 | **Open the audit log** |
 * | none of the above | P3, P4 | no primary action |
 *
 * P2 is asked for `write` on the container detail rather than for her name: she
 * is the role that *resolves* a container alert, which is exactly what §3.4
 * means by "the most urgent storage-clock alert". Where no such alert is open
 * she gets **no primary action at all** — there is no most-urgent alert to
 * offer, and a CTA to a filtered list with nothing in it is a dead CTA.
 *
 * **P5 sees no create action anywhere on this page** (§3.4, E-1), and under
 * E-12 the create action is **omitted rather than disabled**: intake is blocked
 * organisation-wide, so it is not a permission difference between colleagues,
 * and §2.9's table makes "nobody in this organisation can do this yet" absent.
 * The Terms of Service alert carries the reason (§3.1.7, Rules 7.1, 7.2).
 */

export interface DashboardPrimaryActionInput {
  readonly role: RoleCode;
  /** Whether an open storage-clock alert is routed to this role today. */
  readonly hasStorageClockAlert: boolean;
  /** E-12 — no Terms of Service acceptance in force for this organisation. */
  readonly isIntakeBlocked: boolean;
}

export function dashboardPrimaryAction(
  input: DashboardPrimaryActionInput,
): DashboardLink | null {
  const { role, hasStorageClockAlert, isIntakeBlocked } = input;

  if (canWriteRoute(role, LOG_A_BATTERY.route)) {
    return isIntakeBlocked ? null : LOG_A_BATTERY;
  }

  if (canWriteRoute(role, "/containers/[id]")) {
    return hasStorageClockAlert &&
      canReadRoute(role, CONTAINERS_WITH_ALERTS.route)
      ? CONTAINERS_WITH_ALERTS
      : null;
  }

  if (canReadRoute(role, AUDIT_LOG.route)) return AUDIT_LOG;

  return null;
}

/**
 * The page title and its action.
 *
 * **`id="page-title"` and `tabIndex={-1}` are required**: the shell's route
 * announcer moves focus here on every navigation, and without them a route
 * change is silent to a screen reader (`UX_SPEC.md` §6.6).
 */
export function DashboardHeader({
  action,
}: {
  readonly action: DashboardLink | null;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <h1 id="page-title" tabIndex={-1} className="text-h1 lg:text-display">
        {APP_ROUTE_NAMES["/"]}
      </h1>
      {action === null ? null : (
        <Button asChild size="lg" className="min-h-11">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
