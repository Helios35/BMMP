"use client";

import { useState } from "react";
import { LogOut, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AppRoute } from "@/domain/access/routes";
import { cn } from "@/lib/utils";

import {
  OrganizationSwitcher,
  type OrganizationSwitcherProps,
} from "@/features/shell/chrome/organization-switcher";
import { visibleNavItems, type NavBadges } from "./nav-items";
import { NavLink } from "./nav-link";

/**
 * The **More** sheet — `SITE_ARCHITECTURE.md` §2.2, slot 5 of the mobile bar.
 *
 * Contents, in order: every route this role can reach that is not already on the
 * bar, the organisation switcher, the signed-in identity with the active role,
 * and Sign out.
 *
 * The switcher is the same component as the top bar's, rendered inline rather
 * than as a dropdown — and **absent entirely on a single membership** (E-16),
 * which that component decides, not this one.
 *
 * Escape closes and focus returns to the More tab; Radix does both and neither
 * is overridden (`UX_SPEC.md` §1.5, §6.6).
 */

export interface MoreSheetProps {
  /** `readableRoutesFor(role)`, computed server-side. */
  readonly visibleRoutes: readonly AppRoute[];
  /** The routes already on the bar — they are not repeated here. */
  readonly barRoutes: readonly AppRoute[];
  readonly badges: NavBadges;
  readonly organizationSwitcher: Omit<OrganizationSwitcherProps, "variant">;
  /** `fullName ?? email`, resolved server-side. */
  readonly displayName: string;
  readonly email: string;
  /** T-37 through `ROLE_LABELS`, with the organisation. **Never a persona ID.** */
  readonly roleInOrganization: string;
  readonly signOut: () => Promise<void>;
}

export function MoreSheet({
  visibleRoutes,
  barRoutes,
  badges,
  organizationSwitcher,
  displayName,
  email,
  roleInOrganization,
  signOut,
}: MoreSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const items = visibleNavItems(visibleRoutes).filter(
    (item) => !barRoutes.includes(item.route),
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          data-mobile-tab="more"
          className={cn(
            "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-md px-2 py-1",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
          )}
        >
          <Menu aria-hidden="true" className="size-6" />
          <span className="text-caption">More</span>
        </button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-lg pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="text-h2">More</SheetTitle>
          <SheetDescription className="sr-only">
            Everything else this role can reach, the organisation, and sign out.
          </SheetDescription>
        </SheetHeader>

        <nav
          aria-label="More destinations"
          className="flex flex-col gap-1 px-4 pb-2"
        >
          {items.map((item) => (
            <NavLink
              key={item.route}
              href={item.route}
              label={item.navLabel}
              icon={item.icon}
              variant="sheet"
              onNavigate={() => setIsOpen(false)}
              {...(item.matchPrefix === undefined
                ? {}
                : { matchPrefix: item.matchPrefix })}
              {...(item.badge === undefined || badges[item.route] === undefined
                ? {}
                : { badge: badges[item.route] })}
            />
          ))}
        </nav>

        <Separator className="my-2" />

        <div className="px-4 pb-2">
          <OrganizationSwitcher {...organizationSwitcher} variant="sheet" />
        </div>

        <Separator className="my-2" />

        <div className="flex flex-col gap-0.5 px-4 pb-3">
          <p className="truncate text-body-strong">{displayName}</p>
          {/* Metadata, which is what muted is permitted for (UX_SPEC.md §1.2 Rule 3). */}
          <p className="truncate text-caption text-muted-foreground">{email}</p>
          <p className="pt-1 text-caption">{roleInOrganization}</p>
        </div>

        {/* A POST, never a link: a GET sign-out is prefetched by the router. */}
        <form action={signOut} className="px-4 pb-6">
          <Button
            type="submit"
            variant="outline"
            size="lg"
            data-sign-out
            className="min-h-14 w-full justify-center gap-2"
          >
            <LogOut aria-hidden="true" className="size-4" />
            Sign out
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
