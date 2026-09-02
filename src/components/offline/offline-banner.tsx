"use client";

import { useState, type ReactElement } from "react";
import { CircleAlert, CircleCheck, CloudOff, RefreshCw } from "lucide-react";

import { ACTION_BUTTON_CLASS } from "@/components/page";
import {
  INTENT_SURFACE_CLASSES,
  INTENT_TEXT_CLASSES,
} from "@/components/status/intent-classes";
import type { StatusIntent } from "@/components/status/status-intent";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { IsoTimestamp } from "@/types/common";

import {
  captureQueue,
  useCaptureQueue,
  type CaptureQueueItem,
  type CaptureQueueState,
} from "./capture-queue";
import { useOnlineStatus } from "./use-online-status";

/**
 * `OfflineBanner` — `UX_SPEC.md` §2.10, E-10; D-20.
 *
 * Mounted once, in `AppShell`'s slot above `TopBar`, on every authenticated
 * route. Four states and the copy for each is §2.10's, verbatim:
 *
 * | state        | copy                                                          |
 * |--------------|---------------------------------------------------------------|
 * | online       | absent                                                        |
 * | offline      | *You're offline. Showing information from HH:MM. Photos will send when you reconnect.* |
 * | reconnecting | *Back online — sending N photos* with a determinate `Progress` |
 * | sync error   | *N photos couldn't be sent* with **Retry** and per-item detail |
 *
 * **The staleness time is a timestamp, never "recently"** (E-10). It is the
 * instant the page was rendered — `renderedAt`, server-supplied — formatted
 * as HH:MM **in the browser's zone**. That is the right zone here and the
 * wrong one nearly everywhere else in this product: a storage clock or an
 * audit row is a record and renders in the site's zone (Rule 4.29), but this
 * line tells the reader how old *their own screen* is, and the only clock
 * they can compare it to is the one in their status bar.
 *
 * **No silent failure, ever.** Every queued, failed or deferred capture is
 * individually visible in the sheet and individually retryable; nothing is
 * discarded on the reader's behalf (§2.10, E-3(6)).
 */

export interface OfflineBannerProps {
  /** When the page's reads were made. Server-supplied. */
  readonly renderedAt: IsoTimestamp;
  readonly className?: string;
}

export type OfflineBannerState = "offline" | "reconnecting" | "sync_error";

/**
 * HH:MM in the reader's own zone, 24-hour, for the line that tells them how
 * old their screen is. `hourCycle: "h23"` rather than `hour12: false`, which
 * some engines render as "24:05" at midnight.
 */
export function formatWallClockTime(iso: IsoTimestamp): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function photoWord(count: number): string {
  return count === 1 ? "photo" : "photos";
}

const STATE_INTENT: Readonly<Record<OfflineBannerState, StatusIntent>> = {
  offline: "attention",
  reconnecting: "neutral",
  sync_error: "critical",
};

const QUEUE_STATE_LABELS: Readonly<Record<CaptureQueueState, string>> = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  failed: "Not sent",
};

const QUEUE_STATE_INTENTS: Readonly<Record<CaptureQueueState, StatusIntent>> = {
  queued: "pending",
  sending: "neutral",
  sent: "ok",
  failed: "critical",
};

