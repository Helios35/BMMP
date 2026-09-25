import type { ReactElement } from "react";

import type { RecordTableColumn } from "@/components/record-table/record-table";
import { StatusBadge } from "@/components/status/status-badge";
import { ContainerFillMeter } from "@/components/storage/container-fill-meter";
import {
  StorageClockMeter,
  StorageClockMeterEmpty,
} from "@/components/storage/storage-clock-meter";
import { CONTAINER_TYPE_LABELS } from "@/domain/taxonomy/container-type";
import type { IsoTimestamp } from "@/types/common";

import {
  COLUMN_CLOCK,
  COLUMN_FILL,
  COLUMN_ID,
  COLUMN_LOCATION,
  COLUMN_RECORDS,
  COLUMN_STATUS,
  COLUMN_TYPE,
  CONTAINER_MASS_UNIT,
  CYCLE_ENDED,
  NO_CLOCK_EMPTY,
  NO_LOCATION,
} from "./container-copy";
import type { ContainerListRow } from "./server/read-containers";

/**
 * The `/containers` columns — `UX_SPEC.md` §3.9: the container label ID, its
 * location, its record count, its fill, its storage clock and its status, with
 * an inline `StorageClockMeter` and `ContainerFillMeter` on every row.
 *
 * **The meters take values and nothing else.** No cell links: whether a row
 * opens is `RecordTable`'s `rowLink`, decided by the route from `ROUTE_ACCESS`
 * (`SITE_ARCHITECTURE.md` §5.4). No quantity limit is carried as rule data
 * yet, so every fill meter states that plainly rather than inventing one (E-7).
 */

export function ClockCell({
  row,
  asOf,
  size = "sm",
}: {
  readonly row: Pick<ContainerListRow, "container" | "clock">;
  readonly asOf: IsoTimestamp;
  readonly size?: "sm" | "md";
}): ReactElement {
  const { container, clock } = row;
  if (clock === null) {
    return <StorageClockMeterEmpty message={NO_CLOCK_EMPTY} />;
  }
  if (clock.status === "stopped") {
    return <StorageClockMeterEmpty message={CYCLE_ENDED} />;
  }
  return (
    <StorageClockMeter
      clock={clock}
      label={`Storage clock for container ${container.containerCode}`}
      asOf={asOf}
      size={size}
    />
  );
}

export function containerColumns(
  asOf: IsoTimestamp,
): readonly RecordTableColumn<ContainerListRow>[] {
  return [
    {
      id: "containerCode",
      header: COLUMN_ID,
      mono: true,
      primary: true,
      cell: (row) => row.container.containerCode,
    },
    {
      id: "containerType",
      header: COLUMN_TYPE,
      secondary: true,
      cell: (row) => CONTAINER_TYPE_LABELS[row.container.containerType],
    },
    {
      id: "storageLocation",
      header: COLUMN_LOCATION,
      cell: (row) => row.container.storageLocation ?? NO_LOCATION,
    },
    {
      id: "recordCount",
      header: COLUMN_RECORDS,
      align: "end",
      cell: (row) => <span className="tabular">{String(row.recordCount)}</span>,
    },
    {
      id: "fill",
      header: COLUMN_FILL,
      cell: (row) => (
        <div className="min-w-48">
          <ContainerFillMeter
            reading={{
              current: row.container.currentNetMassKg,
              capacity: row.container.capacityKg,
              unit: CONTAINER_MASS_UNIT,
            }}
            limit={null}
            label={`Fill for container ${row.container.containerCode}`}
            size="sm"
          />
        </div>
      ),
    },
    {
      id: "clock",
      header: COLUMN_CLOCK,
      cell: (row) => (
        <div className="min-w-56">
          <ClockCell row={row} asOf={asOf} />
        </div>
      ),
    },
    {
      id: "status",
      header: COLUMN_STATUS,
      status: true,
      cell: (row) => (
        <StatusBadge
          system="container_status"
          value={row.container.status}
          size="sm"
        />
      ),
    },
  ];
}
