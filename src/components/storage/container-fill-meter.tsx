import Link from "next/link";
import type { ReactElement } from "react";
import { CircleOff, TriangleAlert } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatusIntent } from "@/components/status/status-intent";
import {
  INTENT_SURFACE_CLASSES,
  INTENT_TEXT_CLASSES,
} from "@/components/status/intent-classes";
import { compareDecimal, divideDecimal, multiplyDecimal } from "@/domain/units";
import { cn } from "@/lib/utils";
import type { Decimal } from "@/types/common";

/**
 * `ContainerFillMeter` — `UX_SPEC.md` §2.5; Rules 4.25, 4.26; E-7.
 *
 * Fill against the container's recorded capacity, and — **only where the
 * site's jurisdiction and fire-code profile supplies one** — against the
 * applicable quantity limit.
 *
 * **No number and no unit is a literal in this component** (`_ANCHORS.md`
 * §7.4). The reading's unit is the one its column is stored in, passed by the
 * caller; the limit's value, unit and source arrive together from rule data,
 * and the component renders exactly what it is given. Some jurisdictions
 * measure by volume and some by energy, so a limit carries its own reading in
 * its own unit and is never compared against the mass beside it.
 *
 * **No limit configured is a real state, stated plainly** — *"No quantity
 * limit set for this jurisdiction."* A wrong limit is worse than an absent
 * one, so there is never a default number (E-7).
 *
 * **Over the limit warns and blocks nothing in B1a** (Rule 4.26). The
 * monitoring, alerting and evidence behaviour is `[B1b]` §9, and nothing here
 * builds it early: the warning is this meter's own text, not an alert.
 *
 * Like `StorageClockMeter`, it takes values and nothing else — no fetching, no
 * route knowledge — so a list row and a detail header render the same thing.
 */

export type ContainerFillMeterSize = "sm" | "md";

export interface ContainerFillReading {
  /** What the container holds now, in `unit`. Null when nothing has been recorded. */
  readonly current: Decimal | null;
  /** The recorded capacity, in `unit`. Null when none was recorded. */
  readonly capacity: Decimal | null;
  /** The unit both figures are stored in — the column's own. */
  readonly unit: string;
}

/**
 * A quantity limit, **exactly as the rule supplies it** (Rule 1.23).
 *
 * `reading` is the container's quantity in the limit's own measure and unit,
 * computed by whatever evaluated the rule; the meter compares the two and
 * nothing else.
 */
export interface ContainerQuantityLimit {
  readonly value: Decimal;
  readonly unit: string;
  readonly reading: Decimal;
  /** Where the limit comes from — *"per your site's jurisdiction and fire-code profile"*. */
  readonly source: string;
}

export interface ContainerFillMeterProps {
  readonly reading: ContainerFillReading;
  /** Null when the jurisdiction supplies no limit — rendered as that, never defaulted. */
  readonly limit: ContainerQuantityLimit | null;
  /** The accessible name — *"Fill for container C-0001"*. */
  readonly label: string;
  /** `/settings/organization`, for a role that can reach it; null otherwise. */
  readonly settingsHref?: string | null;
  readonly size?: ContainerFillMeterSize;
  readonly className?: string;
}

const BAR_HEIGHT: Readonly<Record<ContainerFillMeterSize, string>> = {
  sm: "h-2",
  md: "h-3",
};

/** The indicator fill, reached from outside the generated primitive (§1.1). */
const INTENT_INDICATOR_CLASSES: Readonly<Record<StatusIntent, string>> = {
  neutral: "[&_[data-slot=progress-indicator]]:bg-intent-neutral-border",
  ok: "[&_[data-slot=progress-indicator]]:bg-intent-ok-border",
  attention: "[&_[data-slot=progress-indicator]]:bg-intent-attention-border",
  critical: "[&_[data-slot=progress-indicator]]:bg-intent-critical-border",
  pending: "[&_[data-slot=progress-indicator]]:bg-intent-pending-border",
};

