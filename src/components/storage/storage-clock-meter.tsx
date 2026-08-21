import Link from "next/link";
import type { ReactElement } from "react";
import { CircleOff, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status/status-badge";
import {
  statusIntent,
  type StatusIntent,
} from "@/components/status/status-intent";
import {
  INTENT_SURFACE_CLASSES,
  INTENT_TEXT_CLASSES,
} from "@/components/status/intent-classes";
import { STORAGE_CLOCK_ALERT_BAND_LABELS } from "@/domain/taxonomy/storage-clock-alert-band";
import { storageClockDisplay } from "@/domain/storage/clock-display";
import { cn } from "@/lib/utils";
import type { IsoTimestamp } from "@/types/common";
import type { StorageClock } from "@/types/storage";

/**
 * `StorageClockMeter` — `UX_SPEC.md` §2.4.
 *
 * **There is no pause, hold, freeze, suspend, extend, snooze, re-date or
 * correct-start-date control on this component, for any role including P6**
 * (Rules 4.6, 4.9–4.12, 4.15). They are not disabled — they do not exist, and
 * their absence is the enforcement: a container in dispute, under inspection or
 * waiting on a carrier keeps counting. A unit test asserts the rendered output
 * contains zero `<button>` elements.
 *
 * **It takes a clock and an instant and nothing else.** No fetching, no route
 * knowledge, no container knowledge, no href, no navigation — so unit 04 renders
 * it on `/containers` rows and on `/containers/[id]` by passing that container's
 * clock and changing nothing here.
 *
 * **No threshold, period or deadline is a literal anywhere in this file**
 * (Rule 1.23). `maxDurationDays` and `dueAt` were stamped from the resolved rule
 * version when the clock started; the meter renders whatever number the rule
 * supplied and assumes nothing about it. "The one-year clock" is colloquial and
 * the system never assumes one year (Rules 4.5, 4.13).
 *
 * **The stored status decides the state; the dates supply the figure.** The
 * alert job is what moves `storage_clock.status`, and a screen that re-derived
 * overdue would disagree with the alert record printed beside it
 * (`SITE_ARCHITECTURE.md` §7.6a).
 */

export type StorageClockMeterSize = "sm" | "md";

const BAR_HEIGHT: Readonly<Record<StorageClockMeterSize, string>> = {
  sm: "h-2",
  md: "h-3",
};

/**
 * The indicator fill, coloured from outside the generated primitive.
 *
 * `src/components/ui/progress.tsx` is generated and is never hand-edited
 * (`UX_SPEC.md` §1.1), so the fill is reached with a descendant selector on the
 * root instead. **The colours are still the one intent vocabulary** — these are
 * `INTENT_BORDER_CLASSES` scoped to the indicator, written out in full because
 * Tailwind reads source text and never sees a class assembled at runtime.
 */
const INTENT_INDICATOR_CLASSES: Readonly<Record<StatusIntent, string>> = {
  neutral: "[&_[data-slot=progress-indicator]]:bg-intent-neutral-border",
  ok: "[&_[data-slot=progress-indicator]]:bg-intent-ok-border",
  attention: "[&_[data-slot=progress-indicator]]:bg-intent-attention-border",
  critical: "[&_[data-slot=progress-indicator]]:bg-intent-critical-border",
  pending: "[&_[data-slot=progress-indicator]]:bg-intent-pending-border",
};

export interface StorageClockMeterProps {
  readonly clock: StorageClock;
  /**
   * The accessible name — *"Storage clock for container C-14"*. Required: a bare
   * progressbar is meaningless to a screen reader.
   */
  readonly label: string;
  /**
   * When the elapsed and remaining figures were computed. Server-supplied, so
   * two regions of one page never disagree by a few milliseconds and a test can
   * pin it.
   */
  readonly asOf: IsoTimestamp;
  /** `sm` for a list row, `md` for a detail panel. */
  readonly size?: StorageClockMeterSize;
  readonly className?: string;
}

export function StorageClockMeter({
  clock,
  label,
  asOf,
  size = "md",
  className,
}: StorageClockMeterProps): ReactElement {
  // The zone is the copy taken from the container when the clock started, so a
  // later edit to the site cannot move a running clock. Never the browser's zone
  // and never the organization's (Rule 4.29).
  const timeZone = clock.timeZone;
  const display = storageClockDisplay(
    clock.clockStartAt,
    clock.dueAt,
    clock.maxDurationDays,
    asOf,
    timeZone,
  );

  const isOverdue = clock.status === "overdue";
  const intent: StatusIntent =
    statusIntent("storage_clock_status", clock.status) ?? "neutral";

  // Overdue is a hard state, not a warning: the bar is full, full stop.
  const percent = isOverdue ? 100 : display.percent;

  // The stored status has not caught up with the calendar yet. Render what the
  // system recorded, never a negative "remaining" and never a reassuring number.
  const clockLag = !isOverdue && display.isPastDueByDate;

  // The band labels carry no number — the configured offset is rendered
  // alongside them and never read out of the stored value (`TAXONOMY.md` §5.4),
  // and in this unit no offset is rendered at all.
  const bandLabel = STORAGE_CLOCK_ALERT_BAND_LABELS[clock.alertBand];

  const elapsedText = `${display.elapsedDays} ${dayWord(display.elapsedDays)} elapsed`;
  const headlineText = isOverdue
    ? `${display.overrunDays} ${dayWord(display.overrunDays)} past the limit`
    : `${display.remainingDays} ${dayWord(display.remainingDays)} remaining`;

  return (
    <div
      data-meter-state="default"
      data-intent={intent}
      data-clock-status={clock.status}
      data-clock-lag={clockLag ? "true" : undefined}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      {/* Above the bar: both figures, always as text. The bar alone is never the
          information (§2.4). */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span data-meter-elapsed="true" className="tabular text-body-strong">
          {elapsedText}
        </span>
        <span data-meter-headline="true" className="tabular text-body-strong">
          <span className={INTENT_TEXT_CLASSES[intent]}>{headlineText}</span>
        </span>
      </div>

      {/*
        The generated `Progress` consumes `value` to compute its own transform
        and does not forward it to the Radix root, so the root reports itself as
        indeterminate. The primitive is generated and is never hand-edited
        (`UX_SPEC.md` §1.1), so the meter states its own ARIA from outside —
        and `aria-valuetext` is the better announcement anyway: a screen reader
        hears the same sentence a sighted reader sees, not a bare number.
      */}
      <Progress
        value={percent}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={headlineText}
        className={cn(
          BAR_HEIGHT[size],
          "rounded-md bg-muted",
          INTENT_INDICATOR_CLASSES[intent],
        )}
      />

      {/* Below the bar: the accumulation start date with its zone, and the tier.
          The badge carries icon + text + colour, so colour is never the only
          signal (§1.2 Rule 4). */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="tabular text-caption text-muted-foreground">
          {`Accumulation started ${display.startDateInZone} · ${timeZone}`}
        </span>
        <StatusBadge
          system="storage_clock_status"
          value={clock.status}
          size={size === "sm" ? "sm" : "md"}
        />
      </div>

      {clock.alertBand !== "none" ? (
        <p
          data-meter-band="true"
          className="text-caption text-muted-foreground"
        >
          {bandLabel}
        </p>
      ) : null}

      {isOverdue ? (
        // The only two ways out, as static text. Neither is a control here — the
        // meter states them, the container's own screen offers them
        // (Rules 4.16, 4.17).
        <p data-meter-overdue-note="true" className="max-w-[72ch] text-caption">
          <span className={INTENT_TEXT_CLASSES.critical}>
            This container accepts no new items. Its contents leave by shipment,
            or by a remediation recorded by a Facility Manager.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** Plural agreement only. The number comes from the rule, never from here. */
function dayWord(count: number): string {
  return count === 1 ? "day" : "days";
}

/**
 * Empty — nothing is being stored, so no clock is running.
 *
 * §2.4. `neutral`: an empty container is not a problem, and it is the one state
 * where a bar would be honest but useless.
 */
export function StorageClockMeterEmpty({
  message = "No clock running — this container is empty",
  className,
}: {
  readonly message?: string;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      role="status"
      data-meter-state="empty"
      className={cn(
        "flex items-center gap-2 rounded-lg border p-3",
        INTENT_SURFACE_CLASSES.neutral,
        className,
      )}
    >
      <CircleOff aria-hidden="true" className="size-4 shrink-0" />
      <span className="text-body">{message}</span>
    </div>
  );
}

/**
 * Error — the clock could not be read.
 *
 * **Never an empty bar.** An empty bar reads as "nothing to worry about", which
 * is the most dangerous misread available in this product (§2.4).
 */
export function StorageClockMeterError({
  message = "Storage clock unavailable",
  correlationId,
  retryHref,
  className,
}: {
  readonly message?: string;
  /** Shown on any 5xx so support can find the trace (`TECHNICAL_SPEC.md` §10.3). */
  readonly correlationId?: string;
  readonly retryHref: string;
  readonly className?: string;
}): ReactElement {
  return (
    <Alert
      role="alert"
      data-meter-state="error"
      className={cn(
        "gap-2 border",
        INTENT_SURFACE_CLASSES.attention,
        className,
      )}
    >
      <TriangleAlert aria-hidden="true" />
      <AlertTitle className="text-body-strong">{message}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2 text-current">
        <span className="text-body">
          Nothing has changed. The elapsed and remaining figures are not being
          shown because they could not be read, not because there is nothing to
          show.
        </span>
        {correlationId !== undefined ? (
          <span data-correlation-id="true" className="text-mono">
            {correlationId}
          </span>
        ) : null}
        <Button
          asChild
          variant="outline"
          size="lg"
          className="min-h-11 rounded-md"
        >
          <Link href={retryHref}>Retry</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** Loading — the meter's exact height, so nothing moves when the figures land. */
export function StorageClockMeterSkeleton({
  size = "md",
  className,
}: {
  readonly size?: StorageClockMeterSize;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      data-meter-state="loading"
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <div className="flex items-baseline justify-between gap-4">
        <Skeleton className="h-6 w-32 rounded-md" />
        <Skeleton className="h-6 w-32 rounded-md" />
      </div>
      <Skeleton className={cn("w-full rounded-md", BAR_HEIGHT[size])} />
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-48 rounded-md" />
        <Skeleton
          className={cn("rounded-md", size === "sm" ? "h-6 w-24" : "h-7 w-28")}
        />
      </div>
    </div>
  );
}
