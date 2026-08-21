import Link from "next/link";
import { BellOff, CircleCheck, Pin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ALERT_SEVERITY_INTENTS,
  type StatusIntent,
} from "@/components/status/status-intent";
import { INTENT_ICON } from "@/components/status/intent-icons";
import {
  INTENT_BORDER_CLASSES,
  INTENT_TEXT_CLASSES,
} from "@/components/status/intent-classes";
import {
  ALERT_TYPE_LABELS,
  type AlertType,
} from "@/domain/taxonomy/alert-type";
import type { Alert } from "@/types/storage";

/**
 * `AlertCard` — `UX_SPEC.md` §2.11.
 *
 * **An alert is a stored record, not view state computed on render.** Every card
 * here, every entry behind the alert bell and the `/containers?filter=alerting`
 * deep link read the same `alert` rows. That is what gives an alert a raised-at
 * time, a target role, an addressable identity for a deep link, and an audit
 * trail when it is raised, re-tiered or resolved. **No screen derives an alert on
 * render**, or two screens will disagree about what is alerting
 * (`SITE_ARCHITECTURE.md` §7.6a).
 *
 * **Overdue-clock cards are pinned and cannot be dismissed by any role,
 * including P6** (Rules 4.15, 4.16; E-6).
 *
 * Nothing on this card ever expresses a probability of ignition. The body states
 * the condition and the required handling, never a chance of anything
 * (Rules 1.25, 10.3).
 */

/** Alert types that pin to the top and cannot be dismissed by anyone. */
const PINNED_ALERT_TYPES: readonly AlertType[] = ["storage_clock"];

export interface AlertCardAction {
  readonly label: string;
  /** A route. The card is a link, so it works with a keyboard and a middle click. */
  readonly href: string;
}

export interface AlertCardProps {
  readonly alert: Alert;
  /**
   * The one primary action, routed per `SITE_ARCHITECTURE.md` §3.4.
   *
   * Omit it when the role cannot take the action and pass {@link deniedNote}
   * instead. **No dead button.**
   */
  readonly action?: AlertCardAction;
  /**
   * Who can act, when this role cannot — *"Ask a Handler or Admin to build the
   * shipment."*
   *
   * §2.11 disabled state. The card still renders informationally: a silently
   * disabled control is a defect, not a safe default (Rule 1.26).
   */
  readonly deniedNote?: string;
  readonly className?: string;
}

export function AlertCard({
  alert,
  action,
  deniedNote,
  className,
}: AlertCardProps) {
  const intent: StatusIntent =
    ALERT_SEVERITY_INTENTS[alert.severity] ?? "neutral";
  const Icon = INTENT_ICON[intent];
  const isPinned =
    PINNED_ALERT_TYPES.includes(alert.alertType) && alert.resolvedAt === null;

  return (
    <Card
      data-alert-id={alert.id}
      data-alert-type={alert.alertType}
      data-intent={intent}
      data-pinned={isPinned ? "true" : "false"}
      className={cn("relative flex-row gap-0 overflow-hidden", className)}
    >
      {/* 4px intent bar. Colour is never the only signal — the icon and the
          title carry it too (UX_SPEC.md §1.2 Rule 4). */}
      <div
        aria-hidden="true"
        className={cn(
          "w-1 shrink-0 self-stretch",
          INTENT_BORDER_CLASSES[intent],
        )}
      />

      <CardContent className="flex flex-1 items-start gap-3 py-1">
        <Icon
          aria-hidden="true"
          className={cn("mt-0.5 size-5 shrink-0", INTENT_TEXT_CLASSES[intent])}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-base leading-snug font-semibold text-balance">
              {alert.title}
            </p>
            {isPinned ? (
              <span
                data-alert-pinned
                className="inline-flex items-center gap-1 text-[0.8125rem] text-muted-foreground"
              >
                <Pin aria-hidden="true" className="size-3.5" />
                Pinned
              </span>
            ) : null}
          </div>

          <p className="text-sm leading-relaxed">{alert.body}</p>

          <p className="text-[0.8125rem] text-muted-foreground">
            {ALERT_TYPE_LABELS[alert.alertType]}
          </p>

          {action !== undefined ? (
            <div className="pt-1">
              <Button asChild size="lg" className="min-h-11">
                <Link href={action.href}>{action.label}</Link>
              </Button>
            </div>
          ) : null}

          {action === undefined && deniedNote !== undefined ? (
            <p data-alert-denied className="pt-1 text-sm font-medium">
              {deniedNote}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** The loading state — three cards, per §2.11. */
export function AlertCardSkeleton({
  className,
}: {
  readonly className?: string;
}) {
  return (
    <Card
      data-alert-state="loading"
      className={cn("flex-row gap-0 overflow-hidden", className)}
    >
      <Skeleton className="w-1 shrink-0 self-stretch rounded-none" />
      <CardContent className="flex flex-1 flex-col gap-2 py-1">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-11 w-40" />
      </CardContent>
    </Card>
  );
}

/**
 * The empty state.
 *
 * *"Nothing needs your attention right now."* — **distinct per role**
 * (`UX_SPEC.md` §5, E-1), which is why the copy is a prop rather than a
 * constant: what P2 sees when there is nothing to do is not what P1 sees.
 */
export function AlertCardEmpty({
  message = "Nothing needs your attention right now.",
  className,
}: {
  readonly message?: string;
  readonly className?: string;
}) {
  return (
    <Card data-alert-state="empty" className={cn("gap-0", className)}>
      <CardContent className="flex items-center gap-3 py-2">
        <CircleCheck
          aria-hidden="true"
          className={cn("size-5 shrink-0", INTENT_TEXT_CLASSES.ok)}
        />
        <p className="text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}

/**
 * The error state — a single `critical` alert replacing the region, with Retry.
 *
 * A region-level state rather than a card-level one: when the alert region
 * cannot load, showing one honest failure beats showing nothing, and showing
 * nothing is indistinguishable from "you have no alerts", which is the one thing
 * this region must never imply.
 */
export function AlertRegionError({
  message = "We could not load your alerts. Nothing has changed — try again.",
  correlationId,
  retryHref,
  className,
}: {
  readonly message?: string;
  /** Shown on any 5xx so support can find the trace (`TECHNICAL_SPEC.md` §10.3). */
  readonly correlationId?: string;
  readonly retryHref: string;
  readonly className?: string;
}) {
  return (
    <Card
      role="alert"
      data-alert-state="error"
      className={cn("flex-row gap-0 overflow-hidden", className)}
    >
      <div
        aria-hidden="true"
        className={cn(
          "w-1 shrink-0 self-stretch",
          INTENT_BORDER_CLASSES.critical,
        )}
      />
      <CardContent className="flex flex-1 items-start gap-3 py-1">
        <BellOff
          aria-hidden="true"
          className={cn("mt-0.5 size-5 shrink-0", INTENT_TEXT_CLASSES.critical)}
        />
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-base leading-snug font-semibold">{message}</p>
          {correlationId !== undefined ? (
            <p className="font-mono text-[0.8125rem] text-muted-foreground">
              {correlationId}
            </p>
          ) : null}
          <div className="pt-1">
            <Button asChild variant="outline" size="lg" className="min-h-11">
              <Link href={retryHref}>Retry</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
