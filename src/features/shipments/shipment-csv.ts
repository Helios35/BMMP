import { DOCUMENT_RENDER_STATUS_LABELS } from "@/domain/taxonomy/document-render-status";
import { SHIPMENT_STATUS_LABELS } from "@/domain/taxonomy/shipment-status";
import { TRANSPORT_MODE_LABELS } from "@/domain/taxonomy/transport-mode";
import { absoluteInstant } from "@/features/battery-record/format-instant";
import type { TimeZone } from "@/types/common";

import { MANIFEST_BADGE, NOT_DEPARTED, PAPER_NONE } from "./shipment-copy";
import type { ShipmentListRow } from "./server/read-shipments";

/**
 * `/shipments` as CSV — `UX_SPEC.md` §3.11; D-50; Rules 12.17–12.19.
 *
 * The ledger's columns as the screen words them, decorated by the same
 * `shipmentListRow` the screen reads, plus the facts a copy of a ledger is
 * taken for: when it was created, the carrier, and the manifest gap — a
 * fully-regulated line is never exported as fully documented (E-14). No
 * probability, percentage or score appears in any column (Rule 1.25).
 */

export const SHIPMENT_CSV_HEADERS = [
  "Shipment",
  "Status",
  "Manifest",
  "Created",
  "Departed",
  "Time zone",
  "Destination",
  "Destination identifier",
  "Transport mode",
  "Carrier",
  "Records",
  "Containers",
  "Shipping paper",
] as const;

export function shipmentCsvRow(
  row: ShipmentListRow,
  timeZone: TimeZone,
): readonly string[] {
  const { shipment } = row;
  return [
    shipment.shipmentNumber,
    SHIPMENT_STATUS_LABELS[shipment.status],
    row.manifestOutstanding ? MANIFEST_BADGE : "",
    absoluteInstant(shipment.createdAt, timeZone),
    shipment.shippedAt === null
      ? NOT_DEPARTED
      : absoluteInstant(shipment.shippedAt, timeZone),
    timeZone,
    shipment.destinationFacilityName,
    shipment.destinationIdentifier ?? "",
    TRANSPORT_MODE_LABELS[shipment.transportMode],
    shipment.carrierName ?? "",
    String(row.recordCount),
    String(row.containerCount),
    row.paperRender === null
      ? PAPER_NONE
      : DOCUMENT_RENDER_STATUS_LABELS[row.paperRender.status],
  ];
}
