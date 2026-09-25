import Link from "next/link";
import type { ReactElement } from "react";
import { Boxes, FilterX, Info, PackageOpen } from "lucide-react";

import { EmptyState, SectionCard } from "@/components/page";
import {
  clearNarrowingHref,
  encodeListQuery,
  type ListQuery,
  type ListQuerySpec,
} from "@/components/record-table/list-url";
import {
  RecordTableFilters,
  type RecordTableFilter,
} from "@/components/record-table/record-table-filters";
import { PageToolbar } from "@/components/page/page-layout";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { StorageClockMeter } from "@/components/storage/storage-clock-meter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  ALL_IDENTIFIED,
  CLEAR_FILTERS,
  FILTERED_EMPTY_BODY,
  FILTERED_EMPTY_TITLE,
  NO_CONTAINER_NAMED,
  ALL_IDENTIFIED_ACTION,
  COLUMN_AGE,
  COLUMN_CLASS,
  COLUMN_CLOCK,
  COLUMN_FLAGGED,
  COLUMN_RECORD,
  COLUMN_SITE,
  flaggedFieldsLabel,
  INVENTORY_CAPTION,
  NO_CLOCK_RUNNING,
  NO_CONTAINER_GROUP,
  NO_CONTAINER_GROUP_NOTE,
  OPEN_CONTAINER,
  rollUpLabel,
  SEE_CLOCK_ALERTS,
  UNIDENTIFIED_WHY,
  unidentifiedHeadline,
} from "../review-copy";
import { REVIEW_ITEM_PARAM, REVIEW_ROUTE } from "../review-hrefs";
import type {
  InventoryContainer,
  InventoryGroupView,
  UnidentifiedInventory,
} from "../server/inventory";

/**
 * P2's `/review` — the unidentified-inventory view (`UX_SPEC.md` §3.8b,
 * §4.2, E-8b, E-15; `SITE_ARCHITECTURE.md` Flow C step C5, CL-1).
 *
 * **Composed for her question, not inherited from P1.** Grouped by the
 * container each item is keyed on, with a roll-up row per container; the
 * container's storage-clock tier and segregation class are columns, because
 * an unidentified battery cannot be classified, so it cannot be checked
 * against its container's class or clocked against the right period
 * (Rules 2.8, 3.3, 4.28, 4.5). A neutral alert says what the screen is for.
 *
 * **What is deliberately absent — not disabled.** `ExtractionReviewCard`,
 * Confirm, Confirm all, Change, Reject, Void and Confirm and commit do not
 * render here. No `ReadOnlyBanner` either: a banner announcing what she
 * cannot do is the wrong frame (E-8b). The server refuses her confirm or void
 * independently (`features/review/actions.ts`); this composition is a
 * courtesy, never the enforcement.
 *
 * What she can do renders at primary weight: open the container, open the
 * record (from the summary panel), see the storage-clock alerts.
 */

export interface UnidentifiedInventoryProps {
  readonly inventory: UnidentifiedInventory;
  readonly query: ListQuery;
  readonly querySpec: ListQuerySpec;
  readonly filters: readonly RecordTableFilter[];
  readonly asOf: string;
  readonly canOpenContainer: boolean;
  readonly canSeeContainerAlerts: boolean;
}

export function UnidentifiedInventoryView({
  inventory,
  query,
  querySpec,
  filters,
  asOf,
  canOpenContainer,
  canSeeContainerAlerts,
}: UnidentifiedInventoryProps): ReactElement {
  if (inventory.total === 0) {
    // E-15 for P2 — her assurance, styled as the good state it is.
    return (
      <EmptyState
        icon={Boxes}
        intent="ok"
        title={ALL_IDENTIFIED}
        action={
          canOpenContainer || canSeeContainerAlerts
            ? { label: ALL_IDENTIFIED_ACTION, href: "/containers" }
            : null
        }
        dataAttributes={{ "data-review-empty": "all-identified" }}
      />
    );
  }

  const selectHref = (itemId: string) =>
    encodeListQuery(REVIEW_ROUTE, query, {}, querySpec, {
      ...query.passthrough,
      [REVIEW_ITEM_PARAM]: itemId,
    });

  return (
    <div data-unidentified-inventory="true" className="flex flex-col gap-6">
      <Alert
        role="status"
        data-inventory-purpose="true"
        data-intent="neutral"
        className={cn("gap-2 border", INTENT_SURFACE_CLASSES.neutral)}
      >
        <Info aria-hidden="true" />
        <AlertTitle className="text-body-strong text-balance">
          {unidentifiedHeadline(inventory.total)}
        </AlertTitle>
        <AlertDescription className="max-w-[72ch] text-body text-current">
          {UNIDENTIFIED_WHY}
        </AlertDescription>
      </Alert>

      <PageToolbar
        filters={
          <RecordTableFilters
            basePath={REVIEW_ROUTE}
            query={query}
            spec={querySpec}
            filters={filters}
          />
        }
        actions={
          canSeeContainerAlerts ? (
            <Button
              asChild
              variant="outline"
              size="lg"
              className="min-h-11 rounded-md text-label"
            >
              <Link
                href="/containers?filter=alerting"
                data-see-clock-alerts="true"
              >
                {SEE_CLOCK_ALERTS}
              </Link>
            </Button>
          ) : undefined
        }
      />

      {inventory.groups.length === 0 ? (
        // E-15 — filters exclude everything. Never the all-identified copy.
        <EmptyState
          icon={FilterX}
          title={FILTERED_EMPTY_TITLE}
          description={FILTERED_EMPTY_BODY}
          action={{
            label: CLEAR_FILTERS,
            href: clearNarrowingHref(REVIEW_ROUTE, query, querySpec),
            testId: "clear-narrowing",
            dataAttributes: { "data-clear-narrowing": "true" },
          }}
          dataAttributes={{ "data-table-empty": "filtered" }}
        />
      ) : (
        inventory.groups.map((group) => (
          <InventoryGroupSection
            key={group.container?.id ?? "no-container"}
            group={group}
            asOf={asOf}
            selectHref={selectHref}
            canOpenContainer={canOpenContainer}
          />
        ))
      )}
    </div>
  );
}

