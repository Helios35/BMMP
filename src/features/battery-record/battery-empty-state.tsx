import type { ReactElement } from "react";
import { BatteryCharging } from "lucide-react";

import { EmptyState } from "@/components/page/empty-state";
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
  isIntakeBlocked = false,
}: {
  readonly role: RoleCode;
  /**
   * E-12 — the organisation has no Terms of Service acceptance in force, so
   * intake is blocked organisation-wide (Rules 7.1, 7.2).
   *
   * The intake action is then **omitted, not disabled.** §2.9's decision table
   * makes "disabled with a reason" the *auditor* pattern — a permission
   * difference between colleagues. E-12 is "nobody in this organisation can do
   * this yet", and that is absent. The dashboard makes the same call, and the
   * two screens have to agree or a handler is offered a button on one page and
   * not the other.
   */
  readonly isIntakeBlocked?: boolean;
}): ReactElement {
  const variant = EMPTY_STATE[role];
  const { action } = variant;
  const isBlockedByConsent =
    isIntakeBlocked && action.route === "/batteries/new";
  const isOffered =
    !isBlockedByConsent &&
    (action.capability === "write"
      ? canWriteRoute(role, action.route)
      : canReadRoute(role, action.route));

  return (
    <EmptyState
      icon={BatteryCharging}
      // §5 E-1's sentence, whole. It is never split across a headline and a
      // body: three e2e specs read it back as one rendered paragraph, and the
      // words are the specification's rather than this build's.
      title={variant.message}
      action={
        isOffered
          ? { label: action.label, href: action.route, testId: action.route }
          : null
      }
      dataAttributes={{ "data-empty-role": role }}
    />
  );
}
