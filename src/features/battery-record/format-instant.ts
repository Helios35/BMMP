import type { IsoDate, IsoTimestamp, TimeZone } from "@/types/common";

/**
 * Absolute dates and instants, always in a stated zone.
 *
 * **The zone is an argument and never the browser's.** Rule 4.29 fixes the
 * site's zone as the one a stored instant is read in, so the same record reads
 * the same date for a handler in the bay and an auditor three time zones away.
 * Every absolute timestamp renders the zone beside it, because a bare
 * `09:41` on a compliance record is a question, not a fact.
 *
 * `Intl` is the whole implementation. Nothing here parses, offsets or arithmetics
 * a date — `src/domain/storage/clock-display.ts` owns clock arithmetic, and a
 * second copy of it living in a feature folder is how two surfaces come to
 * disagree about what day it is.
 */

/** `Aug 12, 2026, 09:41 PDT`. */
export function absoluteInstant(
  instant: IsoTimestamp,
  timeZone: TimeZone,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(instant));
}

/**
 * The zone a record's instants are read in.
 *
 * A record placed in a container inherits that container's site zone. A record
 * with no placement has no site, and **UTC is stated rather than assumed** — the
 * zone label renders beside the value either way, so a reader is never left to
 * guess which calendar produced the date.
 */
export const UNPLACED_RECORD_TIME_ZONE: TimeZone = "UTC";

/**
 * `Nov 1, 2021` for a bare civil date.
 *
 * A `date` column carries no instant, so formatting it in a zone would shift it
 * by a day at the boundary. It is read as the calendar date it is.
 */
export function civilDateLabel(date: IsoDate): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(`${date}T00:00:00.000Z`));
}
