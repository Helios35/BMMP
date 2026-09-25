import { canWriteRoute } from "@/domain/access/route-capability";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * Where P1 and P2 differ on `/containers/[id]` — `SITE_ARCHITECTURE.md` §5.5,
 * plus §3.9's **New container**, which the same three roles hold.
 *
 * **Both hold `write` on the route and they do not hold the same `write`.**
 * `ROUTE_ACCESS` answers whether the page opens; this table answers which of
 * its actions a role may take, transcribed row for row. Every control on the
 * page and every Server Action behind one reads it, so a button and the check
 * that refuses it cannot disagree.
 *
 * A row is honoured only where the role also holds `write` on the route — P6's
 * column is read as "under an active support grant", as every P6 row is.
 *
 * Two §5.5 rows are **not here**, and the build-notes say why: choosing the
 * site's demonstration method (Rule 4.3) needs a site entity, which does not
 * exist; generating or reprinting the label is document generation (unit 06).
 *
 * **No row changes an accumulation start date, for any role.** The absence is
 * the enforcement (Rules 4.4, 4.9–4.12).
 */
export const CONTAINER_ACTIONS = [
  /** **New container** — `UX_SPEC.md` §3.9's primary action, P1, P2 and P6. Not a §5.5 row. */
  "create",
  /** Inspection, and the other storage events a role may record (§5.5 row 1). */
  "record_storage_event",
  /** On an overdue container only (Rule 4.17). */
  "record_remediation",
  /** Move, consolidate, split — records leave one container for another. */
  "add_or_remove_records",
  /** T-24 `closed` — "Sealed and ready for shipment". */
  "mark_ready_to_ship",
  /** A link to `/shipments/new?containers=`; the shipment is unit 05's. */
  "ship_this_container",
  "edit_capacity_or_location",
  /** An empty container with a closed clock (Rule 4.30). */
  "retire",
] as const;

export type ContainerAction = (typeof CONTAINER_ACTIONS)[number];

type ContainerRole = Extract<
  RoleCode,
  "compliance_handler" | "facility_manager" | "platform_admin"
>;

/** §5.5, P1 · P2 · P6. */
const WRITE_SET: Readonly<Record<ContainerRole, readonly ContainerAction[]>> = {
  compliance_handler: [
    "create",
    "record_storage_event",
    "add_or_remove_records",
    "mark_ready_to_ship",
    "ship_this_container",
  ],
  facility_manager: [
    "create",
    "record_storage_event",
    "record_remediation",
    "mark_ready_to_ship",
    "edit_capacity_or_location",
    "retire",
  ],
  platform_admin: [...CONTAINER_ACTIONS],
};

function isContainerRole(role: RoleCode): role is ContainerRole {
  return role in WRITE_SET;
}

/** Whether this role may take this action on a container. */
export function mayTakeContainerAction(
  role: RoleCode,
  action: ContainerAction,
): boolean {
  if (!canWriteRoute(role, "/containers/[id]")) return false;
  return isContainerRole(role) && WRITE_SET[role].includes(action);
}

/** The roles that may take an action — for naming who can, never only the refusal (Rule 1.26). */
export function rolesForContainerAction(
  action: ContainerAction,
): readonly RoleCode[] {
  return (Object.keys(WRITE_SET) as ContainerRole[]).filter((role) =>
    mayTakeContainerAction(role, action),
  );
}
