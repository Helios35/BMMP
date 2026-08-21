import type {
  ListQuery,
  ListQuerySpec,
} from "@/components/record-table/list-url";
import type { RecordTableFilter } from "@/components/record-table/record-table-filters";
import type { BatteryRecordSortField } from "@/data/contracts/battery";
import {
  ASSESSED_CONDITIONS,
  ASSESSED_CONDITION_LABELS,
} from "@/domain/taxonomy/assessed-condition";
import {
  CHEMISTRIES,
  CHEMISTRY_LABELS,
  type Chemistry,
} from "@/domain/taxonomy/chemistry";
import { isTaxonomyValue, optionsFor } from "@/domain/taxonomy/lookup";
import {
  STORAGE_CLOCK_ALERT_BANDS,
  STORAGE_CLOCK_ALERT_BAND_LABELS,
  type StorageClockAlertBand,
} from "@/domain/taxonomy/storage-clock-alert-band";
import type { IsoTimestamp } from "@/types/common";

/**
 * The `/batteries` URL contract — the one place this list's parameters are named.
 *
 * **Filter, sort, page and tab state lives in the URL** (`SITE_ARCHITECTURE.md`
 * §7.4). A handler sends a colleague a link to a filtered view and the colleague
 * sees the same rows; an audit row deep-links into the exact list it describes.
 * The codec in `src/components/record-table/list-url.ts` does the encoding —
 * this module says only what this route's parameters are and what they mean to
 * the adapter.
 *
 * **Nothing battery-specific belongs inside `RecordTable`.** The table is reused
 * by `/catalog`, `/audit` and, in unit 04, `/containers`, so every battery
 * concern sits on this side of the boundary.
 */

export const BATTERY_LIST_PATH = "/batteries";

/** The list page size. The codec offers the larger sizes through `?perPage=`. */
export const BATTERY_PAGE_SIZE = 25;

/**
 * The sortable columns, which are exactly the adapter's sort fields.
 *
 * The column id **is** the value in `?sort=`, so the two cannot drift: a column
 * that is sortable here is a field the contract accepts, and `satisfies` makes
 * anything else a type error rather than a query the adapter silently ignores.
 *
 * **`format_category` is deliberately absent and always will be.** A format band
 * is keyed on `(battery_record, jurisdiction, rule_version)` and one record
 * carries several — so a column that sorted by one of them would have asserted a
 * single organisation-wide format value (`SITE_ARCHITECTURE.md` §7.6b).
 */
export const BATTERY_SORT_FIELDS = [
  "recordNumber",
  "manufacturerName",
  "assessedCondition",
  "createdAt",
] as const satisfies readonly BatteryRecordSortField[];

export const BATTERY_FILTER_IDS = [
  "condition",
  "chemistry",
  "container",
  "tier",
  "matched",
  "from",
  "to",
] as const;

const MATCHED_VALUES = ["yes", "no"] as const;

/** `YYYY-MM-DD`, and nothing else reaches the adapter. */
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The spec the route decodes with and the table encodes with.
 *
 * `containerCodes` is passed in because the permitted values of the container
 * filter are this organisation's own container codes — so a stale link naming a
 * container that has since been retired falls back to "any" rather than being
 * sent to the adapter.
 */
export function batteryListSpec(
  containerCodes: readonly string[],
): ListQuerySpec {
  return {
    sortableColumnIds: BATTERY_SORT_FIELDS,
    defaultSort: "createdAt",
    defaultDir: "desc",
    filterIds: BATTERY_FILTER_IDS,
    filterValues: {
      condition: ASSESSED_CONDITIONS,
      chemistry: CHEMISTRIES,
      container: containerCodes,
      tier: STORAGE_CLOCK_ALERT_BANDS,
      matched: MATCHED_VALUES,
    },
    perPageOptions: [BATTERY_PAGE_SIZE, 50, 100],
  };
}

/**
 * The bounded filters, in declared order.
 *
 * **Every option list comes from `optionsFor`**, which walks the taxonomy's own
 * value order — the display order (`TAXONOMY.md` §5.7). Sorting a user-facing
 * list alphabetically by stored value is a review rejection.
 *
 * `from` and `to` are in the URL contract and have **no control here**: the
 * filter row renders selects, and `RecordTable` has no date-range filter kind. A
 * half-built date control is worse than none, so the range stays reachable by
 * link, counts as an active filter and clears with **Clear filters**, and the
 * control arrives when the table grows the prop.
 */
