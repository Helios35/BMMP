"use client";

import Link from "next/link";
import { Bell, BellOff, CircleCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import type { StatusIntent } from "@/components/status/status-intent";
import { LeadingIcon } from "@/components/page/leading-icon";
import { cn } from "@/lib/utils";

import { INTENT_ICON } from "@/components/status/intent-icons";

/**
 * The alert bell — `SITE_ARCHITECTURE.md` §2.4.
 *
 * **An alert is a stored `alert` record, never view state computed on render**
 * (§7.6a). Every row here, every card in the dashboard region and the
 * `/containers?filter=alerting` deep link read the same rows, which is what
 * gives an alert a raised-at time, an addressable identity and an audit trail.
 *
 * **D-34 — alerts are in-product only in B1a.** No email, no push, no SMS. This
 * bell and the dashboard region *are* the delivery, so there is no notification
 * preference here, no "mark all read" and no delivery-channel toggle.
 * `alert.deliveredChannels` is read-only data and nothing renders from it.
 *
 * **T-48 constraint, live.** `alert.severity` is typed `string` and T-48 has no
 * module in `src/domain/taxonomy/`. The intent is resolved server-side through
 * `ALERT_SEVERITY_INTENTS[severity] ?? "neutral"` and an unrecognised severity
 * is **never guessed upward into `critical`** — inventing an urgency in a
 * compliance product is worse than showing none. `StatusBadge` cannot render a
 * severity (T-48 is not in `STATUS_SYSTEMS`), so the icon and the alert's own
 * title carry it.
 *
 * Nothing here expresses a probability of ignition (Rules 1.25, 10.3).
 */

export interface AlertBellItem {
  readonly id: string;
  /** Resolved server-side from `ALERT_SEVERITY_INTENTS`; `neutral` when unrecognised. */
  readonly intent: StatusIntent;
  readonly title: string;
  readonly body: string;
  /** T-44, through `ALERT_TYPE_LABELS`. */
  readonly typeLabel: string;
  readonly raisedAt: string;
  readonly raisedAtLabel: string;
  /**
   * The alert's target, or `null` where this role cannot reach it — the row then
   * renders informationally with **no link and no redirect** (§5.3(7),
   * Rule 1.26). A destination the guard would refuse is never offered.
   */
  readonly href: string | null;
}

export interface AlertBellProps {
  readonly items: readonly AlertBellItem[];
  /**
   * `Page.total`, not `items.length`. An alert whose severity this build does
   * not recognise is still counted (`TAXONOMY.md` §5.8).
   */
  readonly total: number;
  readonly state: "ready" | "error" | "loading";
  /** Where **Retry** points — the current path, so the read is simply attempted again. */
  readonly retryHref: string;
}

function countLabel(total: number): string {
  return total > 99 ? "99+" : String(total);
}

function AlertRow({ item }: { readonly item: AlertBellItem }) {
  const Icon = INTENT_ICON[item.intent];

  const content = (
    <>
      <LeadingIcon icon={Icon} className={INTENT_TEXT_CLASSES[item.intent]} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-body-strong text-balance">{item.title}</span>
        <span className="text-caption">{item.body}</span>
        <span className="text-caption text-muted-foreground">
          {item.typeLabel}
          {" · "}
          <time dateTime={item.raisedAt}>{item.raisedAtLabel}</time>
        </span>
      </span>
    </>
  );

  if (item.href === null) {
    return (
      <li
        data-alert-id={item.id}
        data-alert-linked="false"
        className="flex min-h-11 items-start gap-3 rounded-md px-2 py-2"
      >
        {content}
      </li>
    );
  }

  return (
    <li data-alert-id={item.id} data-alert-linked="true">
      <Link
        href={item.href}
        className="flex min-h-11 items-start gap-3 rounded-md px-2 py-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        {content}
      </Link>
    </li>
  );
}

export function AlertBell({ items, total, state, retryHref }: AlertBellProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="relative size-11"
          aria-label={
            state === "error"
              ? "Alerts — we could not load them"
              : `Alerts — ${total} open`
          }
        >
          <Bell aria-hidden="true" className="size-5" />
          {state === "ready" && total > 0 ? (
            <Badge
              // Never red: UX_SPEC.md §1.2 Rule 5 reserves `critical` and bars
              // it from a count badge outright.
              variant="secondary"
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 text-caption tabular-nums"
            >
              {countLabel(total)}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[calc(100vw-2rem)] p-2 sm:w-90">
        <h2 className="px-2 pb-2 text-h2">Alerts</h2>

        {state === "loading" ? (
          <div
            data-alert-bell-state="loading"
            className="flex flex-col gap-3 px-2 py-2"
          >
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : null}

        {state === "error" ? (
          // Never an empty popover on failure — an empty popover reads as "no
          // alerts", which is the one thing this must not imply.
          <div
            role="alert"
            data-alert-bell-state="error"
            className="flex flex-col gap-2 px-2 py-2"
          >
            <p
              className={cn(
                "flex items-start gap-2 text-body-strong",
                INTENT_TEXT_CLASSES.critical,
              )}
            >
              <LeadingIcon icon={BellOff} />
              We could not load your alerts.
            </p>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="min-h-11 self-start"
            >
              <Link href={retryHref}>Retry</Link>
            </Button>
          </div>
        ) : null}

        {state === "ready" && items.length === 0 ? (
          <p
            data-alert-bell-state="empty"
            className="flex items-center gap-2 px-2 py-2 text-body"
          >
            <CircleCheck
              aria-hidden="true"
              className={cn("size-5 shrink-0", INTENT_TEXT_CLASSES.ok)}
            />
            Nothing needs your attention right now.
          </p>
        ) : null}

        {state === "ready" && items.length > 0 ? (
          <ul data-alert-bell-state="ready" className="flex flex-col gap-1">
            {items.map((item) => (
              <AlertRow key={item.id} item={item} />
            ))}
          </ul>
        ) : null}

        <div className="mt-2 border-t border-border pt-2">
          <Button
            asChild
            variant="ghost"
            size="lg"
            className="min-h-11 w-full justify-start"
          >
            <Link href="/">View all</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
