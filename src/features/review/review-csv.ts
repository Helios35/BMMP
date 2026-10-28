import { absoluteInstant } from "@/features/battery-record/format-instant";
import type { TimeZone } from "@/types/common";

import type { UnidentifiedInventory } from "./server/inventory";

/**
 * `/review`'s P2 view as CSV — `UX_SPEC.md` §3.8b, "export the list for an
 * insurer or inspection file"; D-50; Rules 12.17–12.19.
 *
 * **One row per unidentified battery, grouped as the screen groups it** —
 * container, then site, oldest first within the container — with the
 * container's roll-up on every row so a filtered file still says how much of
 * each container is unidentified. Nothing here confirms, voids or scores
 * anything: the view is read-only (Rule 2.22) and no column is a probability
 * (Rule 1.25).
 */

export const REVIEW_CSV_HEADERS = [
  "Container",
  "Site",
  "Record ID",
  "In queue since",
  "Age in queue",
  "Time zone",
  "Storage clock tier",
  "Segregation class",
  "Unidentified in container",
  "Fields flagged",
] as const;

/** Printed where an item sits in no container — the screen's own group. */
const NO_CONTAINER = "No container";

export function reviewCsvRows(
  inventory: UnidentifiedInventory,
  timeZone: TimeZone,
): readonly (readonly string[])[] {
  return inventory.groups.flatMap((group) =>
    group.rows.map((row) => [
      group.container?.code ?? NO_CONTAINER,
      row.site,
      row.recordNumber,
      absoluteInstant(row.queuedSince, timeZone),
      row.ageLabel,
      timeZone,
      group.container?.clockTierLabel ?? "",
      group.container?.classLabel ?? "",
      group.container === null
        ? String(group.rows.length)
        : `${group.rows.length} of ${group.container.placedCount}`,
      String(row.flaggedFieldCount),
    ]),
  );
}
