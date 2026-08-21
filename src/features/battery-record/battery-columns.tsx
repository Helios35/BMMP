import Link from "next/link";

import type { RecordTableColumn } from "@/components/record-table/record-table";
import { StatusBadge } from "@/components/status/status-badge";
import { canReadRoute } from "@/domain/access/route-capability";
import {
  CELL_FORM_FACTORS,
  CELL_FORM_FACTOR_LABELS,
} from "@/domain/taxonomy/cell-form-factor";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import type { RoleCode } from "@/domain/taxonomy/role";
import { relativeTimeLabel } from "@/features/shell/chrome/relative-time";
import type { BatteryRecord } from "@/types/battery-record";
import type { IsoTimestamp, TimeZone, Uuid } from "@/types/common";
import type { Container, StorageClock } from "@/types/storage";
import { absoluteInstant, UNPLACED_RECORD_TIME_ZONE } from "./format-instant";
import { NotRecorded, TaxonomyText } from "./record-display";

/**
 * The `/batteries` columns — `UX_SPEC.md` §3.5.
 *
 * **A small mobility-device pack and a vehicle traction pack render as adjacent
 * rows through this one set of cells.** There is no branch on
 * `applicationClass`, no variant renderer and no column only one of them fills:
 * `BR-0001` carries 288 cells and 78,100 Wh, `BR-0002` carries neither, and the
 * second renders `Not recorded` in the same cell function as the first
 * (`SITE_ARCHITECTURE.md` §7.8, Rule 1.24). Null-heavy rows are normal — hiding
 * a column or fabricating a value to avoid one is the failure this table exists
 * to make visible.
 *
 * ## Column 4 is T-04, not T-06
 *
 * **`Form factor` is `cell_form_factor` — the physical cell shape.** It is not
 * `format_category`, which is a jurisdiction-scoped band on
 * `format_classification` keyed on `(battery_record, jurisdiction,
 * rule_version)`. `BATTERY.mobilityScooter` carries two of those at once —
 * `medium_format` under Washington and `not_covered` under federal scope — which
 * is exactly why no single value for it can render in a column, and **no screen
 * in B1a renders one** (`SITE_ARCHITECTURE.md` §7.6b).
 *
 * ## The table takes no access decision
 *
 * Whether a container cell links is answered here, from `ROUTE_ACCESS`, and
 * passed to `RecordTable` as rendered output (§5.3(7)).
 */

export interface BatteryColumnContext {
  readonly role: RoleCode;
  readonly containersById: ReadonlyMap<Uuid, Container>;
  /** Keyed by container, because a battery's tier is its container's clock. */
  readonly clocksByContainerId: ReadonlyMap<Uuid, StorageClock>;
  /** One server instant for the whole render, so no two rows disagree. */
  readonly asOf: IsoTimestamp;
}

export function batteryColumns(
  context: BatteryColumnContext,
): readonly RecordTableColumn<BatteryRecord>[] {
  const canOpenContainer = canReadRoute(context.role, "/containers/[id]");

  return [
    {
      id: "recordNumber",
      header: "Record ID",
      sortable: true,
      mono: true,
      primary: true,
      cell: (row) => row.recordNumber,
    },
    {
      id: "manufacturerName",
      header: "Manufacturer / model",
      sortable: true,
      secondary: true,
      cell: (row) => <ManufacturerAndModel record={row} />,
    },
    {
      id: "chemistry",
      header: "Chemistry",
      cell: (row) => (
        <TaxonomyText
          system="chemistry"
          read={
            row.chemistry === null
              ? null
              : readTaxonomyValue(CHEMISTRIES, CHEMISTRY_LABELS, row.chemistry)
          }
        />
      ),
    },
    {
      id: "cellFormFactor",
      header: "Form factor",
      cell: (row) => (
        <TaxonomyText
          system="cell_form_factor"
          read={readTaxonomyValue(
            CELL_FORM_FACTORS,
            CELL_FORM_FACTOR_LABELS,
            row.cellFormFactor,
          )}
        />
      ),
    },
    {
      id: "assessedCondition",
      header: "Assessed condition",
      sortable: true,
      status: true,
      cell: (row) => (
        <StatusBadge
          system="assessed_condition"
          value={row.assessedCondition}
          size="sm"
        />
      ),
    },
    {
      id: "container",
      header: "Container",
      cell: (row) => (
        <ContainerCell
          container={
            row.containerId === null
              ? undefined
              : context.containersById.get(row.containerId)
          }
          canOpenContainer={canOpenContainer}
        />
      ),
    },
    {
      id: "clockTier",
      header: "Storage clock tier",
      cell: (row) => (
        <StatusBadge
          system="storage_clock_alert_band"
          value={clockFor(row, context)?.alertBand}
          size="sm"
        />
      ),
    },
    {
      id: "createdAt",
      header: "Logged",
      sortable: true,
      cell: (row) => (
        <LoggedCell
          loggedAt={row.createdAt}
          asOf={context.asOf}
          timeZone={siteTimeZoneFor(row, context)}
        />
      ),
    },
  ];
}

