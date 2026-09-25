import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, ClipboardCheck, TriangleAlert } from "lucide-react";

import { PageHeader, PageShell } from "@/components/page";
import {
  decodeListQuery,
  encodeListQuery,
  type ListQuerySpec,
} from "@/components/record-table/list-url";
import type { RecordTableFilter } from "@/components/record-table/record-table-filters";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { canReadRoute } from "@/domain/access/route-capability";
import { APP_ROUTE_NAMES } from "@/domain/access/routes";
import {
  nextAfterResolving,
  queuePosition,
  reviewQueueFraming,
} from "@/domain/review/queue";
import { INTAKE_PHOTO_UPLOAD_URL } from "@/features/intake/components/intake-hrefs";
import { IntakeItemPane } from "@/features/review/components/intake-item-pane";
import { InventorySummarySheet } from "@/features/review/components/inventory-summary-sheet";
import { RematchItemPane } from "@/features/review/components/rematch-item-pane";
import { UnidentifiedInventoryView } from "@/features/review/components/unidentified-inventory";
import {
  NothingToReview,
  QueueItemNav,
  WorkQueueList,
} from "@/features/review/components/work-queue-list";
import {
  ITEM_NOT_ON_QUEUE,
  loggedNotice,
  OPEN_THE_RECORD,
  QUEUE_READ_FAILED,
  rematchConfirmedNotice,
  rematchDeclinedNotice,
  SELECT_AN_ITEM,
  voidedNotice,
} from "@/features/review/review-copy";
import {
  isResolutionOutcome,
  REVIEW_ITEM_PARAM,
  REVIEW_OUTCOME_PARAM,
  REVIEW_RESOLVED_PARAM,
  REVIEW_ROUTE,
  type ResolutionOutcome,
} from "@/features/review/review-hrefs";
import {
  readInventorySummary,
  readUnidentifiedInventory,
  type UnidentifiedInventory,
} from "@/features/review/server/inventory";
import {
  readIntakeItemView,
  readRematchItemView,
  readWorkQueue,
  type WorkQueueEntry,
} from "@/features/review/server/work-queue";
import { describeRegionFailure } from "@/features/dashboard/dashboard-regions";
import { requireRoute } from "@/lib/auth/guard";
import { nowIso } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * `/review` — **one route, two screens** (`UX_SPEC.md` §3.8, §3.8a, §3.8b,
 * §4.2, §7 item 7a; `SITE_ARCHITECTURE.md` §5.2, CL-1; E-8b).
 *
 * The composition is selected from the role→route capability map, never from
 * a role literal: `write` on `/review` is P1's and P6's work queue, `read`
 * without `write` is P2's unidentified-inventory view (`reviewQueueFraming`).
 * **They are two compositions, not one with controls switched off** — P2's
 * screen carries no card, no Confirm, no Void and no disabled copy of either,
 * and no `ReadOnlyBanner`. The server refuses her writes independently
 * (`features/review/actions.ts`).
 *
 * P3, P4 and P5 hold nothing here and are redirected by the guard with the
 * restriction named (§5.3(4)); the denial is audited.
 *
 * **Selection and filters live in the URL** (`?item=`, and P2's filters), so a
 * dashboard alert, a saved intake and a colleague's link open what they mean.
 */

export const metadata: Metadata = {
  title: APP_ROUTE_NAMES[REVIEW_ROUTE],
};

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  return single === undefined || single === "" ? null : single;
}

export default async function ReviewPage({
  searchParams,
}: PageProps<"/review">) {
  const { ctx } = await requireRoute(REVIEW_ROUTE);
  const params: SearchParams = await searchParams;
  const asOf = nowIso();
  const title = APP_ROUTE_NAMES[REVIEW_ROUTE];

  return (
    <PageShell>
      <PageHeader title={title} />
      {reviewQueueFraming(ctx.role) === "unidentified"
        ? await UnidentifiedInventoryScreen({ ctx, params, asOf })
        : await WorkQueueScreen({ ctx, params, asOf })}
    </PageShell>
  );
}

// --- P1 and P6 (§3.8a) -----------------------------------------------------------------

