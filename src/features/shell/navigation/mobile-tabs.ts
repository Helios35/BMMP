import {
  BatteryCharging,
  BookOpen,
  Camera,
  LayoutDashboard,
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

/**
 * Standing in for §2.2's Containers slot until `b1a-04` builds `/containers`.
 *
 * §2.2 fills slots 2 and 4 with the two lists a role works out of. With
 * Containers deferred, Catalog is the next destination §2.1 gives every role,
 * so the bar keeps four slots rather than shrinking to three.
 */
const CATALOG: MobileTabSlot = {
  route: "/catalog",
  query: "",
  label: "Catalog",
  icon: BookOpen,
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

/** Slots 1, 2 and 4 for every role in this unit. */
const READ_DESTINATIONS: readonly MobileTabSlot[] = [HOME, BATTERIES, CATALOG];

/**
 * Per role, from §2.2.
 *
 * ## What is deferred, and why the centre is empty rather than substituted
 *
 * §2.2 gives the centre slot as: `/batteries/new` for P1 and P6,
 * `/containers?filter=alerting` for P2, and `/shipments` for P3, P4 and P5. Two
 * of those three routes are built by later units.
 *
 * The obvious interim — fall back to `/batteries` — puts Batteries on the bar
 * twice for P2, whose §2.2 slot 4 is already Batteries. So the deferred centres
 * are `null` instead, each naming the unit that restores it. Nothing is
 * invented and nothing is duplicated.
 */
export const MOBILE_TAB_SLOTS: Readonly<Record<RoleCode, MobileTabSlots>> = {
  compliance_handler: {
    destinations: READ_DESTINATIONS,
    centre: LOG_A_BATTERY,
  },
  facility_manager: {
    destinations: READ_DESTINATIONS,
    // §2.2: `/containers?filter=alerting`, label "Alerting", icon TriangleAlert,
    // requires "read". Restored by b1a-04 with `/containers`.
    centre: null,
  },
  producer_compliance_officer: {
    destinations: READ_DESTINATIONS,
    // §2.2: `/shipments`, label "Shipments", icon Truck, requires "read".
    // Restored by b1a-05 with `/shipments`.
    centre: null,
  },
  mobility_supplier_technician: {
    destinations: READ_DESTINATIONS,
    // §2.2: `/shipments`. Restored by b1a-05.
    centre: null,
  },
  auditor: {
    destinations: READ_DESTINATIONS,
    // §2.2: `/shipments`. Restored by b1a-05.
    centre: null,
  },
  platform_admin: {
    destinations: READ_DESTINATIONS,
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
