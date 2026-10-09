import type {
  ListQuery,
  ListQuerySpec,
} from "@/components/record-table/list-url";
import type { RecordTableFilter } from "@/components/record-table/record-table-filters";
import { isTaxonomyValue, optionsFor } from "@/domain/taxonomy/lookup";
import {
  TRANSPORT_MODES,
  TRANSPORT_MODE_LABELS,
  type TransportMode,
} from "@/domain/taxonomy/transport-mode";
import type { IsoTimestamp } from "@/types/common";

/**
 * The `/shipments` URL contract — `UX_SPEC.md` §3.11: filters by date range,
 * mode, destination and containing-damaged-records, all in the URL so a
 * filtered ledger is a shareable link.
 *
 * **`from` and `to` are in the contract and have no control**, exactly as on
 * `/batteries`: `RecordTable` has no date-range filter kind, and a half-built
 * date control is worse than none. They bound the departure date.
 */

export const SHIPMENT_LIST_PATH = "/shipments";
export const SHIPMENT_PAGE_SIZE = 25;

export const SHIPMENT_FILTER_IDS = [
  "mode",
  "destination",
  "damaged",
  "from",
  "to",
] as const;

const DAMAGED_VALUES = ["yes", "no"] as const;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function shipmentListSpec(
  destinations: readonly string[],
): ListQuerySpec {
  return {
    sortableColumnIds: [],
    defaultSort: "",
    defaultDir: "desc",
    filterIds: SHIPMENT_FILTER_IDS,
    filterValues: {
      mode: TRANSPORT_MODES,
      destination: destinations,
      damaged: DAMAGED_VALUES,
    },
    perPageOptions: [SHIPMENT_PAGE_SIZE, 50, 100],
  };
}

export function shipmentFilters(
  destinations: readonly string[],
): readonly RecordTableFilter[] {
  return [
    {
      id: "mode",
      label: "Transport mode",
      options: optionsFor(TRANSPORT_MODES, TRANSPORT_MODE_LABELS),
      anyLabel: "Any mode",
    },
    {
      id: "destination",
      label: "Destination",
      options: destinations.map((destination) => ({
        value: destination,
        label: destination,
      })),
      anyLabel: "Any destination",
    },
    {
      id: "damaged",
      label: "Damaged records",
      options: [
        {
          value: "yes",
          label: "Holds a damaged, defective or recalled record",
        },
        { value: "no", label: "Holds none" },
      ],
      anyLabel: "Any shipment",
    },
  ];
}

export interface ShipmentListSelection {
  readonly search: string | undefined;
  readonly transportMode: TransportMode | undefined;
  readonly destinationFacilityName: string | undefined;
  readonly holdsDamagedRecord: boolean | undefined;
  readonly shippedAfter: IsoTimestamp | undefined;
  readonly shippedBefore: IsoTimestamp | undefined;
}

export function shipmentListSelection(query: ListQuery): ShipmentListSelection {
  const mode = query.filters.mode;
  const damaged = query.filters.damaged;
  const from = query.filters.from;
  const to = query.filters.to;
  return {
    search: query.q ?? undefined,
    transportMode:
      mode !== undefined && isTaxonomyValue(TRANSPORT_MODES, mode)
        ? mode
        : undefined,
    destinationFacilityName: query.filters.destination,
    holdsDamagedRecord: damaged === undefined ? undefined : damaged === "yes",
    shippedAfter:
      from !== undefined && CIVIL_DATE.test(from)
        ? `${from}T00:00:00.000Z`
        : undefined,
    shippedBefore:
      to !== undefined && CIVIL_DATE.test(to)
        ? `${to}T23:59:59.999Z`
        : undefined,
  };
}
