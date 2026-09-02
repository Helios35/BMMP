import { beforeEach, describe, expect, it, vi } from "vitest";

import { captureQueue } from "@/components/offline/capture-queue";

/**
 * The capture queue store — `UX_SPEC.md` §2.10, E-3.
 *
 * Every transition is a visible state and nothing leaves the queue without an
 * explicit act. The snapshot is referentially stable between changes, which is
 * what `useSyncExternalStore` needs.
 */

beforeEach(() => {
  captureQueue.reset();
});

describe("captureQueue — transitions", () => {
  it("enqueues as queued, then sending, then sent", () => {
    captureQueue.enqueue({ id: "p1", label: "Label photo" });
    expect(captureQueue.snapshot().items[0]?.state).toBe("queued");
    expect(captureQueue.snapshot().queuedCount).toBe(1);

    captureQueue.markSending("p1");
    expect(captureQueue.snapshot().items[0]?.state).toBe("sending");
    expect(captureQueue.snapshot().sendingCount).toBe(1);

    captureQueue.markSent("p1");
    expect(captureQueue.snapshot().items[0]?.state).toBe("sent");
    expect(captureQueue.snapshot().sentCount).toBe(1);
    expect(captureQueue.snapshot().queuedCount).toBe(0);
  });

  it("records a failure with its reason and keeps the item", () => {
    captureQueue.enqueue({ id: "p1", label: "Label photo" });
    captureQueue.markFailed("p1", "The server refused the encoding.");
    const item = captureQueue.snapshot().items[0];
    expect(item?.state).toBe("failed");
    expect(item?.error).toBe("The server refused the encoding.");
    expect(captureQueue.snapshot().failedCount).toBe(1);
    expect(captureQueue.snapshot().items).toHaveLength(1);
  });

  it("re-enqueuing an existing id resets it to queued without duplicating it", () => {
    captureQueue.enqueue({ id: "p1", label: "Label photo" });
    captureQueue.markFailed("p1", "no network");
    captureQueue.enqueue({ id: "p1", label: "Label photo" });
    expect(captureQueue.snapshot().items).toHaveLength(1);
    expect(captureQueue.snapshot().items[0]?.state).toBe("queued");
    expect(captureQueue.snapshot().items[0]?.error).toBeUndefined();
  });

  it("removes only on an explicit act", () => {
    captureQueue.enqueue({ id: "p1", label: "Label photo" });
    captureQueue.markSent("p1");
    expect(captureQueue.snapshot().items).toHaveLength(1);
    captureQueue.remove("p1");
    expect(captureQueue.snapshot().items).toHaveLength(0);
  });

  it("ignores a transition for an unknown id", () => {
    const before = captureQueue.snapshot();
    captureQueue.markSent("ghost");
    expect(captureQueue.snapshot()).toBe(before);
  });
});

describe("captureQueue — subscription and retry", () => {
  it("notifies subscribers and hands a new snapshot only on change", () => {
    const listener = vi.fn();
    const unsubscribe = captureQueue.subscribe(listener);
    const before = captureQueue.snapshot();
    expect(captureQueue.snapshot()).toBe(before);

    captureQueue.enqueue({ id: "p1", label: "Label photo" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(captureQueue.snapshot()).not.toBe(before);

    unsubscribe();
    captureQueue.markSent("p1");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("routes retry to the registered handler and says when none is mounted", () => {
    captureQueue.enqueue({ id: "p1", label: "Label photo" });
    captureQueue.markFailed("p1", "no network");
    expect(captureQueue.canRetry()).toBe(false);
    expect(captureQueue.retry("p1")).toBe(false);

    const handler = vi.fn();
    const unregister = captureQueue.registerRetry(handler);
    expect(captureQueue.retry("p1")).toBe(true);
    expect(handler).toHaveBeenCalledWith("p1");

    captureQueue.enqueue({ id: "p2", label: "Whole pack photo" });
    captureQueue.markFailed("p2", "no network");
    expect(captureQueue.retryAllFailed()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(3);

    unregister();
    expect(captureQueue.canRetry()).toBe(false);
  });
});
