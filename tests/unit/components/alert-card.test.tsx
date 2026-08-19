// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  AlertCard,
  AlertCardEmpty,
  AlertCardSkeleton,
  AlertRegionError,
} from "@/components/alert/alert-card";
import * as fixtures from "@/data/mock/fixtures";
import { ALERT } from "@/data/mock/fixtures/ids";
import type { Alert } from "@/types/storage";

/**
 * `AlertCard` in isolation, in every state `UX_SPEC.md` §2.11 defines:
 * default, hover, focus, active, disabled, loading, error, empty.
 *
 * It is rendered against the real fixtures rather than a hand-written object,
 * because §2.11's load-bearing claim is that **an alert is a stored record, not
 * view state computed on render** — a card built from an invented shape would
 * not be testing that.
 */

function alertById(id: string): Alert {
  const found = fixtures.alerts.find((alert) => alert.id === id);
  if (found === undefined) throw new Error(`No fixture alert ${id}`);
  return found;
}

const OVERDUE = alertById(ALERT.overdueDrum);
const REVIEW_QUEUE = alertById(ALERT.reviewQueue);

describe("AlertCard — default", () => {
  it("renders the intent bar, the icon, the title, the specifics and one action", () => {
    const { container } = render(
      <AlertCard
        alert={OVERDUE}
        action={{ label: "Build a shipment", href: "/shipments/new" }}
      />,
    );
    const card = container.querySelector(`[data-alert-id='${OVERDUE.id}']`);
    expect(card?.getAttribute("data-intent")).toBe("critical");
    // The 4px intent bar, plus an icon and text — colour is never the only
    // signal (§1.2 Rule 4).
    expect(container.querySelector(".w-1")).not.toBeNull();
    expect(card?.querySelector("svg")).not.toBeNull();
    expect(screen.getByText(OVERDUE.title)).toBeInTheDocument();
    expect(screen.getByText(OVERDUE.body)).toBeInTheDocument();
    // Exactly one primary action, routed rather than handled.
    const link = screen.getByRole("link", { name: "Build a shipment" });
    expect(link).toHaveAttribute("href", "/shipments/new");
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });

  it("renders from the stored record, not from anything recomputed", () => {
    // Every card, the alert bell and /containers?filter=alerting read the same
    // `alert` rows. No screen derives an alert on render, or two screens will
    // disagree about what is alerting (SITE_ARCHITECTURE.md §7.6a).
    const { container } = render(<AlertCard alert={REVIEW_QUEUE} />);
    const card = container.querySelector("[data-alert-id]");
    expect(card?.getAttribute("data-alert-id")).toBe(REVIEW_QUEUE.id);
    expect(card?.getAttribute("data-alert-type")).toBe(REVIEW_QUEUE.alertType);
  });

  it("gives the primary action a touch target of at least 44px (§1.5)", () => {
    // One hand, gloved, in a storage room. 44 × 44 CSS px everywhere, including
    // desktop.
    render(
      <AlertCard
        alert={REVIEW_QUEUE}
        action={{ label: "Open the review queue", href: "/review" }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Open the review queue" }).className,
    ).toContain("min-h-11");
  });

  it("pins an overdue-clock card, and offers no dismiss to any role (Rules 4.15, 4.16)", () => {
    const { container } = render(<AlertCard alert={OVERDUE} />);
    expect(
      container.querySelector("[data-alert-id]")?.getAttribute("data-pinned"),
    ).toBe("true");
    expect(container.querySelector("[data-alert-pinned]")).not.toBeNull();
    // E-6: pinned to the top of `/`, non-dismissible by every role including P6.
    expect(container.textContent ?? "").not.toMatch(/dismiss/i);
    expect(container.querySelector("button")).toBeNull();
  });

  it("does not pin an ordinary alert", () => {
    const { container } = render(<AlertCard alert={REVIEW_QUEUE} />);
    expect(
      container.querySelector("[data-alert-id]")?.getAttribute("data-pinned"),
    ).toBe("false");
    expect(container.querySelector("[data-alert-pinned]")).toBeNull();
  });

  it("never expresses a probability of ignition (Rules 1.25, 10.3)", () => {
    // Binding on the title, the body, the type label and the severity alike.
    for (const alert of fixtures.alerts) {
      const { container, unmount } = render(<AlertCard alert={alert} />);
      expect(container.textContent ?? "", alert.id).not.toMatch(
        /probability|likelihood|risk of fire|chance of|% chance/i,
      );
      unmount();
    }
  });

  it("falls back to a neutral intent on a severity this build does not know", () => {
    // `alert.severity` has no TAXONOMY.md system yet — reported in this unit's
    // build-notes. An unrecognised value renders rather than crashing, and is
    // never coerced to `critical`, which would invent an urgency.
    const { container } = render(
      <AlertCard alert={{ ...REVIEW_QUEUE, severity: "chartreuse" }} />,
    );
    expect(
      container.querySelector("[data-alert-id]")?.getAttribute("data-intent"),
    ).toBe("neutral");
  });
});

describe("AlertCard — disabled", () => {
  it("renders informationally and names who can act, with no dead button (§2.11)", () => {
    // A silently disabled control is a defect, not a safe default (Rule 1.26).
    const { container } = render(
      <AlertCard
        alert={OVERDUE}
        deniedNote="Ask a Handler or Admin to build the shipment."
      />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[data-alert-denied]")?.textContent).toBe(
      "Ask a Handler or Admin to build the shipment.",
    );
    // The alert itself still reads in full — the role cannot act, but it can see.
    expect(screen.getByText(OVERDUE.title)).toBeInTheDocument();
  });
});

describe("AlertCard — hover, focus and active", () => {
  it("routes through a link, so it works with a keyboard and a middle click", () => {
    // §1.5: hover is never the only way to reveal information or an action, and
    // every affordance has a tap and focus equivalent.
    render(
      <AlertCard
        alert={OVERDUE}
        action={{ label: "Open the container", href: "/containers/c-1" }}
      />,
    );
    const link = screen.getByRole("link", { name: "Open the container" });
    expect(link.tagName.toLowerCase()).toBe("a");
    expect(link.className).toContain("focus-visible:ring");
  });
});

describe("AlertCard — loading", () => {
  it("renders a skeleton card", () => {
    const { container } = render(<AlertCardSkeleton />);
    expect(
      container.querySelector("[data-alert-state='loading']"),
    ).not.toBeNull();
    expect(
      container.querySelectorAll("[data-slot='skeleton']").length,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("AlertCard — empty", () => {
  it("says nothing needs attention, and lets the copy differ per role (E-1)", () => {
    const { container } = render(<AlertCardEmpty />);
    expect(
      container.querySelector("[data-alert-state='empty']"),
    ).not.toBeNull();
    expect(
      screen.getByText("Nothing needs your attention right now."),
    ).toBeInTheDocument();

    const forManager = render(
      <AlertCardEmpty message="No container needs your attention right now." />,
    );
    expect(
      forManager.getByText("No container needs your attention right now."),
    ).toBeInTheDocument();
  });
});

describe("AlertCard — error", () => {
  it("replaces the region with one critical alert and a retry (§2.11)", () => {
    const { container } = render(<AlertRegionError retryHref="/" />);
    const region = container.querySelector("[data-alert-state='error']");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("role")).toBe("alert");
    expect(screen.getByRole("link", { name: "Retry" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows the correlation id so support can find the trace (§10.3)", () => {
    render(<AlertRegionError retryHref="/" correlationId="corr-abc-123" />);
    expect(screen.getByText("corr-abc-123")).toBeInTheDocument();
  });

  it("never implies the user has no alerts", () => {
    // Showing nothing on failure is indistinguishable from "you are clear",
    // which is the one thing this region must never imply.
    const { container } = render(<AlertRegionError retryHref="/" />);
    expect(container.textContent ?? "").not.toMatch(/nothing needs/i);
    expect(container.textContent).toContain("could not load");
  });
});
