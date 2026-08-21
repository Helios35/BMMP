import type { IsoTimestamp, TimeZone } from "@/types/common";

/**
 * An audit timestamp, absolute, with its zone beside it — Rule 12.20.
 *
 * **Never relative** (`UX_SPEC.md` §3.20). "3 hours ago" is unusable as evidence:
 * it is read months later, printed, and compared against a shipping paper, and
 * by then it means nothing. The alert bell renders relative time because an alert
 * is about now; the audit log renders the instant because the log is about then.
 *
 * The zone is the **organization's** (`organization.time_zone`, the default for
 * every container at that org). Rendering in the reader's browser zone would make
 * two people reading the same row disagree about what day it happened on.
 */

export interface AuditTimestampDisplay {
  /** `YYYY-MM-DD HH:MM:SS`, in `timeZone`. Rendered with tabular numerals. */
  readonly value: string;
  /** The short zone name shown beside it — `PDT`, `UTC`. */
  readonly zone: string;
  /** Both parts, for a `title` and for an export cell. */
  readonly full: string;
}

export function formatAuditTimestamp(
  instant: IsoTimestamp,
  timeZone: TimeZone,
): AuditTimestampDisplay {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).formatToParts(new Date(instant));

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  // `hour12: false` renders midnight as 24 in some locales; the other parts
  // already name the right day, so only the hour needs correcting.
  const hour = String(Number(read("hour")) % 24).padStart(2, "0");
  const value = `${read("year")}-${read("month")}-${read("day")} ${hour}:${read("minute")}:${read("second")}`;
  const zone = read("timeZoneName");

  return { value, zone, full: `${value} ${zone}` };
}
