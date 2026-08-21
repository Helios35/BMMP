import { Suspense, type ReactNode } from "react";

import type { AppRoute } from "@/domain/access/routes";
import type { RoleCode } from "@/domain/taxonomy/role";

import type { AlertBellProps } from "./chrome/alert-bell";
import { MockDataBanner } from "./chrome/mock-data-banner";
import type { OrganizationSwitcherProps } from "./chrome/organization-switcher";
import { RouteAnnouncer } from "./chrome/route-announcer";
import { RouteDenialToast } from "./chrome/route-denial-toast";
import { TopBar } from "./chrome/top-bar";
import type { UserMenuProps } from "./chrome/user-menu";
import { CommandPalette } from "./command-palette/command-palette";
import { CommandPaletteProvider } from "./command-palette/command-palette-provider";
import type { CommandPaletteProps } from "./command-palette/command-palette";
import { DesktopSidebar } from "./navigation/desktop-sidebar";
import { MobileTabBar } from "./navigation/mobile-tab-bar";
import type { NavBadges } from "./navigation/nav-items";

/**
 * The frame every authenticated route renders inside — `SITE_ARCHITECTURE.md`
 * §2.
 *
 * A server component. It places the navigation, the global chrome and the
 * children, and reads nothing: `src/app/(app)/layout.tsx` resolves the session
 * once and hands this everything it needs, already derived. **No component below
 * this line sees a `RequestContext`, a capability or the access map** (§5.3(3)).
 *
 * Landmarks, one each: the sidebar's `<nav aria-label="Primary">`, the tab bar's
 * (only one of the two is in the accessibility tree at a time), `<header>` in
 * `TopBar`, and `<main id="main-content">` here.
 *
 * The slot above `TopBar` is left for `OfflineBanner` (`UX_SPEC.md` §2.10),
 * which belongs to the unit that first needs it. Nothing renders there yet.
 */

export interface AppShellProps {
  readonly children: ReactNode;
  readonly role: RoleCode;
  /** `readableRoutesFor(role)` — the navigation's only source of what exists for this role. */
  readonly visibleRoutes: readonly AppRoute[];
  /** The routes this role holds `write` on, for the mobile bar's action slot. */
  readonly writableRoutes: readonly AppRoute[];
  readonly badges: NavBadges;
  /** From the `bmmp_nav_collapsed` cookie, so the first paint is the right width. */
  readonly defaultCollapsed: boolean;
  readonly organizationSwitcher: Omit<OrganizationSwitcherProps, "variant">;
  readonly alertBell: AlertBellProps;
  readonly userMenu: UserMenuProps;
  readonly commandPalette: CommandPaletteProps;
}

export function AppShell({
  children,
  role,
  visibleRoutes,
  writableRoutes,
  badges,
  defaultCollapsed,
  organizationSwitcher,
  alertBell,
  userMenu,
  commandPalette,
}: AppShellProps) {
  return (
    <CommandPaletteProvider>
      {/* The first focusable element on every (app) route (UX_SPEC.md §6.6). */}
      <a
        href="#main-content"
        className="sr-only rounded-md focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:bg-background focus:px-4 focus:py-3 focus:text-body focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to content
      </a>

      <MockDataBanner />

      <div className="flex min-h-dvh">
        <DesktopSidebar
          visibleRoutes={visibleRoutes}
          badges={badges}
          defaultCollapsed={defaultCollapsed}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            organizationSwitcher={organizationSwitcher}
            alertBell={alertBell}
            userMenu={userMenu}
          />

          <main
            id="main-content"
            tabIndex={-1}
            // The fixed tab bar is 64px plus the safe-area inset; the last row of
            // a list must never sit under it.
            className="flex-1 px-4 pt-6 pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] md:px-6 md:pb-8 lg:px-8"
          >
            {/* Content caps at 1280 from lg; below that it uses the full width,
                which is §2.3's tablet rule. */}
            <div className="mx-auto w-full lg:max-w-[1280px]">{children}</div>
          </main>
        </div>
      </div>

      <MobileTabBar
        role={role}
        visibleRoutes={visibleRoutes}
        writableRoutes={writableRoutes}
        badges={badges}
        moreSheet={{
          organizationSwitcher,
          displayName: userMenu.displayName,
          email: userMenu.email,
          roleInOrganization: userMenu.roleInOrganization,
          signOut: userMenu.signOut,
        }}
      />

      <CommandPalette {...commandPalette} />

      {/* `ShellToaster` is mounted once in `src/app/layout.tsx`, above both route
          groups, so a sign-in failure and a denial on `/` reach the same
          toaster. Two `Toaster`s would mean two portals and a toast that can
          fire into the hidden one. */}

      {/* `useSearchParams` needs a boundary; the toast has nothing to show while
          it waits, so the fallback is deliberately empty. */}
      <Suspense fallback={null}>
        <RouteDenialToast role={role} />
      </Suspense>

      <RouteAnnouncer />
    </CommandPaletteProvider>
  );
}
