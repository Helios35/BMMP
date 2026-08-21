import type { CatalogEntry } from "@/types/catalog";
import type { Decimal, IsoTimestamp } from "@/types/common";

/**
 * How a catalog entry names itself, and how its stored values reach a reader.
 *
 * Pure string work, kept out of the components so `/catalog` and `/catalog/[id]`
 * cannot drift about what an entry is called or how a stored decimal is shown.
 */

/**
 * The absent-value word, used everywhere in this feature.
 *
 * **Never an em dash.** `StatusBadge` already says *"Not set"* for a status with
 * no value (`UX_SPEC.md` §2.3, §4.5); a reader meets one vocabulary for absence
 * rather than one per surface, and a dash teaches nobody anything.
 */
export const NOT_SET = "Not set";

/**
 * The entry's own name — manufacturer plus whichever identifier it carries.
 *
 * `modelName` and `partNumber` are both nullable on `catalog_entry`, so the
 * manufacturer is the only part guaranteed to be there. It is the `h1`, the
 * breadcrumb leaf and the browser tab, and it never renders as an empty string.
 */
export function catalogEntryTitle(entry: CatalogEntry): string {
  const identifier = entry.modelName ?? entry.partNumber;
  return identifier === null
    ? entry.manufacturerName
    : `${entry.manufacturerName} ${identifier}`;
}

/**
 * A stored `numeric` with its unit, **rendered exactly as stored**.
 *
 * No rounding, no trailing-zero trim, no locale grouping. The column's scale is
 * part of the record: `24.000 V` and `24 V` are the same number and not the same
 * claim about how precisely it was captured, and this product's output ends up
 * on a shipping paper. The unit is passed in by the caller because it belongs to
 * the column, and **it is never inferred from the number** (`UX_SPEC.md` §3.15).
 *
 * These are the product's own rated attributes off `catalog_entry`, not a
 * jurisdiction threshold — Rule 1.23 governs the latter and nothing here
 * supplies one.
 */
export function measurement(
  value: Decimal | null,
  unit: string,
): string | null {
  if (value === null) return null;
  return `${value} ${unit}`;
}

/**
 * An absolute timestamp as a reader's date, with the zone named beside it.
 *
 * A catalog entry is a platform record and belongs to no site, so there is no
 * site zone to render it in (Rule 4.29 governs the dates that do have one). UTC
 * is stated rather than assumed, because a date with no zone beside it is a date
 * two people read differently.
 */
export function catalogDateLabel(instant: IsoTimestamp): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(instant));
  return `${formatted} (UTC)`;
}

/**
 * The distinct manufacturers in a set of entries, in reading order.
 *
 * Sorted here rather than by the adapter: this is a list of names for a person
 * to pick from, and alphabetical is the only order that helps them.
 */
export function distinctManufacturers(
  entries: readonly CatalogEntry[],
): readonly string[] {
  return [...new Set(entries.map((entry) => entry.manufacturerName))].sort(
    (left, right) => left.localeCompare(right),
  );
}
