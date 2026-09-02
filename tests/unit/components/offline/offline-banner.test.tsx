// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { captureQueue } from "@/components/offline/capture-queue";
import {
  OfflineBanner,
  formatWallClockTime,
} from "@/components/offline/offline-banner";

/**
 * `OfflineBanner` — `UX_SPEC.md` §2.10, E-10.
 *
 * Absent online; present offline with the render instant stated as a
 * timestamp, never "recently"; `neutral` with a determinate progress while
 * the queue drains; `critical` with **Retry** when something could not be
 * sent.
 */

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const RENDERED_AT = "2026-08-21T14:22:00.000Z";

let online = true;

beforeEach(() => {
  online = true;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
  captureQueue.reset();
});

afterEach(() => {
  captureQueue.reset();
});

function goOffline(): void {
  online = false;
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}

function goOnline(): void {
  online = true;
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

describe("OfflineBanner — online", () => {
  it("renders nothing", () => {
    const { container } = render(<OfflineBanner renderedAt={RENDERED_AT} />);
    expect(container.querySelector("[data-offline-banner]")).toBeNull();
  });
});

describe("OfflineBanner — offline", () => {
  it("states the render instant as HH:MM and that photos will send on reconnect", () => {
    const { container } = render(<OfflineBanner renderedAt={RENDERED_AT} />);
    goOffline();
    const banner = container.querySelector("[data-offline-banner]");
    expect(banner).toHaveAttribute("data-offline-state", "offline");
    expect(banner).toHaveAttribute("data-intent", "attention");
    const message = container.querySelector(
      "[data-offline-message]",
    )?.textContent;
    expect(message).toMatch(
      /^You're offline\. Showing information from \d{2}:\d{2}\. Photos will send when you reconnect\.$/,
    );
    expect(message).toContain(formatWallClockTime(RENDERED_AT));
    expect(message).not.toMatch(/recently/i);
  });

  it("shows the queue chip with the pending count and lists each item in the sheet", () => {
    const { container } = render(<OfflineBanner renderedAt={RENDERED_AT} />);
    goOffline();
    act(() => {
      captureQueue.enqueue({ id: "p1", label: "Label photo" });
      captureQueue.enqueue({ id: "p2", label: "Damage photo" });
    });
    const chip = container.querySelector("[data-queue-chip]");
    expect(chip).toHaveAttribute("data-queue-count", "2");
    expect(chip?.textContent).toBe("2 photos pending");

    fireEvent.click(chip as Element);
    expect(screen.getByText("Label photo")).toBeInTheDocument();
    expect(screen.getByText("Damage photo")).toBeInTheDocument();
    expect(
      document.querySelectorAll("[data-queue-item-state='queued']"),
    ).toHaveLength(2);
  });
});

describe("OfflineBanner — reconnecting", () => {
  it("turns neutral with a determinate progress while photos send", () => {
    const { container } = render(<OfflineBanner renderedAt={RENDERED_AT} />);
    act(() => {
      captureQueue.enqueue({ id: "p1", label: "Label photo" });
      captureQueue.enqueue({ id: "p2", label: "Whole pack photo" });
      captureQueue.enqueue({ id: "p3", label: "Damage photo" });
      captureQueue.markSent("p1");
      captureQueue.markSending("p2");
    });
    goOnline();
    const banner = container.querySelector("[data-offline-banner]");
    expect(banner).toHaveAttribute("data-offline-state", "reconnecting");
    expect(banner).toHaveAttribute("data-intent", "neutral");
    expect(container.querySelector("[data-offline-message]")?.textContent).toBe(
      "Back online — sending 2 photos",
    );
    const bar = screen.getByRole("progressbar", { name: "Photos sent" });
    expect(bar).toHaveAttribute("aria-valuenow", "33");
    expect(bar).toHaveAttribute("aria-valuetext", "1 of 3 sent");
  });

  it("disappears once everything is sent", () => {
    const { container } = render(<OfflineBanner renderedAt={RENDERED_AT} />);
    act(() => {
      captureQueue.enqueue({ id: "p1", label: "Label photo" });
      captureQueue.markSent("p1");
    });
    expect(container.querySelector("[data-offline-banner]")).toBeNull();
  });
});

describe("OfflineBanner — sync error", () => {
  it("names the count, offers Retry, and routes a per-item Retry through the store", () => {
    const handler = vi.fn();
    captureQueue.registerRetry(handler);
    const { container } = render(<OfflineBanner renderedAt={RENDERED_AT} />);
    act(() => {
      captureQueue.enqueue({ id: "p1", label: "Label photo" });
      captureQueue.markFailed("p1", "The server refused the encoding.");
    });
    const banner = container.querySelector("[data-offline-banner]");
    expect(banner).toHaveAttribute("data-offline-state", "sync_error");
    expect(banner).toHaveAttribute("data-intent", "critical");
    expect(container.querySelector("[data-offline-message]")?.textContent).toBe(
      "1 photo couldn't be sent",
    );

    fireEvent.click(
      container.querySelector("[data-offline-retry-all]") as Element,
    );
    expect(handler).toHaveBeenCalledWith("p1");

    fireEvent.click(container.querySelector("[data-queue-chip]") as Element);
    expect(
      screen.getByText("The server refused the encoding."),
    ).toBeInTheDocument();
    fireEvent.click(
      document.querySelector("[data-queue-retry='p1']") as Element,
    );
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe("OfflineBanner — Rule 1.25", () => {
  it("expresses no probability or likelihood in any state", () => {
    const { container } = render(<OfflineBanner renderedAt={RENDERED_AT} />);
    goOffline();
    expect(container.textContent ?? "").not.toMatch(
      /probabilit|likelihood|risk of|detected chemistry/i,
    );
  });
});
