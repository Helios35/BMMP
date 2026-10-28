import type { ReactElement } from "react";

import type { RecordTableColumn } from "@/components/record-table/record-table";
import { StatusBadge } from "@/components/status/status-badge";
import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import { absoluteInstant } from "@/features/battery-record/format-instant";
import { cn } from "@/lib/utils";

import { LotRowActions } from "./components/lot-controls";
import {
  LOT_COLUMN_ACTIONS,
  LOT_COLUMN_CONTAINERS,
  LOT_COLUMN_DESCRIPTION,
  LOT_COLUMN_EARLIEST,
  LOT_COLUMN_ID,
  LOT_COLUMN_STATUS,
  LOT_NO_CONTAINERS,
  LOT_NO_DESCRIPTION,
  LOT_NO_START,
  LOT_OVERDUE,
} from "./container-copy";
import type { LotListRow } from "./server/read-lots";

/**
 * The Lots view's columns — Rules 4.23, 4.24; T-25.
 *
 * **No fill meter and no clock meter**, because a lot has neither (Rule
 * 4.23): it reports the earliest accumulation start among its containers, and
 * reads overdue where any of them is (Rule 4.24). The overdue reading is a
 * sentence beside the date, never a colour alone. Rows do not link — a lot has
 * no page of its own — and each container is named so the reader can find it.
 */

function EarliestStart({
  row,
  timeZone,
}: {
  readonly row: LotListRow;
  readonly timeZone: string;
}): ReactElement {
  const start = row.standing.earliestAccumulationStart;
  return (
    <span className="flex flex-col gap-1" data-lot-earliest-start={start ?? ""}>
      <span className="tabular">
        {start === null ? LOT_NO_START : absoluteInstant(start, timeZone)}
      </span>
      {row.standing.isOverdue ? (
        <span
          data-lot-overdue="true"
          className={cn("text-caption", INTENT_TEXT_CLASSES.critical)}
        >
          {LOT_OVERDUE}
        </span>
      ) : null}
    </span>
  );
}

export function lotColumns(
  timeZone: string,
  canManage: boolean,
): readonly RecordTableColumn<LotListRow>[] {
  return [
    {
      id: "lotCode",
      header: LOT_COLUMN_ID,
      mono: true,
      primary: true,
      cell: (row) => row.lot.lotCode,
    },
    {
      id: "description",
      header: LOT_COLUMN_DESCRIPTION,
      secondary: true,
      cell: (row) => row.lot.description ?? LOT_NO_DESCRIPTION,
    },
    {
      id: "containers",
      header: LOT_COLUMN_CONTAINERS,
      cell: (row) => (
        <span className="font-mono" data-lot-members={row.lot.lotCode}>
          {row.members.length === 0
            ? LOT_NO_CONTAINERS
            : row.members.map((member) => member.containerCode).join(", ")}
        </span>
      ),
    },
    {
      id: "earliestStart",
      header: LOT_COLUMN_EARLIEST,
      cell: (row) => <EarliestStart row={row} timeZone={timeZone} />,
    },
    {
      id: "status",
      header: LOT_COLUMN_STATUS,
      status: true,
      cell: (row) => (
        <StatusBadge system="lot_status" value={row.lot.status} size="sm" />
      ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: LOT_COLUMN_ACTIONS,
            srOnlyHeader: true as const,
            cell: (row: LotListRow) => (
              <LotRowActions
                lotId={row.lot.id}
                lotCode={row.lot.lotCode}
                status={row.lot.status}
              />
            ),
          },
        ]
      : []),
  ];
}
