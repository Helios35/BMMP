import Link from "next/link";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { canWriteRoute } from "@/domain/access/route-capability";
import type { AppRoute } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";

import { DashboardRegion } from "./dashboard-regions";

/**
 * Quick actions — `UX_SPEC.md` §3.4, **rendered from the map, one entry per
 * route.**
 *
 * Filtered by `canWriteRoute`, so the list is the role's actual capability and
 * never a second opinion about it. That yields both entries for P1 and P6, and
 * **none for P2, P3, P4 and P5** — for whom the region does not render at all.
 * **Absent, not disabled**: a create action a colleague does not hold is not
 * theirs to be shown greyed out (§2.9), and **P5 sees no create action anywhere
 * on this page.**
 *
 * **§3.4 also lists "Print a container label" and it is deliberately absent.**
 * It has no unambiguous target route without a selected container, and
 * `/containers/[id]` is unit 04's. Inventing a target would be a twenty-first
 * route by the back door (`SITE_ARCHITECTURE.md` §7.1); this is recorded in the
 * build-notes instead.
 *
 * **Under E-12 the "Log a battery" entry is omitted, not disabled** (§3.1.7).
 * Intake is blocked organisation-wide, so nobody in this organisation can do it
 * yet — which §2.9's decision table makes absent rather than disabled-with-a-
 * reason. The Terms of Service alert at the top of the page carries the reason,
 * and every other region stays exactly as it is: **the gate blocks intake, not
 * the app** (Rules 7.1, 7.2).
 */

const REGION_ID = "quick-actions";
const REGION_TITLE = "Quick actions";

export const QUICK_ACTIONS: readonly (readonly [AppRoute, string])[] = [
  ["/batteries/new", "Log a battery"],
  ["/shipments/new", "Build a shipment"],
];

/** Intake routes, which E-12 closes organisation-wide. */
const INTAKE_ROUTES: readonly AppRoute[] = ["/batteries/new"];

export interface QuickAction {
  readonly route: AppRoute;
  readonly label: string;
}

export function quickActionsFor(
  role: RoleCode,
  options: { readonly isIntakeBlocked: boolean },
): readonly QuickAction[] {
  return QUICK_ACTIONS.filter(([route]) => {
    if (options.isIntakeBlocked && INTAKE_ROUTES.includes(route)) return false;
    return canWriteRoute(role, route);
  }).map(([route, label]) => ({ route, label }));
}

export function QuickActionsRegion({
  role,
  isIntakeBlocked,
}: {
  readonly role: RoleCode;
  readonly isIntakeBlocked: boolean;
}): ReactElement | null {
  const actions = quickActionsFor(role, { isIntakeBlocked });
  if (actions.length === 0) return null;

  return (
    <DashboardRegion id={REGION_ID} title={REGION_TITLE}>
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <Button
            key={action.route}
            asChild
            variant="outline"
            size="lg"
            className="min-h-11"
          >
            <Link href={action.route}>{action.label}</Link>
          </Button>
        ))}
      </div>
    </DashboardRegion>
  );
}
