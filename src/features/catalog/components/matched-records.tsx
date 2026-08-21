import Link from "next/link";
import type { ReactElement } from "react";

import { StatusBadge } from "@/components";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BatteryRecord } from "@/types/battery-record";
import { catalogDateLabel } from "@/features/catalog/catalog-entry-display";

/**
 * The battery records matched to this catalog entry — `UX_SPEC.md` §3.16.
 *
 * **Tenant-scoped by the seam, and by nothing here.** `batteryRecords.list`
 * returns the caller's organisation and only that, so a record another tenant
 * matched to the same global entry is not absent from this table by a filter —
 * it never arrived (Rule 1.2). Against the fixtures that is
 * `BATTERY.rainierScooter`, invisible to Cascade, and it is the tenant-scoping
 * assertion for this route.
 *
 * `assessedCondition` renders through `StatusBadge`, which already implements
 * the unrecognised-value path: the fixtures store `damaged` where T-49 authors
 * `damaged_or_defective`, so today the badge shows the stored value in mono and
 * after the fixture migration it shows the authored label — **with no change
 * here** (`TAXONOMY.md` §5.8).
 *
 * Nothing on this table is a format band, a grade or a hazard ranking.
 */

export const NO_MATCHED_RECORDS = "No records are matched to this entry yet.";

export interface MatchedRecordsProps {
  readonly records: readonly BatteryRecord[];
  /** From `canReadRoute(role, "/batteries/[id]")`, resolved by the route. */
  readonly canOpenRecord: boolean;
}

export function MatchedRecords({
  records,
  canOpenRecord,
}: MatchedRecordsProps): ReactElement {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-h2">Matched records</CardTitle>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p data-matched-state="empty" className="text-body">
            {NO_MATCHED_RECORDS}
          </p>
        ) : (
          <Table data-matched-state="default">
            <TableCaption className="sr-only">
              Battery records matched to this catalog entry
            </TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col" className="h-11 px-3 text-label">
                  Record
                </TableHead>
                <TableHead scope="col" className="h-11 px-3 text-label">
                  Assessed condition
                </TableHead>
                <TableHead scope="col" className="h-11 px-3 text-label">
                  Logged
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow
                  key={record.id}
                  className="h-14 border-border lg:h-12"
                >
                  <TableCell className="px-3 py-2 text-mono">
                    {canOpenRecord ? (
                      <Link
                        href={`/batteries/${record.id}`}
                        className="inline-flex min-h-11 items-center rounded-md underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                      >
                        {record.recordNumber}
                      </Link>
                    ) : (
                      record.recordNumber
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    {/* T-49, through the one intent map. The component never
                        picks a colour and this file never writes a label. */}
                    <StatusBadge
                      system="assessed_condition"
                      value={record.assessedCondition}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-2 text-body">
                    {catalogDateLabel(record.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
