import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  FilterX,
  Info,
  SearchX,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Table,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  INTENT_SURFACE_CLASSES,
  INTENT_TEXT_CLASSES,
} from "@/components/status/intent-classes";
import { cn } from "@/lib/utils";
import {
  activeFilterCount,
  clearNarrowingHref,
  encodeListQuery,
  isNarrowed,
  type ListQuery,
  type ListQuerySpec,
  type SortDirection,
} from "./list-url";
import { RecordTableKeyboard } from "./record-table-keyboard";
import {
  RecordTableFilters,
  type RecordTableFilter,
} from "./record-table-filters";
import { RecordTableSearch } from "./record-table-search";

/**
 * `RecordTable` — `UX_SPEC.md` §2.7. The list behind `/batteries`, `/catalog`,
 * `/containers`, `/shipments`, `/review` and `/audit`.
 *
 * **It is a server component.** Cells are produced by calling `column.cell(row)`
 * during the server render, so a route may put any `ReactNode` in one — a
 * `StatusBadge`, a `StorageClockMeter`, a formatted date — without a
 * serialization problem. Sorting and paging need no JavaScript at all: headers
 * and page controls are `<Link>`s built by the URL codec. Only the search box,
 * the filter controls and the arrow-key handler are client islands.
 *
 * **Two empties, never one.** *No records at all* is the route's onboarding
 * state and belongs to the route. *The filters exclude everything* is this
 * component's, and it is a different sentence with a different action — showing
 * onboarding copy to someone who just mistyped a filter is a defect, not a
 * shortcut (§2.7).
 *
 * **It makes no access decision.** Whether a row opens is answered per row by
 * `rowLink`, which the route computes from `ROUTE_ACCESS`. That is what lets
 * `/containers` render rows that are not links for P3, P4 and P5 —
 * `SITE_ARCHITECTURE.md` §5.4 — without this file changing.
 */

/** 56px touch, 48px from `lg` (§1.4). The skeleton matches, so nothing jumps. */
const ROW_HEIGHT_CLASS = "h-14 lg:h-12";

export interface RecordTableColumn<TRow> {
  /**
   * Stable identifier. **This is the value that appears in `?sort=`**, so it is
   * part of every shared link and never changes casually.
   */
  readonly id: string;
  readonly header: string;
  readonly cell: (row: TRow) => ReactNode;
  /** Sortable columns render their header as a link with a persistent indicator. */
  readonly sortable?: boolean;
  /** `end` for quantities and counts. Default `start`. */
  readonly align?: "start" | "end";
  /** IDs, serials, part numbers, date codes — the `mono` token, §1.3. */
  readonly mono?: boolean;
  /** Exactly one column. `body-strong`, and the row's link target. */
  readonly primary?: true;
  /** At most one. The second line of the mobile card. */
  readonly secondary?: true;
  /** At most one. The `StatusBadge` shown on the mobile card. */
  readonly status?: true;
  /** Header text is for screen readers only — an actions column. */
  readonly srOnlyHeader?: true;
}

/**
 * Whether a row opens, for this role, and why not when it does not.
 *
 * `SITE_ARCHITECTURE.md` §5.4 — the `/containers` → `/containers/[id]`
 * asymmetry, the one place in B1a where a list is broader than its detail. For
 * P3, P4 and P5 container rows are **not links**: the row renders its data, the
 * cursor does not change, the reason is stated, and **there is no navigation
 * attempt, no redirect and no toast** — there is nothing to intercept because
 * there is no navigation.
 */
export type RecordTableRowLink =
  | { readonly kind: "link"; readonly href: string }
  | { readonly kind: "not-linked"; readonly reason: string };

export interface RecordTableFilteredEmpty {
  /** Lowercase plural noun for this route — "batteries", "catalog entries". */
  readonly noun?: string;
  /**
   * Route-authored headline, where the route's own copy is more precise than
   * *"No &lt;noun&gt; match these filters"* — `/audit`'s *"No activity in this
   * range."* is the case this exists for.
   */
  readonly title?: string;
  /** Scoped hint shown when the narrowing was a search rather than a filter. */
  readonly searchSuggestion?: string;
}

export interface RecordTableErrorState {
  /** Plain language. Never a stack trace, a SQL error or an internal id (§10.3). */
  readonly message: string;
  /** Shown on any 5xx so support can find the trace. Never on a 4xx. */
  readonly correlationId?: string;
}

