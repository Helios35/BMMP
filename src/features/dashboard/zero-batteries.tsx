import Link from "next/link";
import type { ReactElement } from "react";
import { PackageOpen } from "lucide-react";

import { canReadRoute, canWriteRoute } from "@/domain/access/route-capability";
import type { RoleCode } from "@/domain/taxonomy/role";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  AUDIT_LOG,
  CATALOG,
  CONTAINERS,
  LOG_A_BATTERY,
  type DashboardLink,
} from "./cross-route-links";

/**
 * **E-1 — the organisation has no battery records**, on `/`.
 *
 * Five variants, because *"what a Handler is invited to do differs from what an
 * Auditor is told"*: an empty state is not one string, and shipping one string
 * for six roles is the defect this edge case exists to catch (`UX_SPEC.md` §5).
 *
 * The copy is fixed by the specification and is **not paraphrased here**. Every
 * variant carries all four parts §5's preamble requires — what is true, why, the
 * next action, and who can take it where this role cannot — and the action is
 * gated on `ROUTE_ACCESS` like every other link on the page, never on a role
 * literal (§5.3(7)).
 *
 * **Under E-12 the invitation to log a battery is omitted, not disabled.**
 * Intake is blocked organisation-wide, so it is not a permission difference
 * between colleagues; the Terms of Service alert above already carries the
 * reason, and a second control repeating it would be a dead CTA (§2.9, §3.1.7).
 */

export const ZERO_BATTERIES_VARIANTS = [
  "handler",
  "facility_manager",
  "observer",
  "auditor",
] as const;

export type ZeroBatteriesVariant = (typeof ZERO_BATTERIES_VARIANTS)[number];

export interface ZeroBatteriesState {
  readonly variant: ZeroBatteriesVariant;
  readonly message: string;
  /** Absent where this role has no reachable next step. */
  readonly action: DashboardLink | null;
}

const MESSAGES: Readonly<Record<ZeroBatteriesVariant, string>> = {
  handler:
    "No batteries logged yet. Log your first one — photograph the label and we'll read it.",
  facility_manager:
    "No batteries logged yet. Once your handlers start logging, containers and storage clocks appear here.",
  observer: "No batteries logged yet.",
  auditor:
    "No battery records in this organization yet. The audit log shows everything that has happened so far.",
};

const ACTIONS: Readonly<Record<ZeroBatteriesVariant, DashboardLink>> = {
  handler: LOG_A_BATTERY,
  facility_manager: CONTAINERS,
  observer: CATALOG,
  auditor: AUDIT_LOG,
};

/**
 * Which variant this role reads, resolved from the capability map.
 *
 * The same three questions the primary action asks, in the same order, so the
 * headline state and the header can never disagree about who this person is.
 */
export function zeroBatteriesVariant(role: RoleCode): ZeroBatteriesVariant {
  if (canWriteRoute(role, LOG_A_BATTERY.route)) return "handler";
  if (canWriteRoute(role, "/containers/[id]")) return "facility_manager";
  if (canReadRoute(role, AUDIT_LOG.route)) return "auditor";
  return "observer";
}

export function zeroBatteriesState(
  role: RoleCode,
  options: { readonly isIntakeBlocked: boolean },
): ZeroBatteriesState {
  const variant = zeroBatteriesVariant(role);
  const action = ACTIONS[variant];

  // Two gates, and they are different questions. The first is E-12: nobody in
  // this organisation may log a battery yet, so the invitation is absent for
  // everyone. The second is §5.3(7): a role that cannot reach the target is
  // never offered a link into it.
  const isBlockedCreate =
    options.isIntakeBlocked && action.route === LOG_A_BATTERY.route;
  const isReachable = canReadRoute(role, action.route);

  return {
    variant,
    message: MESSAGES[variant],
    action: isBlockedCreate || !isReachable ? null : action,
  };
}

export function ZeroBatteriesCard({
  state,
  className,
}: {
  readonly state: ZeroBatteriesState;
  readonly className?: string;
}): ReactElement {
  return (
    <Card
      data-region-state="empty"
      data-zero-batteries-variant={state.variant}
      className={cn("gap-0", className)}
    >
      <CardContent className="flex flex-col gap-3 py-1">
        <div className="flex items-start gap-3">
          <PackageOpen
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />
          <p className="max-w-[72ch] text-body-strong text-balance">
            {state.message}
          </p>
        </div>
        {state.action === null ? null : (
          <div className="pl-8">
            <Button asChild size="lg" className="min-h-11">
              <Link href={state.action.href}>{state.action.label}</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
