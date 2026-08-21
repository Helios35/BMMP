import type { IsoTimestamp, TimeZone } from "@/types/common";

/**
 * The figures a storage clock renders — `UX_SPEC.md` §2.4.
 *
 * **This module evaluates no rule and invents no number.** `maxDurationDays` and
 * `dueAt` were stamped onto the `storage_clock` row from the resolved rule
 * version at the moment the clock started (Rule 4.5), so a later rule change
 * cannot move a running clock. Nothing here decides how long a period is; it
 * differences dates. **A period, threshold or deadline written as a literal in
 * this file is a review rejection** (Rule 1.23) — "the one-year clock" is
 * colloquial and the system never assumes one year (Rules 4.5, 4.13).
 *
 * **It decides no state either.** `storage_clock.status` is what the alert job
 * wrote and is the only thing that says a clock is overdue; a screen that
 * re-derives it will disagree with the alert record beside it
 * (`SITE_ARCHITECTURE.md` §7.6a). This module supplies the figure, never the
 * verdict.
 *
 * `Intl` is pure — no I/O, no environment read — so this satisfies the
 * `src/domain` rule. The zone arrives as an argument like every other input.
 */

/** Calendar arithmetic, not a regulatory period. */
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface StorageClockDisplay {
  /** Whole calendar days from the accumulation start to `asOf`, in `timeZone`. */
  readonly elapsedDays: number;
  /** Never negative. `0` once the due date has passed. */
  readonly remainingDays: number;
  /** `0` unless past due. */
  readonly overrunDays: number;
  /** 0–100, integer. */
  readonly percent: number;
  /** `YYYY-MM-DD`, the civil date in `timeZone`. */
  readonly startDateInZone: string;
  readonly dueDateInZone: string;
  readonly asOfDateInZone: string;
  /** True when the civil-date maths says the due date has passed. */
  readonly isPastDueByDate: boolean;
}

/**
 * `YYYY-MM-DD` for an instant, as the calendar in `timeZone` reads it.
 *
 * `en-CA` is chosen because it formats as ISO-ordered `YYYY-MM-DD`, which sorts
 * and differences without a second parse step. It is a formatting locale, never
 * a user-facing one.
 */
export function civilDateInZone(
  instant: IsoTimestamp,
  timeZone: TimeZone,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

/**
 * Whole days between two civil dates.
 *
 * **Calendar days in the site's zone, never elapsed milliseconds** (Rule 4.29).
 * Differencing the civil dates is what makes a daylight-saving boundary neither
 * create nor erase a day: 23-hour and 25-hour days are still one day each, and a
 * container is not overdue because a server is in a different zone.
 */
export function civilDaysBetween(from: string, to: string): number {
  return Math.round(
    (civilDateToUtcMs(to) - civilDateToUtcMs(from)) / MILLISECONDS_PER_DAY,
  );
}

function civilDateToUtcMs(civilDate: string): number {
  const [year, month, day] = civilDate.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

export function storageClockDisplay(
  clockStartAt: IsoTimestamp,
  dueAt: IsoTimestamp,
  maxDurationDays: number,
  asOf: IsoTimestamp,
  timeZone: TimeZone,
): StorageClockDisplay {
  const startDateInZone = civilDateInZone(clockStartAt, timeZone);
  const dueDateInZone = civilDateInZone(dueAt, timeZone);
  const asOfDateInZone = civilDateInZone(asOf, timeZone);

  const elapsed = civilDaysBetween(startDateInZone, asOfDateInZone);
  const untilDue = civilDaysBetween(asOfDateInZone, dueDateInZone);

  const elapsedDays = elapsed < 0 ? 0 : elapsed;
  // Never a negative "remaining" and never a reassuring number: a clock past its
  // due date has nothing remaining, and the overrun is stated separately.
  const remainingDays = untilDue < 0 ? 0 : untilDue;
  const overrunDays = untilDue < 0 ? -untilDue : 0;

  // A non-positive duration is a defect in the stored row rather than a state to
  // render a fraction of. It reads as full so the figure never understates.
  const percent =
    maxDurationDays > 0
      ? clampPercent(Math.round((elapsedDays / maxDurationDays) * 100))
      : elapsedDays > 0
        ? 100
        : 0;

  return {
    elapsedDays,
    remainingDays,
    overrunDays,
    percent,
    startDateInZone,
    dueDateInZone,
    asOfDateInZone,
    isPastDueByDate: untilDue < 0,
  };
}

function clampPercent(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}
