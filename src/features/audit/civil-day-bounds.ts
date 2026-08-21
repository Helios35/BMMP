import type { IsoTimestamp, TimeZone } from "@/types/common";

/**
 * The two instants a calendar date covers **in a stated zone**.
 *
 * `/audit`'s date range is two `<input type="date">` values, and a calendar date
 * is not an instant: `2026-06-12` in `America/Los_Angeles` starts seven or eight
 * hours after it starts in UTC, depending on the date. Rule 12.20 — every stored
 * timestamp carries a zone and every date-based decision is evaluated in the
 * governing local zone — so the range the reader typed has to be resolved
 * against the same zone the column beside it is rendered in, or the first and
 * last rows of a day fall outside their own filter.
 *
 * Pure: `Intl` performs no I/O and reads no environment, and the zone arrives as
 * an argument. **It decides nothing regulatory** — a range is a reader's
 * narrowing, never a deadline, and no period, threshold or interval is written
 * here (Rule 1.23).
 */

/** `YYYY-MM-DD`, which is what a `<input type="date">` submits. */
const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whether a URL value is a calendar date this module can resolve.
 *
 * A parameter that is not one is **dropped rather than rejected**: a stale or
 * hand-edited link opens the list instead of rendering an error page
 * (`SITE_ARCHITECTURE.md` §7.4 rule 2).
 */
export function isCivilDate(value: string | undefined): value is string {
  if (value === undefined) return false;
  if (!CIVIL_DATE_PATTERN.test(value)) return false;
  // `2026-02-30` matches the shape and is not a date. Round-tripping through
  // UTC is the cheapest way to find out, and it never touches a zone.
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

/**
 * How far `timeZone` is from UTC at a given instant, in milliseconds.
 *
 * Read from `Intl` rather than from a table, so a jurisdiction that moves its
 * daylight-saving boundary needs no code change — the same reason rules are data
 * (Rule 1.23) applies to zones.
 */
function zoneOffsetMs(instantMs: number, timeZone: TimeZone): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  // `hour12: false` renders midnight as hour 24 in some locales; 24 and 0 are
  // the same instant on the day the other parts already name.
  const asUtcMs = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second"),
  );

  return asUtcMs - instantMs;
}

/**
 * The instant a calendar date begins in `timeZone`.
 *
 * Two passes, because the offset that converts the guess is the offset at the
 * *guess*, not at the answer — on a spring-forward morning those differ by an
 * hour. The second pass reads the offset at the candidate and is what makes the
 * boundary land on the right side of a daylight-saving change.
 */
export function startOfCivilDayInZone(
  civilDate: string,
  timeZone: TimeZone,
): IsoTimestamp {
  const utcMidnightMs = Date.parse(`${civilDate}T00:00:00.000Z`);
  const firstPass = utcMidnightMs - zoneOffsetMs(utcMidnightMs, timeZone);
  return new Date(
    utcMidnightMs - zoneOffsetMs(firstPass, timeZone),
  ).toISOString();
}

/**
 * The last instant a calendar date covers in `timeZone`.
 *
 * The end of a day is the start of the next one, one millisecond earlier — which
 * stays correct across a 23-hour or 25-hour day, where adding a fixed duration
 * to the start would not.
 *
 * The range is **inclusive of both endpoints**, because a reader who types the
 * same date twice means that day.
 */
export function endOfCivilDayInZone(
  civilDate: string,
  timeZone: TimeZone,
): IsoTimestamp {
  const nextCivilDate = new Date(
    Date.parse(`${civilDate}T00:00:00.000Z`) + MILLISECONDS_PER_DAY,
  )
    .toISOString()
    .slice(0, 10);

  const nextStartMs = Date.parse(
    startOfCivilDayInZone(nextCivilDate, timeZone),
  );
  return new Date(nextStartMs - 1).toISOString();
}