async function WorkQueueScreen({
  ctx,
  params,
  asOf,
}: {
  readonly ctx: RequestContext;
  readonly params: SearchParams;
  readonly asOf: string;
}) {
  let entries: readonly WorkQueueEntry[];
  try {
    entries = await readWorkQueue(ctx, asOf);
  } catch (cause) {
    console.error(
      `[review] work queue could not be read (correlationId=${ctx.correlationId})`,
      cause,
    );
    return <QueueReadFailure cause={cause} />;
  }

  const notice = await resolvedNotice(ctx, params);
  const itemParam = firstParam(params[REVIEW_ITEM_PARAM]);

  if (entries.length === 0) {
    return (
      <>
        {notice}
        {itemParam === null ? null : <NotOnQueueNotice />}
        {/* E-15 — the good state, and it reads like one (§3.8a). */}
        <NothingToReview />
      </>
    );
  }

  // `?item=` names the item; without one the oldest opens on a wide screen
  // and the list is what a phone shows (§3.8a, §4.2).
  const explicit = itemParam !== null;
  const selected =
    itemParam === null
      ? (entries[0] ?? null)
      : (entries.find((entry) => entry.id === itemParam) ?? null);
  const orderedIds = entries.map((entry) => entry.id);

  const pane =
    selected === null ? (
      <NotOnQueueNotice />
    ) : (
      await ItemPane({ ctx, entry: selected, orderedIds })
    );

  return (
    <>
      {notice}
      <div
        data-work-queue="true"
        data-item-explicit={explicit ? "true" : "false"}
        className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-8"
      >
        <aside
          className={cn(
            explicit && selected !== null ? "hidden lg:block" : "block",
            "lg:sticky lg:top-16 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-1",
          )}
        >
          <WorkQueueList
            entries={entries}
            selectedId={selected?.id ?? null}
            explicit={explicit}
          />
        </aside>
        <section
          aria-label={
            selected === null ? SELECT_AN_ITEM : selected.recordNumber
          }
          className={cn(
            explicit ? "flex" : "hidden lg:flex",
            "min-w-0 flex-col gap-6",
          )}
        >
          {pane}
        </section>
      </div>
    </>
  );
}

async function ItemPane({
  ctx,
  entry,
  orderedIds,
}: {
  readonly ctx: RequestContext;
  readonly entry: WorkQueueEntry;
  readonly orderedIds: readonly string[];
}) {
  const position = queuePosition(orderedIds, entry.id);
  const nextItemId = nextAfterResolving(orderedIds, entry.id);
  const nav =
    position === null ? null : (
      <QueueItemNav
        recordNumber={entry.recordNumber}
        recordHref={
          canReadRoute(ctx.role, "/batteries/[id]")
            ? `/batteries/${entry.recordId}`
            : null
        }
        index={position.index}
        total={position.total}
        previousId={position.previousId}
        nextId={position.nextId}
      />
    );

  if (entry.kind === "intake") {
    const item = await readIntakeItemView(ctx, entry.id);
    if (item === null) return <NotOnQueueNotice />;
    return (
      <>
        {nav}
        <IntakeItemPane
          key={item.sessionId}
          item={item}
          nextItemId={nextItemId}
          uploadUrl={INTAKE_PHOTO_UPLOAD_URL}
        />
      </>
    );
  }

  const organization = await data.organizations.get(ctx, ctx.organizationId);
  const item = await readRematchItemView(
    ctx,
    entry.id,
    organization?.timeZone ?? "UTC",
  );
  if (item === null) return <NotOnQueueNotice />;
  return (
    <>
      {nav}
      <RematchItemPane key={item.raiseId} item={item} nextItemId={nextItemId} />
    </>
  );
}

