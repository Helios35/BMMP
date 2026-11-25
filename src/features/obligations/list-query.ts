import type {
  ListQuery,
  ListQuerySpec,
} from "@/components/record-table/list-url";
import type { RecordTableFilter } from "@/components/record-table/record-table-filters";
import {
  DEADLINE_STANDINGS,
  DEADLINE_STANDING_LABELS,
  type DeadlineStanding,
} from "@/domain/producer";
import { isTaxonomyValue, optionsFor } from "@/domain/taxonomy/lookup";

import {
  latestYearLabel,
  SALES_YEAR,
  TAB_DEADLINES,
  TAB_PRODUCTS,
  TAB_SALES,
  TAB_STATES,
} from "./obligation-copy";

/**
 * `/obligations`' URL — `UX_SPEC.md` §3.21; `SITE_ARCHITECTURE.md` §7.4.
 *
 * Tabs, filters and `?state=` live in the URL. On the Deadlines tab `state`
 * and `status` narrow the list; on the States tab `state` opens that state's
 * panel. One parameter, so a link to a state's deadlines and a link to its
 * panel are one tab apart. The state is named by its T-40 code, which the
 * URL carries and nothing parses.
 */

export const OBLIGATIONS_PATH = "/obligations";
export const OBLIGATIONS_EXPORT_PATH = "/api/exports/obligations";
export const OBLIGATIONS_PAGE_SIZE = 25;

export const OBLIGATION_TAB_IDS = [
  "deadlines",
  "states",
  "products",
  "sales",
] as const;
export type ObligationTabId = (typeof OBLIGATION_TAB_IDS)[number];

export const OBLIGATION_TABS = [
  { id: "deadlines", label: TAB_DEADLINES },
  { id: "states", label: TAB_STATES },
  { id: "products", label: TAB_PRODUCTS },
  { id: "sales", label: TAB_SALES },
] as const;

/**
 * `state` and `status` narrow Deadlines (and `state` opens a state's panel);
 * `product` opens a product's plan (Rule 8.23); `year` picks the Sales tab's
 * calendar year — absent, the latest full one (UX §3.21).
 */
export const OBLIGATION_FILTER_IDS = [
  "state",
  "status",
  "product",
  "year",
] as const;

export function obligationsListSpec(
  stateCodes: readonly string[],
  productIds: readonly string[] = [],
  years: readonly number[] = [],
): ListQuerySpec {
  return {
    sortableColumnIds: [],
    defaultSort: "",
    defaultDir: "asc",
    filterIds: OBLIGATION_FILTER_IDS,
    filterValues: {
      state: stateCodes,
      status: DEADLINE_STANDINGS,
      product: productIds,
      year: years.map(String),
    },
    perPageOptions: [OBLIGATIONS_PAGE_SIZE, 50, 100],
    tabIds: OBLIGATION_TAB_IDS,
    defaultTab: "deadlines",
  };
}

export function activeObligationTab(query: ListQuery): ObligationTabId {
  return query.tab === "states" ||
    query.tab === "products" ||
    query.tab === "sales"
    ? query.tab
    : "deadlines";
}

/** The Sales tab's year: the URL's, or the latest full calendar year. */
export function salesYear(query: ListQuery, latest: number): number {
  const year = query.filters.year;
  return year === undefined ? latest : Number(year);
}

/** The year filter — the default year is the "any" option, so it never reaches the URL. */
export function salesYearFilter(
  years: readonly number[],
  latest: number,
): RecordTableFilter {
  return {
    id: "year",
    label: SALES_YEAR,
    options: years
      .filter((year) => year !== latest)
      .map((year) => ({ value: String(year), label: String(year) })),
    anyLabel: latestYearLabel(latest),
  };
}

export function deadlineFilters(
  states: readonly { readonly code: string; readonly name: string }[],
): readonly RecordTableFilter[] {
  return [
    {
      id: "state",
      label: "State",
      options: states.map((state) => ({
        value: state.code,
        label: state.name,
      })),
      anyLabel: "Any state",
    },
    {
      id: "status",
      label: "Status",
      options: optionsFor(DEADLINE_STANDINGS, DEADLINE_STANDING_LABELS),
      anyLabel: "Any status",
    },
  ];
}

export interface DeadlineSelection {
  readonly stateCode: string | null;
  readonly standing: DeadlineStanding | null;
}

export function deadlineSelection(query: ListQuery): DeadlineSelection {
  const status = query.filters.status;
  return {
    stateCode: query.filters.state ?? null,
    standing:
      status !== undefined && isTaxonomyValue(DEADLINE_STANDINGS, status)
        ? status
        : null,
  };
}
