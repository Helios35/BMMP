import { decodeListQuery } from "@/components/record-table/list-url";
import { data } from "@/data";
import { mayExportList } from "@/domain/access/export";
import {
  SHIPMENT_EXPORT_PATH,
  SHIPMENT_FILTER_IDS,
  shipmentListSelection,
  shipmentListSpec,
  shipmentQueryOf,
} from "@/features/shipments/list-query";
import {
  SHIPMENT_CSV_HEADERS,
  shipmentCsvRow,
} from "@/features/shipments/shipment-csv";
import {
  shipmentDestinations,
  shipmentListRow,
} from "@/features/shipments/server/read-shipments";
import {
  exportScope,
  readEveryPage,
  serveCsvExport,
} from "@/lib/export/csv-export";

/**
 * `GET /api/exports/shipments` — the shipment ledger as CSV (`UX_SPEC.md`
 * §3.11; D-50; `TECHNICAL_SPEC.md` §7.1).
 *
 * P2, P5 and P6. Decoded by the module the page uses and decorated by the
 * row the page renders, so the file is the ledger the screen was showing,
 * tenant-scoped (Rule 12.17); `export.generated` on every file (Rule 12.18);
 * nothing from a lapsed grant (Rule 12.19). Served by `serveCsvExport`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return serveCsvExport(request, {
    exportName: "shipments",
    route: "/shipments",
    path: SHIPMENT_EXPORT_PATH,
    filenameStem: "shipments",
    attempted: "export.shipments",
    mayExport: (role) => mayExportList(role, "/shipments"),
    deniedDetail:
      "Your role reads the shipment ledger and does not export it. A Facility Manager, an Auditor or an Admin can.",
    tooLargeDetail: (total) =>
      `This ledger holds ${total} shipments, which is more than one file carries. Narrow it by date, mode or destination and export again.`,
    read: async (ctx, url, organization) => {
      const destinations = await shipmentDestinations(ctx);
      const spec = shipmentListSpec(destinations);
      const listQuery = decodeListQuery(
        Object.fromEntries(url.searchParams.entries()),
        spec,
      );
      const query = shipmentQueryOf(shipmentListSelection(listQuery));
      const read = await readEveryPage((page) =>
        data.shipments.list(ctx, { ...query, ...page }),
      );
      if (read.kind === "too_large") return read;
      const rows: (readonly string[])[] = [];
      for (const shipment of read.rows) {
        rows.push(
          shipmentCsvRow(
            await shipmentListRow(ctx, shipment),
            organization.timeZone,
          ),
        );
      }
      return {
        kind: "file",
        file: {
          headers: SHIPMENT_CSV_HEADERS,
          rows,
          scope: exportScope(
            listQuery.filters,
            SHIPMENT_FILTER_IDS,
            listQuery.q,
          ),
        },
      };
    },
  });
}