/** What became of the item that just left — from the server's own row, never the URL's word. */
async function resolvedNotice(ctx: RequestContext, params: SearchParams) {
  const recordId = firstParam(params[REVIEW_RESOLVED_PARAM]);
  const outcome = firstParam(params[REVIEW_OUTCOME_PARAM]);
  if (recordId === null || !isResolutionOutcome(outcome)) return null;
  const record = await data.batteryRecords.get(ctx, recordId);
  if (record === null) return null;
  // A "voided" notice for a record that is not voided, or the reverse, is a
  // stale or edited link; it says nothing rather than something untrue.
  if ((outcome === "voided") !== (record.status === "voided")) return null;

  const sentence: Record<ResolutionOutcome, (number: string) => string> = {
    logged: loggedNotice,
    voided: voidedNotice,
    matched: rematchConfirmedNotice,
    kept: rematchDeclinedNotice,
  };
  return (
    <Alert
      role="status"
      data-review-resolved={outcome}
      data-intent="ok"
      className={cn("gap-2 border", INTENT_SURFACE_CLASSES.ok)}
    >
      <CircleCheck aria-hidden="true" />
      <AlertTitle className="text-body-strong text-balance">
        {sentence[outcome](record.recordNumber)}
      </AlertTitle>
      <AlertDescription className="text-current">
        <Button
          asChild
          variant="outline"
          size="lg"
          className="min-h-11 rounded-md"
        >
          <Link href={`/batteries/${record.id}`} data-resolved-record="true">
            {OPEN_THE_RECORD}
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function NotOnQueueNotice() {
  return (
    <Alert
      role="status"
      data-review-item-missing="true"
      data-intent="neutral"
      className={cn("gap-2 border", INTENT_SURFACE_CLASSES.neutral)}
    >
      <ClipboardCheck aria-hidden="true" />
      <AlertTitle className="text-body-strong text-balance">
        {ITEM_NOT_ON_QUEUE}
      </AlertTitle>
    </Alert>
  );
}

function QueueReadFailure({ cause }: { readonly cause: unknown }) {
  const failure = describeRegionFailure(cause, QUEUE_READ_FAILED);
  return (
    <Alert
      role="alert"
      data-review-error="true"
      className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
    >
      <TriangleAlert aria-hidden="true" />
      <AlertTitle className="text-body-strong">{failure.message}</AlertTitle>
      {failure.correlationId === undefined ? null : (
        <AlertDescription className="text-mono text-current">
          {failure.correlationId}
        </AlertDescription>
      )}
    </Alert>
  );
}

// --- P2 (§3.8b) ------------------------------------------------------------------

const INVENTORY_FILTER_IDS = ["site", "container", "tier", "age"] as const;

async function UnidentifiedInventoryScreen({
  ctx,
  params,
  asOf,
}: {
  readonly ctx: RequestContext;
  readonly params: SearchParams;
  readonly asOf: string;
}) {
  // The options are the data's own, so a first read without filters supplies
  // them; the second applies the ones the URL carries and that exist.
  let unfiltered: UnidentifiedInventory;
  try {
    unfiltered = await readUnidentifiedInventory(ctx, asOf, {});
  } catch (cause) {
    console.error(
      `[review] unidentified inventory could not be read (correlationId=${ctx.correlationId})`,
      cause,
    );
    return <QueueReadFailure cause={cause} />;
  }

  const spec: ListQuerySpec = {
    sortableColumnIds: [],
    defaultSort: "",
    defaultDir: "asc",
    filterIds: INVENTORY_FILTER_IDS,
    filterValues: {
      site: unfiltered.options.site.map((option) => option.value),
      container: unfiltered.options.container.map((option) => option.value),
      tier: unfiltered.options.tier.map((option) => option.value),
      age: unfiltered.options.age.map((option) => option.value),
    },
  };
  const query = decodeListQuery(params, spec);
  const inventory =
    Object.keys(query.filters).length === 0
      ? unfiltered
      : await readUnidentifiedInventory(ctx, asOf, query.filters);

  const filters: readonly RecordTableFilter[] = [
    { id: "site", label: "Site", options: unfiltered.options.site },
    {
      id: "container",
      label: "Container",
      options: unfiltered.options.container,
    },
    { id: "tier", label: "Clock tier", options: unfiltered.options.tier },
    { id: "age", label: "Age in queue", options: unfiltered.options.age },
  ];

  const itemParam = firstParam(params[REVIEW_ITEM_PARAM]);
  const onQueue =
    itemParam !== null &&
    inventory.groups.some((group) =>
      group.rows.some((row) => row.id === itemParam),
    );
  const summary =
    itemParam === null || !onQueue
      ? null
      : await readInventorySummary(ctx, itemParam);

  // Closing the summary drops `?item=` and keeps every filter.
  const closeHref = encodeListQuery(
    REVIEW_ROUTE,
    query,
    {},
    spec,
    Object.fromEntries(
      Object.entries(query.passthrough).filter(
        ([key]) => key !== REVIEW_ITEM_PARAM,
      ),
    ),
  );

  return (
    <>
      {itemParam !== null && !onQueue ? <NotOnQueueNotice /> : null}
      <UnidentifiedInventoryView
        inventory={{ ...inventory, total: unfiltered.total }}
        query={query}
        querySpec={spec}
        filters={filters}
        asOf={asOf}
        canOpenContainer={canReadRoute(ctx.role, "/containers/[id]")}
        canSeeContainerAlerts={canReadRoute(ctx.role, "/containers")}
      />
      <InventorySummarySheet
        summary={summary}
        closeHref={closeHref}
        canOpenRecord={canReadRoute(ctx.role, "/batteries/[id]")}
        canOpenContainer={canReadRoute(ctx.role, "/containers/[id]")}
      />
    </>
  );
}
