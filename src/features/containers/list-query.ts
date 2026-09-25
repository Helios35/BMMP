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
import { isTaxonomyValue, optionsFor } from "@/domain/taxonomy/lookup";
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
] as const;

/** `?filter=alerting` — the one value, named by Flow C2. */
export const ALERTING = "alerting";

export function containerListSpec(locations: readonly string[]): ListQuerySpec {
  return {
    sortableColumnIds: [],
    defaultSort: "",
    defaultDir: "desc",
    filterIds: CONTAINER_FILTER_IDS,
    filterValues: {
      filter: [ALERTING],
      tier: STORAGE_CLOCK_ALERT_BANDS,
      status: CONTAINER_STATUSES,
      location: locations,
    },
    perPageOptions: [CONTAINER_PAGE_SIZE, 50, 100],
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
  ];
}

export interface ContainerListSelection {
  readonly isAlerting: true | undefined;
  readonly tier: StorageClockAlertBand | undefined;
  readonly status: ContainerStatus | undefined;
  readonly storageLocation: string | undefined;
  readonly search: string | undefined;
}

export function containerListSelection(
  query: ListQuery,
): ContainerListSelection {
  const tier = query.filters.tier;
  const status = query.filters.status;
  return {
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
