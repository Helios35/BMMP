"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AppRoute } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";
import { cn } from "@/lib/utils";

import {
  canUseMobileTabSlot,
  mobileTabHref,
  MOBILE_TAB_SLOTS,
  type MobileTabSlot,
} from "./mobile-tabs";
import { isNavLinkActive, type NavLinkProps } from "./nav-link";
import { MoreSheet, type MoreSheetProps } from "./more-sheet";
import type { NavBadges } from "./nav-items";

/**
 * The mobile bottom tab bar — `SITE_ARCHITECTURE.md` §2.2.
 *
 * This is the warehouse and storage-room form factor and it is the default the
 * intake flow is designed against. Fixed to the bottom, safe-area inset
 * respected, 64px tall, five slots.
 *
 * **The centre slot differs by role and is a raised 64px primary** — the single
 * most-used action for that role, reachable one-handed (§2.2, `UX_SPEC.md` §1.5,
 * §4.3). Where §2.2's centre target is a route a later unit builds, the slot is
 * absent rather than substituted; see `mobile-tabs.ts`.
 *
 * **This bar and the desktop sidebar are the same primary navigation at
 * different widths**, so exactly one of them is in the accessibility tree at a
 * time — `md:hidden` here, `hidden md:flex` there. `display: none` is what makes
 * that true.
 *
 * It decides nothing about access: `visibleRoutes` and `writableRoutes` are
 * resolved server-side and a slot the role cannot use never renders (§5.3(3),
 * §5.3(7)).
 */

export interface MobileTabBarProps {
  readonly role: RoleCode;
  /** `readableRoutesFor(role)`. */
  readonly visibleRoutes: readonly AppRoute[];
  /** The routes this role holds `write` on — a `requires: "write"` slot needs it. */
  readonly writableRoutes: readonly AppRoute[];
  readonly badges: NavBadges;
  readonly moreSheet: Omit<
    MoreSheetProps,
    "barRoutes" | "visibleRoutes" | "badges"
  >;
}

function TabLink({
  slot,
  matchPrefix,
}: {
  readonly slot: MobileTabSlot;
  readonly matchPrefix: NavLinkProps["matchPrefix"];
}) {
  const pathname = usePathname();
  const href = mobileTabHref(slot);
  const isActive = isNavLinkActive(pathname, slot.route, matchPrefix);
  const Icon = slot.icon;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      data-mobile-tab={slot.route}
      data-active={isActive ? "true" : "false"}
      className={cn(
        "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-md px-2 py-1",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        isActive ? "bg-muted text-foreground" : "text-muted-foreground",
      )}
    >
      {/* The 3px top bar. Colour is never the only signal (UX_SPEC.md §1.2 Rule 4). */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-md",
          isActive ? "bg-primary" : "bg-transparent",
        )}
      />
      <Icon aria-hidden="true" className="size-6" />
      <span className="text-caption">{slot.label}</span>
    </Link>
  );
}

export function MobileTabBar({
  role,
  visibleRoutes,
  writableRoutes,
  badges,
  moreSheet,
}: MobileTabBarProps) {
  const slots = MOBILE_TAB_SLOTS[role];

  const destinations = slots.destinations.filter((slot) =>
    canUseMobileTabSlot(slot, visibleRoutes, writableRoutes),
  );
  const centre =
    slots.centre !== null &&
    canUseMobileTabSlot(slots.centre, visibleRoutes, writableRoutes)
      ? slots.centre
      : null;

  const barRoutes: readonly AppRoute[] = [
    ...destinations.map((slot) => slot.route),
    ...(centre === null ? [] : [centre.route]),
  ];

  const CentreIcon = centre?.icon;

  return (
    <nav
      aria-label="Primary"
      data-mobile-tab-bar
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex h-16 items-stretch gap-2 px-2">
        {destinations.slice(0, 2).map((slot) => (
          <TabLink
            key={slot.route}
            slot={slot}
            matchPrefix={slot.route === "/" ? undefined : slot.route}
          />
        ))}

        {centre !== null && CentreIcon !== undefined ? (
          <Link
            href={mobileTabHref(centre)}
            data-mobile-tab="centre"
            data-mobile-tab-route={centre.route}
            // 64px raised primary. `size-16` is the specified figure, not a
            // rounded one (§2.2, UX_SPEC.md §4.3).
            className="flex size-16 shrink-0 -translate-y-3 flex-col items-center justify-center gap-0.5 self-center rounded-full bg-primary text-primary-foreground shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            <CentreIcon aria-hidden="true" className="size-6" />
            <span className="text-caption">{centre.label}</span>
          </Link>
        ) : null}

        {destinations.slice(2).map((slot) => (
          <TabLink
            key={slot.route}
            slot={slot}
            matchPrefix={slot.route === "/" ? undefined : slot.route}
          />
        ))}

        <MoreSheet
          {...moreSheet}
          visibleRoutes={visibleRoutes}
          barRoutes={barRoutes}
          badges={badges}
        />
      </div>
    </nav>
  );
}
