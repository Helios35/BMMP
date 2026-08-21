import Link from "next/link";
import type { ReactElement } from "react";
import { BatteryCharging } from "lucide-react";

import { Button } from "@/components/ui/button";
import { canReadRoute, canWriteRoute } from "@/domain/access/route-capability";
import type { AppRoute } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * E-1 — zero battery records, in five variants.
 *
 * **Five variants because an empty list means five different things.** A handler
 * is being asked to start; a facility manager is waiting on her handlers; a
 * producer or a technician is looking at a list that is not theirs to fill; an
 * auditor is being pointed at the record that does exist. One generic
 * *"Nothing here"* would be true for all five and useful to none.
 *
 * **Every action is gated on `ROUTE_ACCESS`** — the same map the guard, the
 * navigation and the command palette read. A role that cannot reach the target
 * gets the sentence with no button rather than a control that redirects
 * (§5.3(7)). **P5 is offered no create action anywhere**, because a dead CTA is
 * worse than no CTA.
 *
 * This is the *zero records* state and nothing else. *The filters exclude
 * everything* is a different sentence with a different action, and `RecordTable`
 * owns it — showing onboarding copy to someone who mistyped a filter is a defect
 * (§2.7).
 */

interface EmptyStateAction {
  readonly label: string;
  readonly route: AppRoute;
  /** `write` where performing the action is the point, `read` where opening is. */
  readonly capability: "read" | "write";
}

interface EmptyStateVariant {
  readonly message: string;
  readonly action: EmptyStateAction;
}

const START_HERE =
  "No batteries logged yet. Log your first one — photograph the label and we'll read it.";

const LOG_A_BATTERY: EmptyStateAction = {
  label: "Log a battery",
  route: "/batteries/new",
  capability: "write",
};

/** §5 E-1's copy, verbatim. It is the sentence, not a paraphrase of it. */
const EMPTY_STATE: Readonly<Record<RoleCode, EmptyStateVariant>> = {
  compliance_handler: { message: START_HERE, action: LOG_A_BATTERY },
  platform_admin: { message: START_HERE, action: LOG_A_BATTERY },
  facility_manager: {
    message:
      "No batteries logged yet. Once your handlers start logging, containers and storage clocks appear here.",
    action: {
      label: "View containers",
      route: "/containers",
      capability: "read",
    },
  },
  producer_compliance_officer: {
    message: "No batteries logged yet.",
    action: { label: "View catalog", route: "/catalog", capability: "read" },
  },
  mobility_supplier_technician: {
    message: "No batteries logged yet.",
    action: { label: "View catalog", route: "/catalog", capability: "read" },
  },
  auditor: {
    message:
      "No battery records in this organization yet. The audit log shows everything that has happened so far.",
    action: {
      label: "Open the audit log",
      route: "/audit",
      capability: "read",
    },
  },
};

export function BatteryEmptyState({
  role,
}: {
  readonly role: RoleCode;
}): ReactElement {
  const variant = EMPTY_STATE[role];
  const { action } = variant;
  const isOffered =
    action.capability === "write"
      ? canWriteRoute(role, action.route)
      : canReadRoute(role, action.route);

  return (
    <div
      role="status"
      data-empty-role={role}
      className="flex flex-col items-start gap-3 rounded-lg border border-border p-6"
    >
      <div className="flex items-center gap-2">
        <BatteryCharging aria-hidden="true" className="size-5" />
        <p className="max-w-[72ch] text-body-strong">{variant.message}</p>
      </div>
      {isOffered ? (
        <Button asChild size="lg" className="min-h-11 rounded-md">
          <Link href={action.route} data-empty-action={action.route}>
            {action.label}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
