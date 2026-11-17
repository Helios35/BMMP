import type {
  ListQuery,
  ListQuerySpec,
} from "@/components/record-table/list-url";
import type { RecordTableFilter } from "@/components/record-table/record-table-filters";
import {
  CONTAINER_STATUSES,
  CONTAINER_STATUS_LABELS,
  type ContainerStatus,
} from "@/domain/taxonomy/container-status";
import {
  HAZARD_RANKING_BANDS,
  HAZARD_RANKING_BAND_LABELS,
  type HazardRankingBand,
} from "@/domain/taxonomy/hazard-ranking-band";
import { isTaxonomyValue, optionsFor } from "@/domain/taxonomy/lookup";
import { ANY_BAND, BAND_FILTER } from "@/features/hazard-ranking/ranking-copy";
import {
  LOT_STATUSES,
  LOT_STATUS_LABELS,
  type LotStatus,
} from "@/domain/taxonomy/lot-status";
import {
  STORAGE_CLOCK_ALERT_BANDS,
  STORAGE_CLOCK_ALERT_BAND_LABELS,
  type StorageClockAlertBand,
} from "@/domain/taxonomy/storage-clock-alert-band";

/**
 * The `/containers` URL contract — `UX_SPEC.md` §3.9; `SITE_ARCHITECTURE.md`
 * §7.4, Flow C2.
 *
 * `?filter=alerting` is the deep link the dashboard and `/review` send —
 * *"filter state is in the URL and is shareable"* — and it narrows by the
 * `alert` rows themselves, never by a condition re-derived on render.
 *
 * **Status** carries §3.9's ready-to-ship filter: T-24's `closed` is *"sealed
 * and ready for shipment"*, and a filter on the one status column serves both
 * questions without a second vocabulary.
 *
 * §3.9's over-threshold filter is **not here**: no quantity-limit rule is
 * carried as data yet, so it could only ever select nothing — reported in the
 * build-notes rather than shipped as a filter that lies by being empty.
 */

export const CONTAINER_LIST_PATH = "/containers";
export const CONTAINER_PAGE_SIZE = 25;

export const CONTAINER_FILTER_IDS = [
  "filter",
  "tier",
  "status",
  "location",
  "band",
] as const;

/**
 * The one sortable column on both views — the Ranking (`UX_SPEC.md` §3.9):
 * the current position, highest first ascending; unranked last.
 */
export const RANKING_SORT = "hazardRanking";

/** `?filter=alerting` — the one value, named by Flow C2. */
export const ALERTING = "alerting";

/**
 * `/containers`' two views, in the URL like every tab (`?tab=lots`): the
 * containers, and the lots that group them (T-25; the owner's call in
 * `b1a-08` — a lot has no route of its own).
 */
export const CONTAINER_VIEW_IDS = ["containers", "lots"] as const;
export type ContainerViewId = (typeof CONTAINER_VIEW_IDS)[number];

export function activeContainerView(query: ListQuery): ContainerViewId {
  return query.tab === "lots" ? "lots" : "containers";
}

export const LOT_FILTER_IDS = ["status", "band"] as const;

/** The Lots view's URL contract — search and T-25's status. */
export const LOT_LIST_SPEC: ListQuerySpec = {
  sortableColumnIds: [RANKING_SORT],
  defaultSort: "",
  defaultDir: "desc",
  filterIds: LOT_FILTER_IDS,
  filterValues: { status: LOT_STATUSES, band: HAZARD_RANKING_BANDS },
  perPageOptions: [CONTAINER_PAGE_SIZE, 50, 100],
  tabIds: CONTAINER_VIEW_IDS,
};

export const LOT_FILTERS: readonly RecordTableFilter[] = [
  {
    id: "status",
    label: "Status",
    options: optionsFor(LOT_STATUSES, LOT_STATUS_LABELS),
    anyLabel: "Any status",
  },
  {
    // T-33 — the band of the current ranking (Rule 10.23).
    id: "band",
    label: BAND_FILTER,
    options: optionsFor(HAZARD_RANKING_BANDS, HAZARD_RANKING_BAND_LABELS),
    anyLabel: ANY_BAND,
  },
];

