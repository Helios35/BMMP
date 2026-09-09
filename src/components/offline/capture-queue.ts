"use client";

import { useSyncExternalStore } from "react";

/**
 * The capture queue — `UX_SPEC.md` §2.10, E-3, E-10.
 *
 * Every photo a person captures is an item here from the moment it exists on
 * the device until it is sent: **queued** (offline, or waiting for a session),
 * **sending**, **sent**, or **failed** with the reason. The banner reads it to
 * say *"Back online — sending 3 photos"* and *"2 photos couldn't be sent"*;
 * the capture step writes it and registers the one function that retries an
 * item. Nothing is discarded by the store — removal is an explicit act by the
 * person who captured it (E-3(6)).
 *
 * ## The limit, stated
 *
 * **This is a module-level store, in memory, per tab.** It survives client
 * navigation within the app and it does not survive a reload, a closed tab or
 * a second tab. A capture that is queued and never sent before the tab closes
 * is lost — which contradicts E-3(4)'s *"work is never lost"* for that one
 * case. Persisting the bytes to IndexedDB, and re-sending from a service
 * worker, is the follow-up that closes it; it is not in B1a and is reported in
 * the build-notes rather than half-built here.
 *
 * The snapshot is referentially stable between changes, which is what
 * `useSyncExternalStore` requires to avoid a render loop.
 */

export type CaptureQueueState = "queued" | "sending" | "sent" | "failed";

export interface CaptureQueueItem {
  readonly id: string;
  /** What the person sees in the sheet — *"Label photo"*, *"Damage photo 2"*. */
  readonly label: string;
  readonly state: CaptureQueueState;
  /** The stated reason, present only when `state === "failed"`. */
  readonly error?: string;
}

export interface CaptureQueueSnapshot {
  readonly items: readonly CaptureQueueItem[];
  readonly queuedCount: number;
  readonly sendingCount: number;
  readonly sentCount: number;
  readonly failedCount: number;
}

type Listener = () => void;
type RetryHandler = (id: string) => void;

const EMPTY_SNAPSHOT: CaptureQueueSnapshot = {
  items: [],
  queuedCount: 0,
  sendingCount: 0,
  sentCount: 0,
  failedCount: 0,
};

let items: readonly CaptureQueueItem[] = [];
let snapshot: CaptureQueueSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<Listener>();
let retryHandler: RetryHandler | null = null;

function count(state: CaptureQueueState): number {
  return items.filter((item) => item.state === state).length;
}

function publish(next: readonly CaptureQueueItem[]): void {
  items = next;
  snapshot = {
    items,
    queuedCount: count("queued"),
    sendingCount: count("sending"),
    sentCount: count("sent"),
    failedCount: count("failed"),
  };
  for (const listener of listeners) listener();
}

function transition(
  id: string,
  state: CaptureQueueState,
  error?: string,
): void {
  if (!items.some((item) => item.id === id)) return;
  publish(
    items.map((item) =>
      item.id === id
        ? error === undefined
          ? { id: item.id, label: item.label, state }
          : { id: item.id, label: item.label, state, error }
        : item,
    ),
  );
}

export const captureQueue = {
  /** Add an item, or reset an existing one to `queued`. */
  enqueue(item: { readonly id: string; readonly label: string }): void {
    if (items.some((existing) => existing.id === item.id)) {
      transition(item.id, "queued");
      return;
    }
    publish([...items, { id: item.id, label: item.label, state: "queued" }]);
  },
  markSending(id: string): void {
    transition(id, "sending");
  },
  markSent(id: string): void {
    transition(id, "sent");
  },
  markFailed(id: string, error: string): void {
    transition(id, "failed", error);
  },
  /** An explicit act by the person (E-3(6)) — the store never removes on its own. */
  remove(id: string): void {
    if (!items.some((item) => item.id === id)) return;
    publish(items.filter((item) => item.id !== id));
  },
  /**
   * The capture step registers the one function that knows how to re-send an
   * item; the banner's per-item **Retry** calls it. Returns the unregister.
   */
  registerRetry(handler: RetryHandler): () => void {
    retryHandler = handler;
    return () => {
      if (retryHandler === handler) retryHandler = null;
    };
  },
  /** `false` when no retry handler is mounted — the banner then says so. */
  retry(id: string): boolean {
    if (retryHandler === null) return false;
    retryHandler(id);
    return true;
  },
  retryAllFailed(): boolean {
    if (retryHandler === null) return false;
    const handler = retryHandler;
    for (const item of items) {
      if (item.state === "failed") handler(item.id);
    }
    return true;
  },
  canRetry(): boolean {
    return retryHandler !== null;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  snapshot(): CaptureQueueSnapshot {
    return snapshot;
  },
  /** Tests only: a suite that leaks items into the next one is not a suite. */
  reset(): void {
    retryHandler = null;
    publish([]);
  },
};

function serverSnapshot(): CaptureQueueSnapshot {
  return EMPTY_SNAPSHOT;
}

export function useCaptureQueue(): CaptureQueueSnapshot {
  return useSyncExternalStore(
    captureQueue.subscribe,
    captureQueue.snapshot,
    serverSnapshot,
  );
}
