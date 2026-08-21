// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  StorageClockMeter,
  StorageClockMeterEmpty,
  StorageClockMeterError,
  StorageClockMeterSkeleton,
} from "@/components/storage/storage-clock-meter";
import * as fixtures from "@/data/mock/fixtures";
import { CLOCK } from "@/data/mock/fixtures/ids";
import type { StorageClock } from "@/types/storage";

/**
 * `StorageClockMeter` in isolation, in every state `UX_SPEC.md` §2.4 defines
 * for it: default, hover, focus, active, disabled, loading, error, empty.
 *
 * **Hover, focus and active are `n/a`, and §2.4 says why**: "the meter itself is
 * not separately interactive" — on a container row the whole row is the target.
 * **Disabled is `n/a` too, and for a stronger reason**: nothing on this
 * component is a control at all. There is no pause, hold, freeze, extend,
 * snooze or re-date affordance to disable, for any role including P6
 * (Rules 4.6, 4.9–4.12, 4.15). Both negatives are asserted below rather than
 * omitted.
 *
 * It is rendered against the real fixtures, whose timestamps are fixed. `asOf`
 * is passed explicitly for the same reason: a meter that read the wall clock
 * would render a different number every day and could not be tested at all.
 */

const AS_OF = "2026-08-21T12:00:00.000Z";

function clockById(id: string): StorageClock {
  const found = fixtures.storageClocks.find((clock) => clock.id === id);
  if (found === undefined) throw new Error(`No fixture storage clock ${id}`);
  return found;
}

const RUNNING = clockById(CLOCK.soundDrum);
const OVERDUE = clockById(CLOCK.overdueDrum);

