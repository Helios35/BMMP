import { data } from "@/data";
import { decodeListQuery } from "@/components/record-table/list-url";
import { mayExportList } from "@/domain/access/export";
import { auditCsvRow, AUDIT_CSV_HEADERS } from "@/features/audit/audit-csv";
import { readAuditActorDirectory } from "@/features/audit/audit-actors";
import {
  AUDIT_EXPORT_PATH,
  AUDIT_FILTER_IDS,
  AUDIT_LIST_SPEC,
  auditExportSearchParams,
  toAuditEventQuery,
} from "@/features/audit/audit-query";
import { toAuditRowView } from "@/features/audit/audit-row";
import {
  exportScope,
  readEveryPage,
  serveCsvExport,
} from "@/lib/export/csv-export";

/**
 * `GET /api/exports/audit` — the audit log as CSV (`TECHNICAL_SPEC.md` §7.2;
 * `UX_SPEC.md` §3.20).
 *
 * Served by `serveCsvExport`, the one export pattern (Rules 12.17–12.19): this
 * file declares only what the audit file holds. **P1 cannot read the audit
 * log** (Rule 12.8), so P1 is refused underneath the guard as well as by it;
 * **export is never disabled for the auditor** (Rule 5.27, E-8a). The CSV is
 * the same view model the screen renders, so a platform action is
 * distinguishable in the file exactly as on the screen (Rule 12.7).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return serveCsvExport(request, {
    exportName: "audit",
    route: "/audit",
    path: AUDIT_EXPORT_PATH,
    filenameStem: "audit-log",
    attempted: "export.audit",
    mayExport: (role) => mayExportList(role, "/audit"),
    deniedDetail:
      "Your role cannot read the audit log, so it cannot export it. Ask a Facility Manager or an Admin if you need this.",
    tooLargeDetail: (total) =>
      `This range holds ${total} events, which is more than one file carries. Narrow the date range — or the actor or event type — and export again.`,
    read: async (ctx, url, organization) => {
      const query = decodeListQuery(
        auditExportSearchParams(url),
        AUDIT_LIST_SPEC,
      );
      const timeZone = organization.timeZone;
      const directory = await readAuditActorDirectory(ctx);
      const eventQuery = toAuditEventQuery(query, timeZone);
      const read = await readEveryPage((page) =>
        data.auditEvents.list(ctx, { ...eventQuery, ...page }),
      );
      if (read.kind === "too_large") return read;
      return {
        kind: "file",
        file: {
          headers: AUDIT_CSV_HEADERS,
          rows: read.rows.map((event) =>
            auditCsvRow(toAuditRowView(event, directory, ctx.role, timeZone)),
          ),
          scope: exportScope(query.filters, AUDIT_FILTER_IDS, query.q),
        },
      };
    },
  });
}