export interface LotListSelection {
  readonly search: string | null;
  readonly status: LotStatus | null;
  readonly band: HazardRankingBand | null;
  readonly sortByRanking: boolean;
  readonly sortDirection: "asc" | "desc";
}

export function lotListSelection(query: ListQuery): LotListSelection {
  const status = query.filters.status;
  const band = query.filters.band;
  return {
    search: query.q,
    status:
      status !== undefined && isTaxonomyValue(LOT_STATUSES, status)
        ? status
        : null,
    band:
      band !== undefined && isTaxonomyValue(HAZARD_RANKING_BANDS, band)
        ? band
        : null,
    sortByRanking: query.sort === RANKING_SORT,
    sortDirection: query.dir ?? "asc",
  };
}

export function containerListSpec(locations: readonly string[]): ListQuerySpec {
  return {
    sortableColumnIds: [RANKING_SORT],
    defaultSort: "",
    defaultDir: "desc",
    filterIds: CONTAINER_FILTER_IDS,
    filterValues: {
      filter: [ALERTING],
      tier: STORAGE_CLOCK_ALERT_BANDS,
      status: CONTAINER_STATUSES,
      location: locations,
      band: HAZARD_RANKING_BANDS,
    },
    perPageOptions: [CONTAINER_PAGE_SIZE, 50, 100],
    tabIds: CONTAINER_VIEW_IDS,
  };
}

export function containerFilters(
  locations: readonly string[],
): readonly RecordTableFilter[] {
  return [
    {
      id: "filter",
      label: "Alerts",
      options: [{ value: ALERTING, label: "Has an open alert" }],
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
      id: "status",
      label: "Status",
      options: optionsFor(CONTAINER_STATUSES, CONTAINER_STATUS_LABELS),
      anyLabel: "Any status",
    },
    {
      id: "location",
      label: "Location",
      options: locations.map((location) => ({
        value: location,
        label: location,
      })),
      anyLabel: "Any location",
    },
    {
      // T-33 — the band of the current ranking (Rule 10.23).
      id: "band",
      label: BAND_FILTER,
      options: optionsFor(HAZARD_RANKING_BANDS, HAZARD_RANKING_BAND_LABELS),
      anyLabel: ANY_BAND,
    },
  ];
}

export interface ContainerListSelection {
  readonly isAlerting: true | undefined;
  readonly tier: StorageClockAlertBand | undefined;
  readonly status: ContainerStatus | undefined;
  readonly storageLocation: string | undefined;
  readonly search: string | undefined;
  readonly hazardRankingBand: HazardRankingBand | undefined;
  readonly sortBy: typeof RANKING_SORT | undefined;
  readonly sortDirection: "asc" | "desc" | undefined;
}

export function containerListSelection(
  query: ListQuery,
): ContainerListSelection {
  const tier = query.filters.tier;
  const status = query.filters.status;
  const band = query.filters.band;
  return {
    hazardRankingBand:
      band !== undefined && isTaxonomyValue(HAZARD_RANKING_BANDS, band)
        ? band
        : undefined,
    sortBy: query.sort === RANKING_SORT ? RANKING_SORT : undefined,
    sortDirection:
      query.sort === RANKING_SORT ? (query.dir ?? "asc") : undefined,
    isAlerting: query.filters.filter === ALERTING ? true : undefined,
    tier:
      tier !== undefined && isTaxonomyValue(STORAGE_CLOCK_ALERT_BANDS, tier)
        ? tier
        : undefined,
    status:
      status !== undefined && isTaxonomyValue(CONTAINER_STATUSES, status)
        ? status
        : undefined,
    storageLocation: query.filters.location,
    search: query.q ?? undefined,
  };
}
