import { mockStore } from "./store";

/**
 * Where an organization's counter starts — the higher of its `*_seq` column
 * and the highest number already on file.
 *
 * In Postgres the sequence column is the truth and the seed sets it. The mock's
 * organization rows are fixtures, and `b1a-08` added containers, lots, records
 * and a shipment **without editing** the organization row (STATE §7.1), so its
 * `*_seq` columns undercount what is on file. Starting above the highest code
 * keeps a new `C-`, `L-`, `BR-` or `SH-` number from repeating one a fixture
 * already holds — `unique(organization_id, *_code)` in the ERD. The first
 * migration's seed sets the columns to match (b1a-08 build-notes).
 */
export function sequenceStart(
  organizationId: string,
  counter: "battery_record" | "container" | "lot" | "shipment",
  recorded: number,
): number {
  const s = mockStore();
  const codes: readonly string[] =
    counter === "battery_record"
      ? s.batteryRecords
          .all()
          .filter((row) => row.organizationId === organizationId)
          .map((row) => row.recordNumber)
      : counter === "container"
        ? s.containers
            .all()
            .filter((row) => row.organizationId === organizationId)
            .map((row) => row.containerCode)
        : counter === "lot"
          ? s.lots
              .all()
              .filter((row) => row.organizationId === organizationId)
              .map((row) => row.lotCode)
          : s.shipments
              .all()
              .filter((row) => row.organizationId === organizationId)
              .map((row) => row.shipmentNumber);
  const onFile = codes
    .map((code) => Number.parseInt(code.slice(code.lastIndexOf("-") + 1), 10))
    .filter((value) => Number.isFinite(value));
  return Math.max(recorded, ...onFile);
}
