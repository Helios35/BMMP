"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One navigation destination — `SITE_ARCHITECTURE.md` §2.1.
 *
 * **The current-route highlight is a filled background plus a 3px bar, never
 * colour alone** (§2.1, `UX_SPEC.md` §1.2 Rule 4), and it carries
 * `aria-current="page"` so it is announced rather than merely seen.
 *
 * Client, because it needs `usePathname()`. It decides nothing about access:
 * the caller has already intersected the presentation list with the routes this
 * role can reach (§5.3(3)).
 */

export type NavLinkVariant = "sidebar" | "rail" | "sheet";

export interface NavLinkProps {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** A count, where §2.1 gives the item one. Absent is not zero. */
  readonly badge?: number;
  /** The word the count counts, for the screen reader — "7 open items". */
  readonly badgeUnit?: string;
  readonly variant: NavLinkVariant;
  /** Matched against the pathname so `/batteries/abc` highlights **Batteries**. */
  readonly matchPrefix?: string;
  readonly onNavigate?: () => void;
}

export function isNavLinkActive(
  pathname: string,
  href: string,
  matchPrefix: string | undefined,
): boolean {
  if (pathname === href) return true;
  // `/` would otherwise prefix-match every route in the product.
  if (matchPrefix === undefined || matchPrefix === "/") return false;
  return pathname === matchPrefix || pathname.startsWith(`${matchPrefix}/`);
}

export function NavLink({
  href,
  label,
  icon: Icon,
  badge,
  badgeUnit = "items",
  variant,
  matchPrefix,
  onNavigate,
}: NavLinkProps) {
  const pathname = usePathname();
  const isActive = isNavLinkActive(pathname, href, matchPrefix);
  const badgeText = badge === undefined ? null : `${badge} ${badgeUnit}`;

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive ? "true" : "false"}
      aria-label={variant === "rail" ? label : undefined}
      className={cn(
        // 44px minimum target, everywhere, including desktop (UX_SPEC.md §1.5).
        "relative flex min-h-11 items-center gap-3 rounded-md text-label transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        variant === "rail"
          ? "w-11 justify-center px-0"
          : "w-full px-3 has-[[data-nav-badge]]:pr-2",
        variant === "sheet" && "min-h-14",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60",
      )}
    >
      {/* The 3px bar. Redundant with the fill and the aria-current on purpose:
          colour is never the only signal (UX_SPEC.md §1.2 Rule 4). */}
      <span
        aria-hidden="true"
        data-nav-bar
        className={cn(
          "absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-md",
          isActive ? "bg-sidebar-primary" : "bg-transparent",
        )}
      />
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      {variant === "rail" ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{label}</span>
      )}
      {badgeText !== null && variant !== "rail" ? (
        <Badge
          data-nav-badge
          variant="secondary"
          className="h-6 min-w-6 px-2 text-caption tabular-nums"
        >
          <span aria-hidden="true">{badge}</span>
          <span className="sr-only">{badgeText}</span>
        </Badge>
      ) : null}
    </Link>
  );

  if (variant !== "rail") return link;

  // Rail mode is icon-only, so the label has to reach a keyboard user too —
  // hover is never the only way to reveal information (UX_SPEC.md §1.5).
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="text-caption">
          {badgeText === null ? label : `${label} — ${badgeText}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
