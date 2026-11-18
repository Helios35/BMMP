import { mayTakeProducerAction } from "@/domain/access/producer-actions";
import {
  OBLIGATION_FILTER_IDS,
  OBLIGATIONS_EXPORT_PATH,
} from "@/features/obligations/list-query";
import {
  OBLIGATION_CSV_HEADERS,
  obligationCsvRows,
} from "@/features/obligations/obligations-csv";
import { readObligationsPage } from "@/features/obligations/server/read-obligations";
import { nowIso } from "@/lib/auth/session";
import { exportScope, serveCsvExport } from "@/lib/export/csv-export";

/**
 * `GET /api/exports/obligations` — Rule 8.16; `TECHNICAL_SPEC.md` §7.2.
 *
 * P2, P3, P5 and P6. Every current obligation and deadline, read by the
 * page's own reader, tenant-scoped through the adapter (Rule 12.17); the file
 * writes `export.generated` (Rule 12.18); a lapsed P5 grant produces nothing
 * (Rule 12.19). Served by `serveCsvExport`, the one export pattern.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return serveCsvExport(request, {
    exportName: "obligations",
    route: "/obligations",
    path: OBLIGATIONS_EXPORT_PATH,
    filenameStem: "producer-obligations",
    attempted: "export.obligations",
    mayExport: (role) => mayTakeProducerAction(role, "export_obligations"),
    deniedDetail:
      "Your role cannot export producer obligations. A Facility Manager, a Producer Compliance Officer, an Auditor or an Admin can.",
    tooLargeDetail: (total) =>
      `These obligations hold ${total} rows, which is more than one file carries.`,
    read: async (ctx, url) => {
      const page = await readObligationsPage(ctx, nowIso());
      return {
        kind: "file",
        file: {
          headers: OBLIGATION_CSV_HEADERS,
          rows: obligationCsvRows(page.model, page.people),
          scope: exportScope(
            Object.fromEntries(url.searchParams.entries()),
            OBLIGATION_FILTER_IDS,
            null,
          ),
        },
      };
    },
  });
}