export function OfflineBanner({
  renderedAt,
  className,
}: OfflineBannerProps): ReactElement | null {
  const isOnline = useOnlineStatus();
  const queue = useCaptureQueue();

  const inFlight = queue.queuedCount + queue.sendingCount;
  const state: OfflineBannerState | null = !isOnline
    ? "offline"
    : inFlight > 0
      ? "reconnecting"
      : queue.failedCount > 0
        ? "sync_error"
        : null;

  if (state === null) return null;

  const intent = STATE_INTENT[state];
  const total = queue.items.length;
  const percent = total === 0 ? 0 : Math.round((queue.sentCount / total) * 100);
  const pendingCount =
    queue.queuedCount + queue.sendingCount + queue.failedCount;

  const message =
    state === "offline"
      ? `You're offline. Showing information from ${formatWallClockTime(renderedAt)}. Photos will send when you reconnect.`
      : state === "reconnecting"
        ? `Back online — sending ${inFlight} ${photoWord(inFlight)}`
        : `${queue.failedCount} ${photoWord(queue.failedCount)} couldn't be sent`;

  const Icon =
    state === "offline"
      ? CloudOff
      : state === "reconnecting"
        ? RefreshCw
        : CircleAlert;

  return (
    <div
      role={state === "sync_error" ? "alert" : "status"}
      data-offline-banner="true"
      data-offline-state={state}
      data-intent={intent}
      className={cn(
        "flex flex-col gap-2 border-b px-4 py-2 md:px-6 lg:px-8",
        INTENT_SURFACE_CLASSES[intent],
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <p data-offline-message="true" className="min-w-0 flex-1 text-body">
          {message}
        </p>

        {state === "sync_error" ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            data-offline-retry-all="true"
            onClick={() => captureQueue.retryAllFailed()}
            className={ACTION_BUTTON_CLASS}
          >
            Retry
          </Button>
        ) : null}

        {pendingCount > 0 ? <QueueSheet items={queue.items} /> : null}
      </div>

      {state === "reconnecting" ? (
        <Progress
          value={percent}
          role="progressbar"
          aria-label="Photos sent"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${queue.sentCount} of ${total} sent`}
          className="h-2 rounded-md bg-muted"
        />
      ) : null}
    </div>
  );
}

/**
 * The queue chip and the sheet it opens — each item with its state and, for
 * a failed one, its reason and a **Retry** (§2.10 Sync error).
 */
function QueueSheet({
  items,
}: {
  readonly items: readonly CaptureQueueItem[];
}): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const pending = items.filter((item) => item.state !== "sent");
  const canRetry = captureQueue.canRetry();

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          data-queue-chip="true"
          data-queue-count={pending.length}
          className={ACTION_BUTTON_CLASS}
        >
          {`${pending.length} ${photoWord(pending.length)} pending`}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-lg">
        <SheetHeader>
          <SheetTitle className="text-h2">Capture queue</SheetTitle>
          <SheetDescription className="text-body">
            Every photo kept on this device, with what has happened to it.
            Nothing here is discarded unless you remove it.
          </SheetDescription>
        </SheetHeader>
        <ul
          data-queue-list="true"
          className="flex flex-col gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          {items.map((item) => (
            <li
              key={item.id}
              data-queue-item={item.id}
              data-queue-item-state={item.state}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
            >
              <QueueStateMark state={item.state} />
              <span className="min-w-0 flex-1 text-body">{item.label}</span>
              {item.error !== undefined ? (
                <span
                  className={cn(
                    "w-full text-caption",
                    INTENT_TEXT_CLASSES.critical,
                  )}
                >
                  {item.error}
                </span>
              ) : null}
              {item.state === "failed" ? (
                <div className="flex w-full flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    data-queue-retry={item.id}
                    aria-disabled={canRetry ? undefined : "true"}
                    onClick={() => {
                      if (!captureQueue.retry(item.id)) return;
                      setIsOpen(false);
                    }}
                    className={ACTION_BUTTON_CLASS}
                  >
                    Retry
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    data-queue-remove={item.id}
                    onClick={() => captureQueue.remove(item.id)}
                    className={ACTION_BUTTON_CLASS}
                  >
                    Remove
                  </Button>
                  {canRetry ? null : (
                    <span className="w-full text-caption text-muted-foreground">
                      Open the intake step this photo belongs to, then retry.
                    </span>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function QueueStateMark({
  state,
}: {
  readonly state: CaptureQueueState;
}): ReactElement {
  const intent = QUEUE_STATE_INTENTS[state];
  const Icon =
    state === "sent"
      ? CircleCheck
      : state === "failed"
        ? CircleAlert
        : RefreshCw;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-2 rounded-md border px-2 text-label",
        INTENT_SURFACE_CLASSES[intent],
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span>{QUEUE_STATE_LABELS[state]}</span>
    </span>
  );
}
