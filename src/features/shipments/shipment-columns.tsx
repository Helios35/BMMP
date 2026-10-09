import type { ReactElement } from "react";

import type { RecordTableColumn } from "@/components/record-table/record-table";
import { StatusBadge } from "@/components/status/status-badge";
import type { TimeZone } from "@/types/common";

import {
  COLUMN_CONTAINERS,
  COLUMN_DATE,
  COLUMN_DESTINATION,
  COLUMN_MODE,
  COLUMN_NUMBER,
  COLUMN_PAPER,
  COLUMN_RECORDS,
  COLUMN_STATUS,
  MANIFEST_BADGE,
  NOT_DEPARTED,
  PAPER_NONE,
} from "./shipment-copy";
import type { ShipmentListRow } from "./server/read-shipments";

/**
 * The `/shipments` columns — `UX_SPEC.md` §3.11: shipment number (mono),
 * date, destination, transport mode, record count, containers and shipping
 * paper status. **No cell links**: whether a row opens is `RecordTable`'s
 * `rowLink`, decided by the route from `ROUTE_ACCESS`.
 *
 * A shipment with a fully-regulated record carries its status **escalated to
 * attention** and the manifest named — never a green tick (E-14).
 */

function departedText(row: ShipmentListRow, timeZone: TimeZone): string {
  if (row.shipment.shippedAt === null) return NOT_DEPARTED;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(row.shipment.shippedAt));
}

function PaperCell({ row }: { readonly row: ShipmentListRow }): ReactElement {
  if (row.paperRender === null) {
    return <span data-paper-state="none">{PAPER_NONE}</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-2"
      data-paper-state={row.paper}
    >
      <StatusBadge
        system="document_render_status"
        value={row.paperRender.status}
        size="sm"
      />
    </span>
  );
}

export function shipmentColumns(
  timeZone: TimeZone,
): readonly RecordTableColumn<ShipmentListRow>[] {
  return [
    {
      id: "shipmentNumber",
      header: COLUMN_NUMBER,
      mono: true,
      primary: true,
      cell: (row) => row.shipment.shipmentNumber,
    },
    {
      id: "shippedAt",
      header: COLUMN_DATE,
      secondary: true,
      cell: (row) => departedText(row, timeZone),
    },
    {
      id: "destination",
      header: COLUMN_DESTINATION,
      cell: (row) => row.shipment.destinationFacilityName,
    },
    {
      id: "transportMode",
      header: COLUMN_MODE,
      cell: (row) => (
        <StatusBadge
          system="transport_mode"
          value={row.shipment.transportMode}
          size="sm"
        />
      ),
    },
    {
      id: "recordCount",
      header: COLUMN_RECORDS,
      align: "end",
      cell: (row) => <span className="tabular">{String(row.recordCount)}</span>,
    },
    {
      id: "containerCount",
      header: COLUMN_CONTAINERS,
      align: "end",
      cell: (row) => (
        <span className="tabular">{String(row.containerCount)}</span>
      ),
    },
    {
      id: "paper",
      header: COLUMN_PAPER,
      cell: (row) => <PaperCell row={row} />,
    },
    {
      id: "status",
      header: COLUMN_STATUS,
      status: true,
      cell: (row) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <StatusBadge
            system="shipment_status"
            value={row.shipment.status}
            size="sm"
            {...(row.manifestOutstanding ? { escalateTo: "attention" } : {})}
          />
          {row.manifestOutstanding ? (
            <span data-manifest-outstanding="true" className="text-caption">
              {MANIFEST_BADGE}
            </span>
          ) : null}
        </span>
      ),
    },
  ];
}