function clockFor(
  record: BatteryRecord,
  context: BatteryColumnContext,
): StorageClock | undefined {
  if (record.containerId === null) return undefined;
  return context.clocksByContainerId.get(record.containerId);
}

/**
 * The zone a record's instants are read in — its container's site.
 *
 * A record with no placement has no site, and the fallback is **stated beside
 * the value** rather than assumed (Rule 4.29).
 */
function siteTimeZoneFor(
  record: BatteryRecord,
  context: BatteryColumnContext,
): TimeZone {
  if (record.containerId === null) return UNPLACED_RECORD_TIME_ZONE;
  return (
    context.containersById.get(record.containerId)?.siteTimeZone ??
    UNPLACED_RECORD_TIME_ZONE
  );
}

function ManufacturerAndModel({ record }: { readonly record: BatteryRecord }) {
  if (record.manufacturerName === null && record.modelName === null) {
    return <NotRecorded />;
  }
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span>{record.manufacturerName ?? NOT_RECORDED_TEXT}</span>
      <span aria-hidden="true" className="text-muted-foreground">
        &middot;
      </span>
      <span>{record.modelName ?? NOT_RECORDED_TEXT}</span>
    </span>
  );
}

/** Kept as a string here because it sits inline between two other spans. */
const NOT_RECORDED_TEXT = "Not recorded";

function ContainerCell({
  container,
  canOpenContainer,
}: {
  readonly container: Container | undefined;
  readonly canOpenContainer: boolean;
}) {
  if (container === undefined) return <NotRecorded />;
  if (!canOpenContainer) {
    // No link, no cursor change, nothing suggesting the row can be opened —
    // /containers/[id] is not this role's (SITE_ARCHITECTURE.md §5.4).
    return <span data-container-link="false">{container.containerCode}</span>;
  }
  return (
    <Link
      href={`/containers/${container.id}`}
      data-container-link="true"
      data-inline-target="true"
      className="rounded-md underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      {container.containerCode}
    </Link>
  );
}

/**
 * When the record was logged: relative in the cell, absolute in the tooltip.
 *
 * The absolute form is repeated for a screen reader rather than left to the
 * `title`, so the exact instant is never reachable by hover alone (§1.5), and it
 * carries the site's zone because a bare time on a compliance record is a
 * question rather than a fact (Rule 4.29).
 */
function LoggedCell({
  loggedAt,
  asOf,
  timeZone,
}: {
  readonly loggedAt: IsoTimestamp;
  readonly asOf: IsoTimestamp;
  readonly timeZone: TimeZone;
}) {
  const absolute = absoluteInstant(loggedAt, timeZone);
  return (
    <>
      <span title={absolute} className="tabular">
        {relativeTimeLabel(loggedAt, asOf)}
      </span>
      <span className="sr-only">{absolute}</span>
    </>
  );
}