function InventoryGroupSection({
  group,
  asOf,
  selectHref,
  canOpenContainer,
}: {
  readonly group: InventoryGroupView;
  readonly asOf: string;
  readonly selectHref: (itemId: string) => string;
  readonly canOpenContainer: boolean;
}): ReactElement {
  const container = group.container;
  return (
    <SectionCard
      headingLevel={2}
      title={
        container === null ? (
          NO_CONTAINER_GROUP
        ) : (
          <span data-rollup-row="true">
            {rollUpLabel({
              containerCode: container.code,
              unidentified: group.rows.length,
              total: container.placedCount + group.rows.length,
              clockTier: container.clockTierLabel,
              classLabel: container.classLabel,
            })}
          </span>
        )
      }
      description={
        container === null ? NO_CONTAINER_GROUP_NOTE : container.site
      }
      action={
        container !== null && canOpenContainer ? (
          <Button asChild size="lg" className="min-h-11 rounded-md text-label">
            <Link
              href={`/containers/${container.id}`}
              data-open-container={container.id}
            >
              <PackageOpen aria-hidden="true" />
              {OPEN_CONTAINER}
            </Link>
          </Button>
        ) : undefined
      }
      dataAttributes={{
        "data-inventory-group": container?.id ?? "none",
      }}
    >
      {/* From lg: the grouped table. Six columns and a wrapped address do not
          fit beside the navigation at tablet width, and a table that scrolls
          sideways hides the two columns her question is about. */}
      <div className="hidden lg:block">
        <Table>
          <TableCaption className="sr-only">{INVENTORY_CAPTION}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 px-3 text-label">
                {COLUMN_RECORD}
              </TableHead>
              <TableHead className="h-11 px-3 text-label">
                {COLUMN_SITE}
              </TableHead>
              <TableHead className="h-11 px-3 text-label">
                {COLUMN_AGE}
              </TableHead>
              <TableHead className="h-11 px-3 text-label">
                {COLUMN_CLOCK}
              </TableHead>
              <TableHead className="h-11 px-3 text-label">
                {COLUMN_CLASS}
              </TableHead>
              <TableHead className="h-11 px-3 text-right text-label">
                {COLUMN_FLAGGED}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.rows.map((row) => (
              <TableRow
                key={row.id}
                data-inventory-row={row.id}
                className="h-14 lg:h-12"
              >
                <TableCell className="px-3 py-2 text-mono">
                  <Link
                    href={selectHref(row.id)}
                    scroll={false}
                    data-open-summary={row.id}
                    className="inline-flex min-h-11 items-center rounded-md underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {row.recordNumber}
                  </Link>
                </TableCell>
                {/* An address wraps rather than pushing the clock and the
                    class — the columns her question is about — off screen. */}
                <TableCell className="max-w-56 min-w-40 px-3 py-2 text-body whitespace-normal">
                  {row.site}
                </TableCell>
                <TableCell className="px-3 py-2 text-body">
                  {row.ageLabel}
                </TableCell>
                <TableCell className="px-3 py-2">
                  <ClockCell container={container} asOf={asOf} />
                </TableCell>
                <TableCell
                  className={cn(
                    "px-3 py-2",
                    container !== null && !container.classRecognised
                      ? "text-mono"
                      : "text-body",
                  )}
                >
                  {container?.classLabel ?? NO_CONTAINER_NAMED}
                </TableCell>
                <TableCell className="tabular px-3 py-2 text-right text-body">
                  {row.flaggedFieldCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Below lg: the roll-up above is the row she acts on; each item is one
          line that opens the summary as a sheet (§4.2). */}
      <ul
        aria-label={INVENTORY_CAPTION}
        data-inventory-cards="true"
        className="flex flex-col gap-2 lg:hidden"
      >
        {group.rows.map((row) => (
          <li key={row.id}>
            <Link
              href={selectHref(row.id)}
              scroll={false}
              data-open-summary-card={row.id}
              className="flex min-h-14 flex-col justify-center gap-1 rounded-lg border border-border p-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-muted"
            >
              <span className="text-mono">{row.recordNumber}</span>
              <span className="text-caption text-muted-foreground">
                {row.ageLabel} · {flaggedFieldsLabel(row.flaggedFieldCount)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function ClockCell({
  container,
  asOf,
}: {
  readonly container: InventoryContainer | null;
  readonly asOf: string;
}): ReactElement {
  if (container === null || container.clock === null) {
    return (
      <span className="text-body text-muted-foreground">
        {NO_CLOCK_RUNNING}
      </span>
    );
  }
  return (
    <StorageClockMeter
      clock={container.clock}
      label={`Storage clock for container ${container.code}`}
      asOf={asOf}
      size="sm"
    />
  );
}
