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

import { TAB_DEADLINES, TAB_PRODUCTS, TAB_STATES } from "./obligation-copy";

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

export const OBLIGATION_TAB_IDS = ["deadlines", "states", "products"] as const;
export type ObligationTabId = (typeof OBLIGATION_TAB_IDS)[number];

export const OBLIGATION_TABS = [
  { id: "deadlines", label: TAB_DEADLINES },
  { id: "states", label: TAB_STATES },
  { id: "products", label: TAB_PRODUCTS },
] as const;

export const OBLIGATION_FILTER_IDS = ["state", "status"] as const;

export function obligationsListSpec(
  stateCodes: readonly string[],
): ListQuerySpec {
  return {
    sortableColumnIds: [],
    defaultSort: "",
    defaultDir: "asc",
    filterIds: OBLIGATION_FILTER_IDS,
    filterValues: { state: stateCodes, status: DEADLINE_STANDINGS },
    perPageOptions: [OBLIGATIONS_PAGE_SIZE, 50, 100],
    tabIds: OBLIGATION_TAB_IDS,
    defaultTab: "deadlines",
  };
}

export function activeObligationTab(query: ListQuery): ObligationTabId {
  return query.tab === "states" || query.tab === "products"
    ? query.tab
    : "deadlines";
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
