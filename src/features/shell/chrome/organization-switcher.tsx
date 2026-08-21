"use client";

import { useActionState, type ReactNode } from "react";
import { Building2, Check, ChevronsUpDown, CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

/**
 * The organisation switcher — `SITE_ARCHITECTURE.md` §2.4, E-16.
 *
 * **A user with exactly one membership gets no switcher at all.** Not a disabled
 * one, not a single-item menu — the organisation's *name* renders as static
 * text and nothing else. Knowing which tenant you are in is load-bearing in a
 * multi-tenant compliance tool; a control that switches to the place you already
 * are is not.
 *
 * With more than one membership the menu names **this user's role in each
 * organisation** beneath its name. Roles never combine and never leak
 * (Rules 1.4, 1.5, 1.22), and showing the role per row is what makes that
 * visible rather than merely true.
 *
 * **Each row is a form submit calling a Server Action**, never an optimistic
 * client-side state change: switching is an explicit, recorded act
 * (Rules 1.3, 1.5), it re-scopes every query on the next request, and it works
 * with JavaScript disabled.
 */

export interface OrganizationOption {
  readonly organizationId: string;
  readonly name: string;
  /** T-37, through `ROLE_LABELS`. Resolved server-side — never a persona ID. */
  readonly roleLabel: string;
}

export interface OrganizationSwitcherProps {
  readonly activeOrganizationId: string;
  /** `identity.memberships` — the in-force list, resolved on this request (Rule 1.28). */
  readonly organizations: readonly OrganizationOption[];
  readonly switchOrganization: (
    previous: ActionResult<never> | null,
    formData: FormData,
  ) => Promise<ActionResult<never>>;
  readonly variant: "top-bar" | "sheet";
}

function OrganizationRow({
  organization,
  isActive,
  isPending,
}: {
  readonly organization: OrganizationOption;
  readonly isActive: boolean;
  readonly isPending: boolean;
}) {
  return (
    <button
      type="submit"
      // In-flight only, so a second click cannot start a second switch. This is
      // not §2.9's disabled-with-a-reason case — no permission is being stated,
      // so there is no reason a keyboard user needs to reach and nothing is lost
      // by the control leaving the tab order for the moment it takes to redirect.
      disabled={isPending}
      data-organization-option={organization.organizationId}
      data-active={isActive ? "true" : "false"}
      className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      <Check
        aria-hidden="true"
        className={cn("size-4 shrink-0", isActive ? "" : "invisible")}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body-strong">{organization.name}</span>
        <span className="truncate text-caption text-muted-foreground">
          {organization.roleLabel}
        </span>
      </span>
      {isActive ? <span className="sr-only">Current organisation</span> : null}
    </button>
  );
}

export function OrganizationSwitcher({
  activeOrganizationId,
  organizations,
  switchOrganization,
  variant,
}: OrganizationSwitcherProps) {
  const [result, formAction, isPending] = useActionState<
    ActionResult<never> | null,
    FormData
  >(switchOrganization, null);

  const active = organizations.find(
    (organization) => organization.organizationId === activeOrganizationId,
  );
  const activeName = active?.name ?? "";

  // E-16. One membership is the only reachable state with the current fixtures,
  // and it is the state SITE_ARCHITECTURE.md §6 names explicitly.
  if (organizations.length <= 1) {
    return (
      <span
        data-organization-switcher="absent"
        className="flex min-h-11 items-center gap-2 px-2 text-body-strong"
      >
        <Building2 aria-hidden="true" className="size-5 shrink-0" />
        <span className="truncate">{activeName}</span>
      </span>
    );
  }

  const forms = organizations.map((organization) => {
    const isActive = organization.organizationId === activeOrganizationId;
    const row = (
      <OrganizationRow
        organization={organization}
        isActive={isActive}
        isPending={isPending}
      />
    );

    return (
      <form key={organization.organizationId} action={formAction}>
        <input
          type="hidden"
          name="organizationId"
          value={organization.organizationId}
        />
        {variant === "top-bar" ? (
          // `onSelect` is prevented so Radix does not close — and unmount — the
          // form before the submit reaches it.
          <DropdownMenuItem
            asChild
            onSelect={(event) => event.preventDefault()}
            className="p-0 focus:bg-transparent"
          >
            {row}
          </DropdownMenuItem>
        ) : (
          row
        )}
      </form>
    );
  });

  const failure: ReactNode =
    result !== null && !result.ok ? (
      <p
        role="alert"
        className={cn(
          "flex items-start gap-2 px-2 py-2 text-caption",
          INTENT_TEXT_CLASSES.critical,
        )}
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {result.error.message}
      </p>
    ) : null;

  if (variant === "sheet") {
    return (
      <div data-organization-switcher="sheet" className="flex flex-col gap-1">
        <p className="px-2 text-caption text-muted-foreground">Organisation</p>
        {forms}
        {failure}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          data-organization-switcher="menu"
          className="min-h-11 max-w-[16rem] justify-start gap-2 px-2 text-body-strong"
        >
          <Building2 aria-hidden="true" className="size-5 shrink-0" />
          <span className="truncate">{activeName}</span>
          <ChevronsUpDown
            aria-hidden="true"
            className="size-4 shrink-0 opacity-70"
          />
          <span className="sr-only">Switch organisation</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-caption text-muted-foreground">
          Organisation
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {forms}
        {failure}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