describe("StorageClockMeter — default, within limits", () => {
  it("renders both figures as text, not only as a bar", () => {
    // "Both figures always render as text — the bar alone is never the
    // information" (§2.4).
    render(
      <StorageClockMeter
        clock={RUNNING}
        label="Storage clock for drum C-14"
        asOf={AS_OF}
      />,
    );
    expect(screen.getByText(/days elapsed$/)).toBeInTheDocument();
    expect(screen.getByText(/days remaining$/)).toBeInTheDocument();
  });

  it("names the bar, so a screen reader hears which clock it is", () => {
    render(
      <StorageClockMeter
        clock={RUNNING}
        label="Storage clock for drum C-14"
        asOf={AS_OF}
      />,
    );
    const bar = screen.getByRole("progressbar", {
      name: "Storage clock for drum C-14",
    });
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("carries icon and text as well as colour, through the one status map", () => {
    // Colour is never the only signal (§1.2 Rule 4). The tier badge is the
    // carrier: it resolves (system, value) through `statusIntent` and renders
    // icon + label + intent surface.
    const { container } = render(
      <StorageClockMeter clock={RUNNING} label="Storage clock" asOf={AS_OF} />,
    );
    expect(container.querySelector("[data-meter-state]")).toHaveAttribute(
      "data-intent",
      "ok",
    );
    const badge = container.querySelector("[data-status-state='default']");
    expect(badge?.getAttribute("data-intent")).toBe("ok");
    expect(badge?.querySelector("svg")).not.toBeNull();
    expect(badge?.textContent).toContain("Running");
  });

  it("renders the site's time zone next to the absolute date (Rule 4.29)", () => {
    // Not the browser's zone and not the organization's: the clock's own copy,
    // taken from the container at start so a later site edit cannot move it.
    render(
      <StorageClockMeter clock={RUNNING} label="Storage clock" asOf={AS_OF} />,
    );
    expect(
      screen.getByText(
        /Accumulation started 2026-07-28 · America\/Los_Angeles/,
      ),
    ).toBeInTheDocument();
  });

  it("renders whatever number the stored rule supplied, and no period of its own", () => {
    // Rule 1.23. The accumulation period is jurisdiction data and is never
    // assumed to be one year (Rules 4.5, 4.13).
    const { container } = render(
      <StorageClockMeter clock={RUNNING} label="Storage clock" asOf={AS_OF} />,
    );
    const bar = container.querySelector("[role='progressbar']");
    expect(bar?.getAttribute("aria-valuenow")).toBe(
      String(Math.round((24 / RUNNING.maxDurationDays) * 100)),
    );
  });
});

describe("StorageClockMeter — overdue is a hard state, not a warning", () => {
  it("fills the bar to a hard 100% and reads critical", () => {
    const { container } = render(
      <StorageClockMeter clock={OVERDUE} label="Storage clock" asOf={AS_OF} />,
    );
    expect(container.querySelector("[role='progressbar']")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(container.querySelector("[data-meter-state]")).toHaveAttribute(
      "data-intent",
      "critical",
    );
  });

  it("states the overrun rather than a negative remaining", () => {
    const { container } = render(
      <StorageClockMeter clock={OVERDUE} label="Storage clock" asOf={AS_OF} />,
    );
    const headline = container.querySelector("[data-meter-headline]");
    expect(headline?.textContent).toMatch(/^\d+ days past the limit$/);
    expect(headline?.textContent).not.toContain("remaining");
    expect(
      container.querySelector("[data-meter-elapsed]")?.textContent,
    ).toMatch(/^\d+ days elapsed$/);
  });

  it("names the only two ways out as text, never as controls (Rules 4.16, 4.17)", () => {
    const { container } = render(
      <StorageClockMeter clock={OVERDUE} label="Storage clock" asOf={AS_OF} />,
    );
    const note = container.querySelector("[data-meter-overdue-note]");
    expect(note?.textContent).toContain("shipment");
    expect(note?.textContent).toContain("remediation");
    expect(note?.tagName).toBe("P");
  });
});

describe("StorageClockMeter — the stored status decides the state", () => {
  it("trusts storage_clock.status rather than re-deriving overdue on render", () => {
    // `SITE_ARCHITECTURE.md` §7.6a: no screen derives an alert on render. The
    // alert job moves the status; a screen that called it overdue first would
    // disagree with the alert record printed beside it.
    const lagging: StorageClock = { ...OVERDUE, status: "running" };
    const { container } = render(
      <StorageClockMeter clock={lagging} label="Storage clock" asOf={AS_OF} />,
    );
    expect(container.querySelector("[data-meter-state]")).toHaveAttribute(
      "data-clock-lag",
      "true",
    );
    expect(container.querySelector("[data-meter-state]")).toHaveAttribute(
      "data-clock-status",
      "running",
    );
    // Never a negative and never a reassuring number while they disagree.
    expect(screen.getByText("0 days remaining")).toBeInTheDocument();
  });

  it("sets no lag marker when the status and the calendar agree", () => {
    const { container } = render(
      <StorageClockMeter clock={RUNNING} label="Storage clock" asOf={AS_OF} />,
    );
    expect(
      container
        .querySelector("[data-meter-state]")
        ?.getAttribute("data-clock-lag"),
    ).toBeNull();
  });
});

describe("StorageClockMeter — hover, focus, active and disabled are n/a", () => {
  it("has no hover, focus or active state, because the meter is not separately interactive", () => {
    // §2.4: "On the container row, the whole row is the target; the meter itself
    // is not separately interactive."
    const { container } = render(
      <StorageClockMeter clock={RUNNING} label="Storage clock" asOf={AS_OF} />,
    );
    const root = container.querySelector("[data-meter-state]") as HTMLElement;
    expect(root.className).not.toContain("hover:");
    expect(root.className).not.toContain("active:");
    expect(root.className).not.toContain("cursor-pointer");
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("has no disabled state, because it contains no control to disable", () => {
    // There is no pause, hold, freeze, suspend, extend, snooze or re-date
    // affordance on this component for any role, including P6 — and the absence
    // is the enforcement (Rules 4.6, 4.9–4.12, 4.15).
    for (const clock of [RUNNING, OVERDUE]) {
      const { container, unmount } = render(
        <StorageClockMeter clock={clock} label="Storage clock" asOf={AS_OF} />,
      );
      expect(container.querySelectorAll("button")).toHaveLength(0);
      expect(container.querySelectorAll("input")).toHaveLength(0);
      expect(container.querySelectorAll("[role='button']")).toHaveLength(0);
      const text = container.textContent ?? "";
      for (const word of [
        "Pause",
        "Snooze",
        "Freeze",
        "Hold",
        "Extend",
        "Dismiss",
        "Re-date",
      ]) {
        expect(text).not.toContain(word);
      }
      unmount();
    }
  });
});

describe("StorageClockMeter — loading", () => {
  it("renders at the meter's height so nothing moves when the figures land", () => {
    const { container } = render(<StorageClockMeterSkeleton />);
    expect(container.querySelector("[data-meter-state]")).toHaveAttribute(
      "data-meter-state",
      "loading",
    );
    expect(
      container.querySelectorAll("[data-slot='skeleton']").length,
    ).toBeGreaterThan(0);
    expect(container.querySelector("[role='progressbar']")).toBeNull();
  });
});

describe("StorageClockMeter — error", () => {
  it("replaces the bar with an alert and a Retry, and never renders an empty bar", () => {
    // An empty bar reads as "nothing to worry about", the most dangerous misread
    // available in this product (§2.4).
    const { container } = render(
      <StorageClockMeterError
        retryHref="/containers/c-14"
        correlationId="corr-3a1"
      />,
    );
    expect(container.querySelector("[data-meter-state]")).toHaveAttribute(
      "data-meter-state",
      "error",
    );
    expect(container.querySelector("[role='progressbar']")).toBeNull();
    expect(screen.getByText("Storage clock unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retry" })).toHaveAttribute(
      "href",
      "/containers/c-14",
    );
    expect(screen.getByText("corr-3a1")).toBeInTheDocument();
  });
});

describe("StorageClockMeter — empty", () => {
  it("says what is true and why, in neutral", () => {
    const { container } = render(<StorageClockMeterEmpty />);
    expect(container.querySelector("[data-meter-state]")).toHaveAttribute(
      "data-meter-state",
      "empty",
    );
    expect(
      screen.getByText("No clock running — this container is empty"),
    ).toBeInTheDocument();
    expect(container.querySelector("[role='progressbar']")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("StorageClockMeter — Rule 1.25", () => {
  it("expresses no probability, percentage or likelihood of fire in any state", () => {
    const rendered = [
      render(
        <StorageClockMeter
          clock={RUNNING}
          label="Storage clock"
          asOf={AS_OF}
        />,
      ),
      render(
        <StorageClockMeter
          clock={OVERDUE}
          label="Storage clock"
          asOf={AS_OF}
        />,
      ),
      render(<StorageClockMeterEmpty />),
      render(<StorageClockMeterError retryHref="/" />),
    ];
    const forbidden =
      /probability of ignition|likelihood of (fire|ignition|thermal)|risk of fire|chance of (fire|ignition|thermal runaway)/i;
    for (const view of rendered) {
      expect(view.container.textContent ?? "").not.toMatch(forbidden);
    }
  });
});
