import {
  BatteryCharging,
  Boxes,
  Camera,
  LayoutDashboard,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { AppRoute } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * The mobile bottom tab bar's slots, per role — `SITE_ARCHITECTURE.md` §2.2.
 *
 * **Presentation, not access.** Every slot is keyed on {@link AppRoute} and is
 * intersected at render with the routes the guard would let this role open, and
 * with the routes it may write. `ROUTE_ACCESS` decides; this decides order and
 * wording (§5.3(3), §7.2).
 *
 * Type-only imports, so a client component may read this map without reaching
 * into the access layer for a value (§5.3(3)).
 */

export interface MobileTabSlot {
  readonly route: AppRoute;
  /** Appended to the route to make the href. `""` for a plain destination. */
  readonly query: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /**
   * `write` where the slot is an action the role must be able to **perform**,
   * not merely reach. The centre slot for P1 and P6 is the intake route, and a
   * role that can only read it has no business being offered a raised primary
   * that opens it.
   */
  readonly requires: "read" | "write";
}

export interface MobileTabSlots {
  /**
   * §2.2's slots 1, 2 and 4, in order. Slot 5 is always **More** and is not
   * configurable.
   */
  readonly destinations: readonly MobileTabSlot[];
  /**
   * §2.2's slot 3 — the raised 64px primary, the single most-used action for
   * this role.
   *
   * **`null` where §2.2's target is a route a later unit builds.** The slot is
   * then simply not rendered: the bar carries four slots and no raised primary.
   * Substituting a different destination would put a tab under a role's thumb
   * that §2.2 never put there, and a raised primary is the strongest placement
   * in the product.
   */
  readonly centre: MobileTabSlot | null;
}

const HOME: MobileTabSlot = {
  route: "/",
  query: "",
  label: "Home",
  icon: LayoutDashboard,
  requires: "read",
};

const BATTERIES: MobileTabSlot = {
  route: "/batteries",
  query: "",
  label: "Batteries",
  icon: BatteryCharging,
  requires: "read",
};

const CONTAINERS: MobileTabSlot = {
  route: "/containers",
  query: "",
  label: "Containers",
  icon: Boxes,
  requires: "read",
};

/**
 * §2.2's raised centre for P2 — the containers carrying an open alert, the
 * link the dashboard's storage-clock alert sends (Flow C2).
 */
const ALERTING_CONTAINERS: MobileTabSlot = {
  route: "/containers",
  query: "?filter=alerting",
  label: "Alerting",
  icon: TriangleAlert,
  requires: "read",
};

/**
 * §2.2's raised centre for P1 and P6 — *"Log"*.
 *
 * `Camera` rather than a capture-specific glyph: `lucide-react` carries no
 * `CameraPlus`, and the intake flow opens on the photo step (`UX_SPEC.md` §3.6).
 */
const LOG_A_BATTERY: MobileTabSlot = {
  route: "/batteries/new",
  query: "",
  label: "Log",
  icon: Camera,
  requires: "write",
};

/** §2.2's slots 1, 2 and 4 for P1, P6, P3, P4 and P5. */
const BATTERIES_THEN_CONTAINERS: readonly MobileTabSlot[] = [
  HOME,
  BATTERIES,
  CONTAINERS,
];

/**
 * Per role, from §2.2.
 *
 * P2 works out of her containers first, so her slot 2 is Containers and slot
 * 4 Batteries, and her raised centre is the alerting filter. The centre for
 * P3, P4 and P5 is `/shipments`, which `b1a-05` builds; until then it is
 * `null` rather than substituted — a raised primary §2.2 never put there would
 * be the strongest placement in the product.
 */
export const MOBILE_TAB_SLOTS: Readonly<Record<RoleCode, MobileTabSlots>> = {
  compliance_handler: {
    destinations: BATTERIES_THEN_CONTAINERS,
    centre: LOG_A_BATTERY,
  },
  facility_manager: {
    destinations: [HOME, CONTAINERS, BATTERIES],
    centre: ALERTING_CONTAINERS,
  },
  producer_compliance_officer: {
    destinations: BATTERIES_THEN_CONTAINERS,
    // §2.2: `/shipments`, label "Shipments", icon Truck, requires "read".
    // Restored by b1a-05 with `/shipments`.
    centre: null,
  },
  mobility_supplier_technician: {
    destinations: BATTERIES_THEN_CONTAINERS,
    // §2.2: `/shipments`. Restored by b1a-05.
    centre: null,
  },
  auditor: {
    destinations: BATTERIES_THEN_CONTAINERS,
    // §2.2: `/shipments`. Restored by b1a-05.
    centre: null,
  },
  platform_admin: {
    destinations: BATTERIES_THEN_CONTAINERS,
    centre: LOG_A_BATTERY,
  },
};

/** The href a slot navigates to. */
export function mobileTabHref(slot: MobileTabSlot): string {
  return `${slot.route}${slot.query}`;
}

/**
 * Whether this role may use a slot, given the routes resolved server-side.
 *
 * The two lists arrive as props — `readableRoutesFor(role)` and the routes the
 * role may write — because the bar is a client component and access is not
 * decided there (§5.3(3)).
 */
export function canUseMobileTabSlot(
  slot: MobileTabSlot,
  visibleRoutes: readonly AppRoute[],
  writableRoutes: readonly AppRoute[],
): boolean {
  return slot.requires === "write"
    ? writableRoutes.includes(slot.route)
    : visibleRoutes.includes(slot.route);
}
