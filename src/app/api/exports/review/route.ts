import { decodeListQuery } from "@/components/record-table/list-url";
import { mayExportList } from "@/domain/access/export";
import {
  REVIEW_CSV_HEADERS,
  reviewCsvRows,
} from "@/features/review/review-csv";
import {
  INVENTORY_FILTER_IDS,
  inventoryListSpec,
  readUnidentifiedInventory,
  REVIEW_EXPORT_PATH,
} from "@/features/review/server/inventory";
import { nowIso } from "@/lib/auth/session";
import {
  EXPORT_MAX_ROWS,
  exportScope,
  serveCsvExport,
} from "@/lib/export/csv-export";

/**
 * `GET /api/exports/review` — the P2 view of `/review` as CSV: the batteries
 * in her containers that are still unidentified (`UX_SPEC.md` §3.8b; D-50).
 *
 * **P2 and P6** — the roles that export and can read `/review`
 * (`SITE_ARCHITECTURE.md` §5.2: P5 cannot reach it, so P5 cannot export it,
 * Rule 12.17). Decoded by the spec the page uses, read by the read the page
 * renders, so the file is the view the screen was showing. Served by
 * `serveCsvExport`, the one export pattern (Rules 12.18, 12.19).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return serveCsvExport(request, {
    exportName: "review",
    route: "/review",
    path: REVIEW_EXPORT_PATH,
    filenameStem: "unidentified-inventory",
    attempted: "export.review",
    mayExport: (role) => mayExportList(role, "/review"),
    deniedDetail:
      "Your role cannot export the review queue. A Facility Manager or an Admin can.",
    tooLargeDetail: (total) =>
      `This view holds ${total} batteries, which is more than one file carries. Narrow it by site, container or age and export again.`,
    read: async (ctx, url, organization) => {
      const asOf = nowIso();
      // The options are the data's own, exactly as the page builds them.
      const unfiltered = await readUnidentifiedInventory(ctx, asOf, {});
      const spec = inventoryListSpec(unfiltered);
      const query = decodeListQuery(
        Object.fromEntries(url.searchParams.entries()),
        spec,
      );
      const inventory =
        Object.keys(query.filters).length === 0
          ? unfiltered
          : await readUnidentifiedInventory(ctx, asOf, query.filters);
      const total = inventory.groups.reduce(
        (sum, group) => sum + group.rows.length,
        0,
      );
      if (total > EXPORT_MAX_ROWS) return { kind: "too_large", total };
      return {
        kind: "file",
        file: {
          headers: REVIEW_CSV_HEADERS,
          rows: reviewCsvRows(inventory, organization.timeZone),
          scope: exportScope(query.filters, INVENTORY_FILTER_IDS, query.q),
        },
      };
    },
  });
}
