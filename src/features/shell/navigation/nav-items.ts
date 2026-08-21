import {
  BatteryCharging,
  BookOpen,
  Building2,
  LayoutDashboard,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { AppRoute } from "@/domain/access/routes";

/**
 * The navigation's presentation list — `SITE_ARCHITECTURE.md` §2.1.
 *
 * **This decides nothing about access.** It is keyed on {@link AppRoute}, so a
 * route that does not exist cannot be named here, and every renderer intersects
 * it with `readableRoutesFor(role)` — computed server-side, once, in
 * `src/app/(app)/layout.tsx`. There is exactly one route-access structure in
 * this codebase and it is `ROUTE_ACCESS` (§5.3(3), §7.2).
 *
 * **The import above is type-only on purpose.** A client component may not read
 * `@/domain/access/route-capability` or `@/domain/access/routes` for a value —
 * access is resolved before rendering and the client receives the answer
 * (§5.3(3)). A type import is erased, so this module is safe on either side.
 *
 * ## Nav label versus page name
 *
 * `APP_ROUTE_NAMES` carries the **page inventory** names from §4 ("Review
 * queue", "Members and roles", "Audit log"). §2.1 carries the shorter
 * **navigation** labels. Both are authored and they are not in conflict:
 * navigation uses {@link NavItem.navLabel}; page titles, breadcrumbs and the
 * command palette's page results use `APP_ROUTE_NAMES`. There is no third list.
 */

export type NavGroupId = "primary" | "settings";

/** Which count feeds an item, where §2.1 gives it one. */
export type NavBadgeId = "reviewOpenItems" | "alertingContainers";

export interface NavItem {
  readonly route: AppRoute;
  /** The short navigation label from `SITE_ARCHITECTURE.md` §2.1 — not the page title. */
  readonly navLabel: string;
  readonly icon: LucideIcon;
  readonly group: NavGroupId;
  readonly badge?: NavBadgeId;
  /**
   * Set where a child route highlights this item — `/batteries/abc` highlights
   * **Batteries**. `/` matches exactly and never carries one.
   */
  readonly matchPrefix?: string;
}

/**
 * A count per route, or absent.
 *
 * **A badge that failed to load is absent, never `0`** — "zero open items" and
 * "we could not count" are different facts, and a compliance tool that renders
 * the second as the first teaches people to trust a number it did not compute.
 */
export type NavBadges = Readonly<Partial<Record<AppRoute, number>>>;

/**
 * The navigation destinations, in `SITE_ARCHITECTURE.md` §2.1's order. **Order
 * is display order.**
 *
 * ## Why four of §2.1's ten entries are commented out
 *
 * `b1a-01-shell` builds the shell and the read-only surfaces; `/review`,
 * `/containers`, `/shipments` and `/settings/catalog` are built by later units
 * and their pages do not exist yet. A nav item pointing at a route with no page
 * is a dead link, and "no dead links" is §2.1's own rule. So the entries sit
 * here, in order, commented, each naming the unit that restores it — the later
 * builder uncomments one line and does not re-derive §2.1's order.
 *
 * **Removing the comment is the whole of the change.** Nothing about access
 * moves: `ROUTE_ACCESS` already carries all four rows and the intersection in
 * the renderer already handles them.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    route: "/",
    navLabel: "Dashboard",
    icon: LayoutDashboard,
    group: "primary",
  },
  {
    route: "/batteries",
    navLabel: "Batteries",
    icon: BatteryCharging,
    group: "primary",
    matchPrefix: "/batteries",
  },
  // 3 — Review · /review · ClipboardCheck · primary · badge "reviewOpenItems"
  //     Restored by b1a-03, which builds `src/app/(app)/review/page.tsx`.
  // 4 — Containers · /containers · Boxes · primary · badge "alertingContainers"
  //     Restored by b1a-04, which builds `src/app/(app)/containers/page.tsx`.
  // 5 — Shipments · /shipments · Truck · primary
  //     Restored by b1a-05, which builds `src/app/(app)/shipments/page.tsx`.
  {
    route: "/catalog",
    navLabel: "Catalog",
    icon: BookOpen,
    group: "primary",
    matchPrefix: "/catalog",
  },
  {
    route: "/audit",
    navLabel: "Audit",
    icon: ScrollText,
    group: "primary",
  },
  {
    route: "/settings/organization",
    navLabel: "Organization",
    icon: Building2,
    group: "settings",
  },
  {
    route: "/settings/users",
    navLabel: "Users",
    icon: Users,
    group: "settings",
  },
  // 8c — Catalog · /settings/catalog · BookMarked · settings
  //      Restored by b1a-03, which builds `src/app/(app)/settings/catalog/page.tsx`.
];

/** The heading above a group, or null where the group renders as a flat list. */
export const NAV_GROUP_HEADINGS: Readonly<Record<NavGroupId, string | null>> = {
  primary: null,
  settings: "Settings",
};

/** Group order. `primary` first, then `settings` behind a separator. */
export const NAV_GROUP_ORDER: readonly NavGroupId[] = ["primary", "settings"];

/**
 * The items this role renders — `NAV_ITEMS` intersected with the routes the
 * guard would let it open.
 *
 * `visibleRoutes` is `readableRoutesFor(role)`, resolved server-side. **A nav
 * item the current role cannot reach is not rendered** — no greyed-out nav, no
 * dead links, no "upgrade" affordance (§2.1, §5.3(7)).
 */
export function visibleNavItems(
  visibleRoutes: readonly AppRoute[],
): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => visibleRoutes.includes(item.route));
}

/**
 * The items of one group, or an empty list.
 *
 * **The Settings group renders only if the role can reach at least one child,
 * and renders only the children it can reach** (§2.1) — which is what an empty
 * list from here means to the caller.
 */
export function navItemsInGroup(
  items: readonly NavItem[],
  group: NavGroupId,
): readonly NavItem[] {
  return items.filter((item) => item.group === group);
}
