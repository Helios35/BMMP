"use client";

import { CircleUser, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The user menu — `SITE_ARCHITECTURE.md` §2.4.
 *
 * **Exactly three things: identity, the active role, and Sign out.** No theme
 * toggle, no preferences, no "platform session" indicator. None of the three is
 * specified anywhere, and a control nobody specified is a decision made in a
 * component. (Rule 1.18's platform-action marking lives in the audit log, not
 * here.)
 *
 * The role is `ROLE_LABELS[ctx.role]`, resolved server-side and passed in.
 * **Never a persona ID** — rendering "P1" is a T-37 review rejection.
 *
 * **Sign out is a `<form action={signOut}>` POST, never a `<Link>`.** A GET
 * sign-out is prefetched by the router the moment the menu opens, which signs
 * the user out by hovering.
 *
 * shadcn `avatar` is deliberately not installed: it is not on `UX_SPEC.md`
 * §1.7's allow-list and `user.avatarUrl` has no uploader in B1a.
 */

export interface UserMenuProps {
  /** `fullName ?? email` — resolved server-side so this component makes no choice. */
  readonly displayName: string;
  readonly email: string;
  /** "Facility Manager at Cascade Battery Recovery". */
  readonly roleInOrganization: string;
  readonly signOut: () => Promise<void>;
}

export function UserMenu({
  displayName,
  email,
  roleInOrganization,
  signOut,
}: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="size-11"
          aria-label={`Account — ${displayName}`}
        >
          <CircleUser aria-hidden="true" className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="flex flex-col gap-1 px-2 py-2">
          <p className="truncate text-body-strong">{displayName}</p>
          {/* Metadata, which is what muted is permitted for (UX_SPEC.md §1.2 Rule 3). */}
          <p className="truncate text-caption text-muted-foreground">{email}</p>
          <p className="pt-1 text-caption">{roleInOrganization}</p>
        </div>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem
            asChild
            onSelect={(event) => event.preventDefault()}
            className="p-0 focus:bg-transparent"
          >
            <button
              type="submit"
              data-sign-out
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            >
              <LogOut aria-hidden="true" className="size-4 shrink-0" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