export interface RecordTableProps<TRow> {
  /** Visually hidden `<caption>`. Required — a table with no accessible name is a defect. */
  readonly caption: string;
  readonly columns: readonly RecordTableColumn<TRow>[];
  readonly rows: readonly TRow[];
  readonly rowKey: (row: TRow) => string;
  readonly rowLink: (row: TRow) => RecordTableRowLink;
  /** `Page.total` from the adapter — the footer count, and what paging is built from. */
  readonly total: number;
  /** The decoded URL state this render was produced from. */
  readonly query: ListQuery;
  /** The same spec the route decoded with, so every link omits what is default. */
  readonly querySpec: ListQuerySpec;
  /** The route the codec writes hrefs against, e.g. `/batteries`. */
  readonly basePath: string;
  readonly searchPlaceholder?: string;
  readonly filters?: readonly RecordTableFilter[];
  /** The route's zero-records state (§5). Role-aware; composed by the route, not here. */
  readonly emptyState: ReactNode;
  readonly filteredEmpty?: RecordTableFilteredEmpty;
  /** Present only when the read failed. */
  readonly error?: RecordTableErrorState;
  /** Primary action and export, right of the search box. The route role-gates it. */
  readonly toolbar?: ReactNode;
  readonly className?: string;
}

export function RecordTable<TRow>({
  caption,
  columns,
  rows,
  rowKey,
  rowLink,
  total,
  query,
  querySpec,
  basePath,
  searchPlaceholder = "Search",
  filters = [],
  emptyState,
  filteredEmpty,
  error,
  toolbar,
  className,
}: RecordTableProps<TRow>): ReactElement {
  const narrowed = isNarrowed(query);
  const state: "default" | "error" | "empty" =
    error !== undefined ? "error" : rows.length === 0 ? "empty" : "default";
  const emptyKind =
    state !== "empty"
      ? undefined
      : !narrowed
        ? "zero-records"
        : query.q !== null && activeFilterCount(query) === 0
          ? "search"
          : "filtered";

  return (
    <div
      data-table-state={state}
      data-empty-kind={emptyKind}
      className={cn("flex w-full flex-col gap-4", className)}
    >
      {/* Header. It survives every state — a reader who hit an error or an empty
          result keeps their search, their filters and their bearings (§2.7). */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <RecordTableSearch
            basePath={basePath}
            query={query}
            spec={querySpec}
            placeholder={searchPlaceholder}
          />
          <RecordTableFilters
            basePath={basePath}
            query={query}
            spec={querySpec}
            filters={filters}
          />
        </div>
        {toolbar !== undefined ? (
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        ) : null}
      </div>

      {state === "error" && error !== undefined ? (
        <RecordTableError
          error={error}
          basePath={basePath}
          query={query}
          spec={querySpec}
        />
      ) : state === "empty" ? (
        emptyKind === "zero-records" ? (
          <div data-table-empty="zero-records">{emptyState}</div>
        ) : (
          <FilteredEmpty
            kind={emptyKind === "search" ? "search" : "filtered"}
            query={query}
            copy={filteredEmpty}
            href={clearNarrowingHref(basePath, query, querySpec)}
          />
        )
      ) : (
        <>
          <div className="hidden md:block">
            {/* Type size is set on the cells, not here: a class applied to the
                cell always beats one inherited from the table. */}
            <Table>
              <TableCaption className="sr-only">{caption}</TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {columns.map((column) => (
                    <ColumnHeader
                      key={column.id}
                      column={column}
                      query={query}
                      spec={querySpec}
                      basePath={basePath}
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <RecordTableKeyboard>
                {rows.map((row) => (
                  <DataRow
                    key={rowKey(row)}
                    row={row}
                    columns={columns}
                    link={rowLink(row)}
                  />
                ))}
              </RecordTableKeyboard>
            </Table>
          </div>

          <MobileCards
            caption={caption}
            columns={columns}
            rows={rows}
            rowKey={rowKey}
            rowLink={rowLink}
          />
        </>
      )}

      <RecordTableFooter
        rowCount={rows.length}
        total={total}
        query={query}
        spec={querySpec}
        basePath={basePath}
        showPager={state === "default"}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ header */

function ColumnHeader<TRow>({
  column,
  query,
  spec,
  basePath,
}: {
  readonly column: RecordTableColumn<TRow>;
  readonly query: ListQuery;
  readonly spec: ListQuerySpec;
  readonly basePath: string;
}) {
  const isActive = column.sortable === true && query.sort === column.id;
  const ariaSort = isActive
    ? query.dir === "desc"
      ? "descending"
      : "ascending"
    : column.sortable === true
      ? "none"
      : undefined;

  const alignment = column.align === "end" ? "text-right" : "text-left";

  if (column.sortable !== true) {
    return (
      <TableHead scope="col" className={cn("h-11 px-3 text-label", alignment)}>
        <span className={cn(column.srOnlyHeader === true && "sr-only")}>
          {column.header}
        </span>
      </TableHead>
    );
  }

  // A newly chosen column sorts ascending; clicking the active column toggles.
  // Predictable beats clever: the reader can always tell what one more click does.
  const nextDir: SortDirection = isActive
    ? query.dir === "asc"
      ? "desc"
      : "asc"
    : "asc";
  const href = encodeListQuery(
    basePath,
    query,
    { sort: column.id, dir: nextDir },
    spec,
  );
  const Indicator = isActive
    ? query.dir === "desc"
      ? ArrowDown
      : ArrowUp
    : ChevronsUpDown;

  return (
    <TableHead
      scope="col"
      aria-sort={ariaSort}
      className={cn("h-11 px-1 text-label", alignment)}
    >
      <Button
        asChild
        variant="ghost"
        size="lg"
        className="min-h-11 rounded-md text-label"
      >
        <Link href={href} data-sort-column={column.id}>
          <span className={cn(column.srOnlyHeader === true && "sr-only")}>
            {column.header}
          </span>
          {/* The indicator is persistent, not hover-revealed: which column is
              sorted is information, and hover is never the only reveal (§1.5). */}
          <Indicator
            aria-hidden="true"
            className={cn(
              "size-4",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
          />
          <span className="sr-only">
            {isActive
              ? query.dir === "desc"
                ? "Sorted descending. Activate to sort ascending."
                : "Sorted ascending. Activate to sort descending."
              : "Not sorted. Activate to sort ascending."}
          </span>
        </Link>
      </Button>
    </TableHead>
  );
}

/* -------------------------------------------------------------------- rows */

function DataRow<TRow>({
  row,
  columns,
  link,
}: {
  readonly row: TRow;
  readonly columns: readonly RecordTableColumn<TRow>[];
  readonly link: RecordTableRowLink;
}) {
  const navigable = link.kind === "link";

  return (
    <TableRow
      data-row-link={navigable ? "true" : "false"}
      data-row-reason={link.kind === "not-linked" ? link.reason : undefined}
      className={cn(
        "relative border-border",
        ROW_HEIGHT_CLASS,
        navigable
          ? "cursor-pointer hover:bg-muted/50 active:bg-muted has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background"
          : // Not navigable: no wash, no pointer, no ring. Nothing about the row
            // suggests it can be opened, because it cannot (§5.4).
            "cursor-default hover:bg-transparent",
      )}
    >
      {columns.map((column) => {
        const content = column.cell(row);
        const alignment = column.align === "end" ? "text-right" : "text-left";
        // One type token per cell, never two: `text-mono` already carries its
        // own weight, and stacking it with `text-body-strong` would leave `cn`
        // to pick one anyway.
        const typography =
          column.mono === true
            ? "text-mono"
            : column.primary === true
              ? "text-body-strong"
              : "text-body";

        if (column.primary !== true) {
          return (
            <TableCell
              key={column.id}
              className={cn("px-3 py-2", alignment, typography)}
            >
              {content}
            </TableCell>
          );
        }

        return (
          <TableCell
            key={column.id}
            className={cn("px-3 py-2", alignment, typography)}
          >
            {link.kind === "link" ? (
              // One anchor per row: a keyboard user tabs through rows, not
              // through cells, and the pseudo-element makes the whole row the
              // target without nesting interactive elements.
              <Link
                href={link.href}
                data-row-anchor="true"
                className="rounded-md after:absolute after:inset-0 focus-visible:outline-none"
              >
                {content}
              </Link>
            ) : (
              <NotLinkedPrimary reason={link.reason}>
                {content}
              </NotLinkedPrimary>
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/**
 * The primary cell of a row this role cannot open.
 *
 * The reason is reachable two ways and exactly one of them is in the
 * accessibility tree at a time: a `Tooltip` on a focusable span from `md` up,
 * and a persistent caption line below it. §5.4 says "tap to reveal"; a line that
 * is simply there is strictly better on a phone and satisfies §1.5's rule that
 * hover is never the only way to reveal information.
 */
function NotLinkedPrimary({
  reason,
  children,
}: {
  readonly reason: string;
  readonly children: ReactNode;
}) {
  return (
    <>
      <span className="hidden md:inline-flex">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                data-row-reason-trigger="true"
                className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
              >
                {children}
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-caption">{reason}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </span>
      <span className="flex flex-col gap-0.5 md:hidden">
        <span>{children}</span>
        <span
          data-row-reason-line="true"
          className="text-caption text-muted-foreground"
        >
          {reason}
        </span>
      </span>
    </>
  );
}

/* ----------------------------------------------------------- mobile cards */

function MobileCards<TRow>({
  caption,
  columns,
  rows,
  rowKey,
  rowLink,
}: {
  readonly caption: string;
  readonly columns: readonly RecordTableColumn<TRow>[];
  readonly rows: readonly TRow[];
  readonly rowKey: (row: TRow) => string;
  readonly rowLink: (row: TRow) => RecordTableRowLink;
}) {
  const primary = columns.find((column) => column.primary === true);
  const secondary = columns.find((column) => column.secondary === true);
  const status = columns.find((column) => column.status === true);
  if (primary === undefined) return null;

  return (
    <ul
      aria-label={caption}
      data-record-table-cards="true"
      className="flex flex-col gap-2 md:hidden"
    >
      {rows.map((row) => {
        const link = rowLink(row);
        const body = (
          <>
            <span
              className={cn(
                "text-body-strong",
                primary.mono === true && "text-mono",
              )}
            >
              {primary.cell(row)}
            </span>
            {secondary !== undefined ? (
              <span className="text-caption text-muted-foreground">
                {secondary.cell(row)}
              </span>
            ) : null}
            {status !== undefined ? (
              <span className="pt-1">{status.cell(row)}</span>
            ) : null}
          </>
        );

        return (
          <li key={rowKey(row)}>
            {link.kind === "link" ? (
              <Link
                href={link.href}
                data-card-link="true"
                className="flex min-h-14 flex-col justify-center gap-1 rounded-lg border border-border p-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:bg-muted"
              >
                {body}
              </Link>
            ) : (
              <div
                data-card-link="false"
                data-card-reason={link.reason}
                className="flex min-h-14 flex-col justify-center gap-1 rounded-lg border border-border p-3"
              >
                {body}
                <span
                  data-card-reason-line="true"
                  className="text-caption text-muted-foreground"
                >
                  {link.reason}
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------ empty/error */

function FilteredEmpty({
  kind,
  query,
  copy,
  href,
}: {
  readonly kind: "search" | "filtered";
  readonly query: ListQuery;
  readonly copy: RecordTableFilteredEmpty | undefined;
  readonly href: string;
}) {
  const noun = copy?.noun ?? "results";
  const title =
    copy?.title ??
    (kind === "search"
      ? `No matches for "${query.q ?? ""}"`
      : `No ${noun} match these filters`);
  const Icon = kind === "search" ? SearchX : FilterX;

  return (
    <div
      role="status"
      data-table-empty={kind}
      className="flex flex-col items-start gap-2 rounded-lg border border-border p-6"
    >
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
        <p className="text-body-strong">{title}</p>
      </div>
      <p className="max-w-[72ch] text-body text-muted-foreground">
        {kind === "search"
          ? (copy?.searchSuggestion ??
            "Nothing here matched that search. Widen it, or clear it to see everything you can reach.")
          : `Every ${noun} you can reach is still here — these filters just exclude all of them.`}
      </p>
      <Button
        asChild
        variant="outline"
        size="lg"
        className="min-h-11 rounded-md"
      >
        <Link href={href} data-clear-narrowing="true">
          {kind === "search" ? "Clear search" : "Clear filters"}
        </Link>
      </Button>
    </div>
  );
}

function RecordTableError({
  error,
  basePath,
  query,
  spec,
}: {
  readonly error: RecordTableErrorState;
  readonly basePath: string;
  readonly query: ListQuery;
  readonly spec: ListQuerySpec;
}) {
  // Retry is the current URL: the same filters, the same page, one more attempt.
  const retryHref = encodeListQuery(basePath, query, {}, spec);
  return (
    <Alert
      role="alert"
      data-table-error="true"
      className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
    >
      <TriangleAlert
        aria-hidden="true"
        className={INTENT_TEXT_CLASSES.critical}
      />
      <AlertTitle className="text-body-strong">{error.message}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2 text-current">
        {error.correlationId !== undefined ? (
          <span data-correlation-id="true" className="text-mono">
            {error.correlationId}
          </span>
        ) : null}
        <Button
          asChild
          variant="outline"
          size="lg"
          className="min-h-11 rounded-md"
        >
          <Link href={retryHref}>Retry</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/* ------------------------------------------------------------------ footer */

function RecordTableFooter({
  rowCount,
  total,
  query,
  spec,
  basePath,
  showPager,
}: {
  readonly rowCount: number;
  readonly total: number;
  readonly query: ListQuery;
  readonly spec: ListQuerySpec;
  readonly basePath: string;
  readonly showPager: boolean;
}) {
  const from =
    total === 0 || rowCount === 0 ? 0 : (query.page - 1) * query.perPage + 1;
  const to = from === 0 ? 0 : from + rowCount - 1;
  const pageCount = query.perPage > 0 ? Math.ceil(total / query.perPage) : 1;

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <div role="status" aria-live="polite" data-record-count="true">
        <span
          aria-hidden="true"
          className="tabular text-caption text-muted-foreground"
        >
          {total === 0 ? "No results" : `${from}–${to} of ${total}`}
        </span>
        <span className="sr-only">
          {total === 0
            ? "No results."
            : `Showing ${from} to ${to} of ${total} results.`}
        </span>
      </div>

      {showPager && pageCount > 1 ? (
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent className="gap-1">
            {pageWindow(query.page, pageCount).map((entry, index) =>
              entry === null ? (
                <PaginationItem key={`gap-${index}`}>
                  <PaginationEllipsis className="size-11" />
                </PaginationItem>
              ) : (
                <PaginationItem key={entry}>
                  <Button
                    asChild
                    variant={entry === query.page ? "outline" : "ghost"}
                    size="icon-lg"
                    className="tabular size-11 rounded-md"
                  >
                    <Link
                      href={encodeListQuery(
                        basePath,
                        query,
                        { page: entry },
                        spec,
                      )}
                      aria-current={entry === query.page ? "page" : undefined}
                      aria-label={`Go to page ${entry}`}
                    >
                      {entry}
                    </Link>
                  </Button>
                </PaginationItem>
              ),
            )}
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}

/** First, last, the current page and its neighbours. `null` is an ellipsis. */
function pageWindow(
  page: number,
  pageCount: number,
): readonly (number | null)[] {
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const ordered = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let previous = 0;
  for (const value of ordered) {
    if (previous !== 0 && value - previous > 1) out.push(null);
    out.push(value);
    previous = value;
  }
  return out;
}

/* ---------------------------------------------------------------- skeleton */

/**
 * Eight rows at the exact row height (§2.7).
 *
 * **Never a spinner in the middle of an empty page.** The skeleton matches the
 * loaded layout so the list does not jump under a reader's thumb when it lands.
 */
export function RecordTableSkeleton({
  columns,
  rows = 8,
  className,
}: {
  readonly columns: number;
  readonly rows?: number;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      data-table-state="loading"
      className={cn("flex w-full flex-col gap-4", className)}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <Skeleton className="h-11 w-full rounded-md sm:w-80" />
        <Skeleton className="h-11 w-32 rounded-md" />
      </div>
      <div className="flex flex-col">
        <div className="flex h-11 items-center gap-3 border-b border-border px-3">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-4 flex-1 rounded-md" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            key={rowIndex}
            data-skeleton-row="true"
            className={cn(
              "flex items-center gap-3 border-b border-border px-3",
              ROW_HEIGHT_CLASS,
            )}
          >
            {Array.from({ length: columns }, (_, index) => (
              <Skeleton key={index} className="h-4 flex-1 rounded-md" />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Info aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="text-caption text-muted-foreground">
          Loading records…
        </span>
      </div>
    </div>
  );
}

export type {
  RecordTableFilter,
  RecordTableFilterOption,
} from "./record-table-filters";
