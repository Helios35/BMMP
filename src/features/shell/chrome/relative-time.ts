import type { IsoTimestamp } from "@/types/common";

/**
 * "3 hours ago", from two instants.
 *
 * **`asOf` is an argument, never the clock.** Both instants arrive from the
 * server render, so the caption a client renders after hydration is the caption
 * the server produced — a value computed from `Date.now()` on both sides
 * disagrees across the boundary and React reports it as a hydration mismatch.
 *
 * This is a caption on an alert's raised-at time and nothing else. It is not
 * date arithmetic for a storage clock: those are computed in the **site's** time
 * zone (Rule 4.29) and belong to `StorageClockMeter`, not here.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeTimeLabel(
  instant: IsoTimestamp,
  asOf: IsoTimestamp,
): string {
  const elapsed = Date.parse(asOf) - Date.parse(instant);
  if (Number.isNaN(elapsed)) return "";

  const absolute = Math.abs(elapsed);
  const sign = elapsed >= 0 ? -1 : 1;

  if (absolute < MINUTE) {
    return RELATIVE.format(sign * Math.round(absolute / SECOND), "second");
  }
  if (absolute < HOUR) {
    return RELATIVE.format(sign * Math.round(absolute / MINUTE), "minute");
  }
  if (absolute < DAY) {
    return RELATIVE.format(sign * Math.round(absolute / HOUR), "hour");
  }
  return RELATIVE.format(sign * Math.round(absolute / DAY), "day");
}