export const NO_LIMIT_CAPTION = "No quantity limit set for this jurisdiction.";

/** A stored decimal as a person reads it — trailing zeros dropped, digits unchanged. */
export function decimalText(value: Decimal): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** Whole percent of `part` in `whole`, truncated, clamped to 0–100. */
function percentOf(part: Decimal, whole: Decimal): number {
  if (compareDecimal(whole, "0") <= 0) return 0;
  const percent = Number(divideDecimal(multiplyDecimal(part, "100"), whole, 0));
  return Math.min(100, Math.max(0, percent));
}

export function ContainerFillMeter({
  reading,
  limit,
  label,
  settingsHref = null,
  size = "md",
  className,
}: ContainerFillMeterProps): ReactElement {
  const held = reading.current;
  const isEmpty = held === null || compareDecimal(held, "0") <= 0;
  const isOverLimit =
    limit !== null && compareDecimal(limit.reading, limit.value) > 0;
  const intent: StatusIntent = isOverLimit
    ? "attention"
    : reading.capacity === null
      ? "neutral"
      : "ok";

  const percent =
    held === null || reading.capacity === null
      ? 0
      : percentOf(held, reading.capacity);

  const heldText = isEmpty ? "Empty" : `${decimalText(held)} ${reading.unit}`;
  const headline =
    reading.capacity === null
      ? `${heldText} · no capacity recorded`
      : isEmpty
        ? `Empty · capacity ${decimalText(reading.capacity)} ${reading.unit}`
        : `${decimalText(held)} of ${decimalText(reading.capacity)} ${reading.unit}`;

  return (
    <div
      data-fill-meter-state={isOverLimit ? "over-limit" : "default"}
      data-intent={intent}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <span data-fill-headline="true" className="tabular text-body-strong">
        {headline}
      </span>

      <Progress
        value={percent}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={headline}
        className={cn(
          BAR_HEIGHT[size],
          "rounded-md bg-muted",
          INTENT_INDICATOR_CLASSES[intent],
        )}
      />

      {limit === null ? (
        <p
          data-fill-no-limit="true"
          className="flex items-center gap-2 text-caption text-muted-foreground"
        >
          <CircleOff aria-hidden="true" className="size-4 shrink-0" />
          {NO_LIMIT_CAPTION}
        </p>
      ) : isOverLimit ? (
        <div
          role="status"
          data-fill-over-limit="true"
          className={cn(
            "flex flex-col gap-1 rounded-lg border p-3",
            INTENT_SURFACE_CLASSES.attention,
          )}
        >
          <span className="flex items-start gap-2 text-body-strong">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
            {`${decimalText(limit.reading)} ${limit.unit} — over the ${decimalText(limit.value)} ${limit.unit} limit for this site.`}
          </span>
          <span className="text-caption">
            {`The limit is ${limit.source}. Nothing is blocked.`}
          </span>
          {settingsHref === null ? null : (
            <Link
              href={settingsHref}
              className="min-h-11 content-center text-label underline underline-offset-4"
            >
              Review the site profile
            </Link>
          )}
        </div>
      ) : (
        <p
          data-fill-limit="true"
          className={cn("text-caption", INTENT_TEXT_CLASSES.neutral)}
        >
          {`${decimalText(limit.reading)} of the ${decimalText(limit.value)} ${limit.unit} limit, ${limit.source}.`}
        </p>
      )}
    </div>
  );
}

/** Loading — the meter's exact height. */
export function ContainerFillMeterSkeleton({
  size = "md",
  className,
}: {
  readonly size?: ContainerFillMeterSize;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      data-fill-meter-state="loading"
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <Skeleton className="h-6 w-40 rounded-md" />
      <Skeleton className={cn("w-full rounded-md", BAR_HEIGHT[size])} />
      <Skeleton className="h-5 w-56 rounded-md" />
    </div>
  );
}
