import { data } from "@/data";
import { mayExportList } from "@/domain/access/export";
import {
  BATTERY_CSV_HEADERS,
  batteryCsvRow,
} from "@/features/battery-record/battery-csv";
import {
  BATTERY_EXPORT_PATH,
  BATTERY_FILTER_IDS,
} from "@/features/battery-record/list-query";
import { readBatteryListRequest } from "@/features/battery-record/server/list-read";
import {
  exportScope,
  readEveryPage,
  serveCsvExport,
} from "@/lib/export/csv-export";
import type { RecallMatch } from "@/types/condition";

/**
 * `GET /api/exports/batteries` — `/batteries` as CSV (`UX_SPEC.md` §3.5; D-50;
 * `TECHNICAL_SPEC.md` §7.1).
 *
 * P2, P5 and P6 (`SITE_ARCHITECTURE.md` §5.2). The URL is decoded by the read
 * the page itself uses, so the file holds exactly the list the screen was
 * showing, tenant-scoped through the adapter (Rule 12.17); every file writes
 * `export.generated` (Rule 12.18); a lapsed P5 grant produces nothing
 * (Rule 12.19). Served by `serveCsvExport`, the one export pattern.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return serveCsvExport(request, {
    exportName: "batteries",
    route: "/batteries",
    path: BATTERY_EXPORT_PATH,
    filenameStem: "battery-records",
    attempted: "export.batteries",
    mayExport: (role) => mayExportList(role, "/batteries"),
    deniedDetail:
      "Your role reads the battery records and does not export them. A Facility Manager, an Auditor or an Admin can.",
    tooLargeDetail: (total) =>
      `This list holds ${total} records, which is more than one file carries. Narrow it — by date, chemistry or container — and export again.`,
    read: async (ctx, url) => {
      const request = await readBatteryListRequest(
        ctx,
        Object.fromEntries(url.searchParams.entries()),
      );
      const read = await readEveryPage((page) =>
        data.batteryRecords.list(ctx, { ...request.query, ...page }),
      );
      if (read.kind === "too_large") return read;
      // Rules 6.24, 10.16 — every association, dismissed and withdrawn ones
      // included, beside the record it is on.
      const recalls = await readEveryPage((page) =>
        data.recalls.listMatches(ctx, page),
      );
      if (recalls.kind === "too_large") return recalls;
      const recallsByRecordId = new Map<string, RecallMatch[]>();
      for (const match of recalls.rows) {
        const list = recallsByRecordId.get(match.batteryRecordId) ?? [];
        list.push(match);
        recallsByRecordId.set(match.batteryRecordId, list);
      }
      // Rule 1.29 — Identified by: a session whose label read supplied a value.
      const extractions = await readEveryPage((page) =>
        data.labelExtractions.list(ctx, page),
      );
      if (extractions.kind === "too_large") return extractions;
      const readSessions = new Set(
        extractions.rows
          .filter((row) => row.fieldValue !== null)
          .map((row) => row.intakeSessionId),
      );
      const identifiedByModelRecordIds = new Set(
        read.rows
          .filter(
            (record) =>
              record.intakeSessionId !== null &&
              readSessions.has(record.intakeSessionId),
          )
          .map((record) => record.id),
      );
      // Damage assessed by — the current assessment's T-59 method, as stored.
      const assessments = await readEveryPage((page) =>
        data.damageAssessments.list(ctx, { isCurrent: true, ...page }),
      );
      if (assessments.kind === "too_large") return assessments;
      const assessmentMethodByRecordId = new Map<string, string>();
      for (const assessment of [...assessments.rows].sort((a, b) =>
        a.assessedAt.localeCompare(b.assessedAt),
      )) {
        assessmentMethodByRecordId.set(
          assessment.batteryRecordId,
          assessment.assessmentMethod,
        );
      }
      return {
        kind: "file",
        file: {
          headers: BATTERY_CSV_HEADERS,
          rows: read.rows.map((record) =>
            batteryCsvRow(record, {
              ...request,
              recallsByRecordId,
              identifiedByModelRecordIds,
              assessmentMethodByRecordId,
            }),
          ),
          scope: exportScope(
            request.listQuery.filters,
            BATTERY_FILTER_IDS,
            request.listQuery.q,
          ),
        },
      };
    },
  });
}