export function batteryFilters(
  containerCodes: readonly string[],
): readonly RecordTableFilter[] {
  return [
    {
      id: "condition",
      label: "Assessed condition",
      options: optionsFor(ASSESSED_CONDITIONS, ASSESSED_CONDITION_LABELS),
      anyLabel: "Any condition",
    },
    {
      id: "chemistry",
      label: "Chemistry",
      options: optionsFor(CHEMISTRIES, CHEMISTRY_LABELS),
      anyLabel: "Any chemistry",
    },
    {
      id: "container",
      label: "Container",
      options: containerCodes.map((code) => ({ value: code, label: code })),
      anyLabel: "Any container",
    },
    {
      id: "tier",
      label: "Storage clock tier",
      options: optionsFor(
        STORAGE_CLOCK_ALERT_BANDS,
        STORAGE_CLOCK_ALERT_BAND_LABELS,
      ),
      anyLabel: "Any tier",
    },
    {
      id: "matched",
      label: "Catalog match",
      options: [
        { value: "yes", label: "Matched" },
        { value: "no", label: "Not matched" },
      ],
      anyLabel: "Any",
    },
  ];
}

/** What the decoded URL asks the adapter for. Every field is already narrowed. */
export interface BatteryListSelection {
  readonly search: string | undefined;
  readonly sortBy: BatteryRecordSortField;
  readonly sortDirection: "asc" | "desc";
  readonly assessedCondition: string | undefined;
  readonly chemistry: Chemistry | undefined;
  readonly containerCode: string | undefined;
  readonly tier: StorageClockAlertBand | undefined;
  readonly isCatalogMatched: boolean | undefined;
  readonly loggedAfter: IsoTimestamp | undefined;
  readonly loggedBefore: IsoTimestamp | undefined;
}

/**
 * Read the decoded URL into the adapter's vocabulary.
 *
 * The codec has already dropped anything outside `filterValues`, so what is left
 * is the pair the codec cannot check — the two dates — and the type guards that
 * turn a validated string into a taxonomy value.
 *
 * **`assessedCondition` stays a string.** T-49 governs the column and the column
 * is still `string` pending the fixture migration; narrowing the filter ahead of
 * the field would make it unable to select the fixtures that exist today.
 */
export function batteryListSelection(query: ListQuery): BatteryListSelection {
  const chemistry = query.filters.chemistry;
  const tier = query.filters.tier;
  const matched = query.filters.matched;

  return {
    search: query.q ?? undefined,
    sortBy: sortFieldOf(query.sort),
    sortDirection: query.dir ?? "desc",
    assessedCondition: query.filters.condition,
    chemistry:
      chemistry !== undefined && isTaxonomyValue(CHEMISTRIES, chemistry)
        ? chemistry
        : undefined,
    containerCode: query.filters.container,
    tier:
      tier !== undefined && isTaxonomyValue(STORAGE_CLOCK_ALERT_BANDS, tier)
        ? tier
        : undefined,
    isCatalogMatched: matched === undefined ? undefined : matched === "yes",
    loggedAfter: dayStart(query.filters.from),
    loggedBefore: dayEnd(query.filters.to),
  };
}

function sortFieldOf(sort: string | null): BatteryRecordSortField {
  const fields: readonly string[] = BATTERY_SORT_FIELDS;
  return sort !== null && fields.includes(sort)
    ? (sort as BatteryRecordSortField)
    : "createdAt";
}

/**
 * A civil date becomes a bound over `created_at`.
 *
 * The bounds are read in UTC rather than in a site zone, because one list spans
 * every site an organisation has and a single range cannot be read in several
 * calendars at once. The date a reader types is the date they get; nothing here
 * rounds a record into or out of a range silently.
 */
function dayStart(value: string | undefined): IsoTimestamp | undefined {
  if (value === undefined || !CIVIL_DATE.test(value)) return undefined;
  return `${value}T00:00:00.000Z`;
}

function dayEnd(value: string | undefined): IsoTimestamp | undefined {
  if (value === undefined || !CIVIL_DATE.test(value)) return undefined;
  return `${value}T23:59:59.999Z`;
}
