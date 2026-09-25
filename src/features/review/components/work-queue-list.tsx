import Link from "next/link";
import type { ReactElement } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ListChecks,
} from "lucide-react";

import { ACTION_BUTTON_CLASS, EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  BACK_TO_QUEUE,
  flaggedFieldsLabel,
  NEXT_ITEM,
  NO_CONTAINER_NAMED,
  OPEN_THE_RECORD,
  NOTHING_TO_REVIEW,
  NOTHING_TO_REVIEW_ACTION,
  NOTHING_TO_REVIEW_BODY,
  positionLabel,
  PREVIOUS_ITEM,
  QUEUE_LIST_LABEL,
} from "../review-copy";
import { reviewItemHref } from "../review-hrefs";
import type { QueueReason, WorkQueueEntry } from "../server/work-queue";

/**
 * The queue list — `UX_SPEC.md` §3.8a.
 *
 * Oldest first, each item with its age, its container context, the count of
 * flagged fields and **why it is here**, from its T-52 codes or the Flow F
 * raise. Every item is a link to `?item=`: selection is in the URL, so a
 * dashboard alert or a colleague's link opens the same item (§7.4).
 *
 * A server component. It holds no state and makes no decision; the order and
 * the reasons arrive computed.
 */
export function WorkQueueList({
  entries,
  selectedId,
  explicit,
}: {
  readonly entries: readonly WorkQueueEntry[];
  /** The item open in the pane. */
  readonly selectedId: string | null;
  /**
   * Whether `?item=` named it. Without one the oldest opens in the pane on a
   * wide screen only, so the list marks it there and nowhere else — a phone
   * shows the list alone, and nothing on it is open.
   */
  readonly explicit: boolean;
}): ReactElement {
  return (
    <nav aria-label={QUEUE_LIST_LABEL} data-queue-list="true">
      <h2 className="text-h3 mb-3">
        {QUEUE_LIST_LABEL}
        <span className="tabular text-muted-foreground">
          {" "}
          · {entries.length}
        </span>
      </h2>
      <ol className="flex flex-col gap-2">
        {entries.map((entry) => {
          const selected = entry.id === selectedId;
          return (
            <li key={entry.id}>
              <Link
                href={reviewItemHref(entry.id)}
                aria-current={selected && explicit ? "page" : undefined}
                data-queue-item={entry.id}
                data-queue-item-kind={entry.kind}
                data-record-number={entry.recordNumber}
                className={cn(
                  "flex min-h-14 flex-col gap-1 rounded-lg border border-border p-3 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:bg-muted",
                  selected &&
                    (explicit
                      ? "border-l-4 border-l-foreground bg-muted/50"
                      : "lg:border-l-4 lg:border-l-foreground lg:bg-muted/50"),
                )}
              >
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-mono">{entry.recordNumber}</span>
                  <span className="text-caption text-muted-foreground">
                    {entry.ageLabel}
                  </span>
                </span>
                {entry.title === null ? null : (
                  <span className="text-body-strong">{entry.title}</span>
                )}
                <ReasonList reasons={entry.reasons} />
                <span className="text-caption text-muted-foreground">
                  {entry.containerCode ?? NO_CONTAINER_NAMED}
                  {entry.flaggedFieldCount === null
                    ? null
                    : ` · ${flaggedFieldsLabel(entry.flaggedFieldCount)}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Why an item is here. A code this build does not know renders as stored, in mono (§5.8). */
export function ReasonList({
  reasons,
}: {
  readonly reasons: readonly QueueReason[];
}): ReactElement | null {
  if (reasons.length === 0) return null;
  return (
    <ul data-queue-reasons="true" className="flex flex-wrap gap-x-3 gap-y-1">
      {reasons.map((reason) => (
        <li
          key={reason.storedValue}
          data-queue-reason={reason.storedValue}
          className={cn(
            "text-caption",
            reason.label === null ? "text-mono" : undefined,
          )}
        >
          {reason.label ?? reason.storedValue}
        </li>
      ))}
    </ul>
  );
}

/**
 * The pane's top line — where this item sits and how to move (§3.8a mobile:
 * *Next* / *Previous*). Links, so moving is a URL change and Back undoes it.
 */
export function QueueItemNav({
  recordNumber,
  recordHref,
  index,
  total,
  previousId,
  nextId,
}: {
  readonly recordNumber: string;
  /** The record the item is about, where this role may open it; `null` renders no link. */
  readonly recordHref: string | null;
  readonly index: number;
  readonly total: number;
  readonly previousId: string | null;
  readonly nextId: string | null;
}): ReactElement {
  return (
    <div
      data-queue-item-nav="true"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-h2">
          <span className="text-mono">{recordNumber}</span>
        </h2>
        <p className="text-caption text-muted-foreground">
          {positionLabel(index, total)}
          {recordHref === null ? null : (
            <>
              {" · "}
              <Link
                href={recordHref}
                data-open-record="true"
                className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {OPEN_THE_RECORD}
              </Link>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          asChild
          variant="outline"
          size="lg"
          className={cn(ACTION_BUTTON_CLASS, "lg:hidden")}
        >
          <Link href={reviewItemHref(null)} data-back-to-queue="true">
            <ListChecks aria-hidden="true" />
            {BACK_TO_QUEUE}
          </Link>
        </Button>
        {previousId === null ? null : (
          <Button
            asChild
            variant="outline"
            size="lg"
            className={ACTION_BUTTON_CLASS}
          >
            <Link href={reviewItemHref(previousId)} data-previous-item="true">
              <ChevronLeft aria-hidden="true" />
              {PREVIOUS_ITEM}
            </Link>
          </Button>
        )}
        {nextId === null ? null : (
          <Button
            asChild
            variant="outline"
            size="lg"
            className={ACTION_BUTTON_CLASS}
          >
            <Link href={reviewItemHref(nextId)} data-next-item="true">
              {NEXT_ITEM}
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * E-15, zero items — **a good state, styled as one** (§3.8a): the `ok` icon,
 * and a way on to the batteries. Never the filtered-empty copy.
 */
export function NothingToReview(): ReactElement {
  return (
    <EmptyState
      icon={CircleCheck}
      intent="ok"
      title={NOTHING_TO_REVIEW}
      description={NOTHING_TO_REVIEW_BODY}
      action={{ label: NOTHING_TO_REVIEW_ACTION, href: "/batteries" }}
      dataAttributes={{ "data-review-empty": "nothing-to-review" }}
    />
  );
}
