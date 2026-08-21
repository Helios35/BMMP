"use client";

import Link from "next/link";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AppRoute } from "@/domain/access/routes";
import { cn } from "@/lib/utils";

import { navCollapseCookie } from "@/features/shell/nav-collapse";
import {
  NAV_GROUP_HEADINGS,
  NAV_GROUP_ORDER,
  navItemsInGroup,
  visibleNavItems,
  type NavBadges,
  type NavItem,
} from "./nav-items";
import { NavLink, type NavLinkVariant } from "./nav-link";

/**
 * The desktop and tablet navigation — `SITE_ARCHITECTURE.md` §2.1 and §2.3.
 *
 * | Width | Behaviour |
 * |---|---|
 * | `< md` | absent; the bottom tab bar is the navigation |
 * | `md` – `lg` | the 64px icon rail, tooltips on, **not user-collapsible** — there is nothing to collapse to (§2.3) |
 * | `≥ lg` | 240px, collapsible by the user to that same rail |
 *
 * **Exactly one of the two renderings is in the accessibility tree at a time.**
 * `display: none` removes an element from it, so the `hidden`/`md:flex`/
 * `lg:hidden` pairing below is what keeps a screen reader from hearing the
 * navigation twice.
 *
 * It renders `visibleRoutes` and decides nothing: the intersection with
 * `readableRoutesFor(role)` happened server-side, before this component existed
 * (§5.3(3)). **A nav item this role cannot reach never arrives here.**
 */

export interface DesktopSidebarProps {
  /** `readableRoutesFor(role)`, computed server-side. */
  readonly visibleRoutes: readonly AppRoute[];
  readonly badges: NavBadges;
  /** From the `bmmp_nav_collapsed` cookie, read on the server so the first paint is right. */
  readonly defaultCollapsed: boolean;
}

const BADGE_UNITS: Readonly<Record<string, string>> = {
  reviewOpenItems: "open items",
  alertingContainers: "alerting containers",
};

function NavGroups({
  items,
  badges,
  variant,
}: {
  readonly items: readonly NavItem[];
  readonly badges: NavBadges;
  readonly variant: NavLinkVariant;
}) {
  return (
    <>
      {NAV_GROUP_ORDER.map((group) => {
        const groupItems = navItemsInGroup(items, group);
        // The Settings group renders only where the role can reach at least one
        // child, and only the children it can reach (§2.1).
        if (groupItems.length === 0) return null;

        const heading = NAV_GROUP_HEADINGS[group];
        return (
          <div key={group} className="flex flex-col gap-1">
            {heading === null ? null : (
              <>
                <Separator className="my-2 bg-sidebar-border" />
                {variant === "rail" ? null : (
                  <p className="px-3 pb-1 text-caption text-muted-foreground">
                    {heading}
                  </p>
                )}
              </>
            )}
            {groupItems.map((item) => (
              <NavLink
                key={item.route}
                href={item.route}
                label={item.navLabel}
                icon={item.icon}
                variant={variant}
                {...(item.matchPrefix === undefined
                  ? {}
                  : { matchPrefix: item.matchPrefix })}
                {...(item.badge === undefined ||
                badges[item.route] === undefined
                  ? {}
                  : {
                      badge: badges[item.route],
                      badgeUnit: BADGE_UNITS[item.badge] ?? "items",
                    })}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

export function DesktopSidebar({
  visibleRoutes,
  badges,
  defaultCollapsed,
}: DesktopSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const items = visibleNavItems(visibleRoutes);

  function toggle() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    // The preference outlives the render, and the server reads it on the next
    // request so the sidebar never flashes at its old width.
    document.cookie = navCollapseCookie(next);
  }

  return (
    <aside
      data-nav-collapsed={isCollapsed ? "true" : "false"}
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:sticky md:top-0 md:flex md:h-dvh md:w-16",
        isCollapsed ? "lg:w-16" : "lg:w-60",
      )}
    >
      <div className="flex min-h-14 items-center px-2 md:min-h-16">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2 rounded-md px-2 text-body-strong text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className={cn(isCollapsed ? "lg:inline" : "lg:hidden")}
          >
            BM
          </span>
          <span className={cn("hidden", isCollapsed ? "" : "lg:inline")}>
            BMMP
          </span>
          <span className="sr-only">BMMP — go to the dashboard</span>
        </Link>
      </div>

      {/* The rail. Always the rendering between md and lg; also the rendering at
          lg and above when the user has collapsed the sidebar. */}
      <nav
        aria-label="Primary"
        data-nav-variant="rail"
        className={cn(
          "flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4",
          isCollapsed ? "md:flex" : "md:flex lg:hidden",
        )}
      >
        <NavGroups items={items} badges={badges} variant="rail" />
      </nav>

      {/* The 240px sidebar. Absent below lg and absent while collapsed. */}
      <nav
        aria-label="Primary"
        data-nav-variant="sidebar"
        className={cn(
          "hidden flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4",
          isCollapsed ? "" : "lg:flex",
        )}
      >
        <NavGroups items={items} badges={badges} variant="sidebar" />
      </nav>

      {/* No toggle below lg: the rail is the only rendering there, so there is
          nothing to collapse to (§2.3). */}
      <div className="hidden border-t border-sidebar-border p-2 lg:flex">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                onClick={toggle}
                aria-expanded={!isCollapsed}
                aria-label={
                  isCollapsed ? "Expand navigation" : "Collapse navigation"
                }
                className="size-11"
              >
                {isCollapsed ? (
                  <PanelLeftOpen aria-hidden="true" className="size-5" />
                ) : (
                  <PanelLeftClose aria-hidden="true" className="size-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-caption">
              {isCollapsed ? "Expand navigation" : "Collapse navigation"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </aside>
  );
}
