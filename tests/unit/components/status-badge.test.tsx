// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  StatusBadge,
  StatusBadgeSkeleton,
} from "@/components/status/status-badge";
import {
  STATUS_INTENTS,
  STATUS_SYSTEMS,
  statusIntent,
  type StatusSystem,
} from "@/components/status/status-intent";

/**
 * `StatusBadge` in isolation, in every state `UX_SPEC.md` §2.3 defines:
 * default, hover, focus, active, disabled, loading, error, empty.
 *
 * Hover, focus, active and disabled are `n/a` on this component and §2.3 says
 * so — a badge is not interactive. The test that matters there is that it never
 * *becomes* interactive, which is asserted below.
 */

describe("StatusBadge — default", () => {
  it("renders icon, text and intent colour, always all three (§1.2 Rule 4)", () => {
    const { container } = render(
      <StatusBadge system="container_status" value="overdue" />,
    );
    const badge = container.querySelector("[data-status-state='default']");
    expect(badge).not.toBeNull();
    // Text: the display label from the system's own lookup, not the stored value.
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.queryByText("overdue")).not.toBeInTheDocument();
    // Colour: resolved through the single statusIntent map, never chosen here.
    expect(badge?.getAttribute("data-intent")).toBe("critical");
    // Icon: so the status survives glare, colour-blindness and a monochrome
    // printout. A badge with no icon or no text is a decoration.
    expect(badge?.querySelector("svg")).not.toBeNull();
  });

  it("renders every value of every system it supports without crashing", () => {
    // Forty-seven systems' worth of values reach a screen eventually. A value
    // that renders blank is worse than one that renders ugly.
    for (const system of Object.keys(STATUS_SYSTEMS) as StatusSystem[]) {
      for (const value of Object.keys(STATUS_SYSTEMS[system])) {
        const { container, unmount } = render(
          <StatusBadge system={system} value={value} />,
        );
        const badge = container.querySelector("[data-status-state]");
        expect(
          badge?.getAttribute("data-status-state"),
          `${system}.${value}`,
        ).toBe("default");
        expect(badge?.textContent?.trim().length).toBeGreaterThan(0);
        unmount();
      }
    }
  });

  it("maps every supported value to an intent — no value falls through", () => {
    for (const system of Object.keys(STATUS_SYSTEMS) as StatusSystem[]) {
      for (const value of Object.keys(STATUS_SYSTEMS[system])) {
        expect(
          statusIntent(system, value),
          `${system}.${value}`,
        ).not.toBeNull();
      }
      // And the intent map carries nothing the taxonomy does not.
      expect(Object.keys(STATUS_INTENTS[system]).sort()).toEqual(
        Object.keys(STATUS_SYSTEMS[system]).sort(),
      );
    }
  });

  it("distinguishes the same word across systems", () => {
    // `draft` is neutral on a shipment and `attention` on a document render,
    // where it means watermarked, not valid, and closes no precondition
    // (Rule 5.28). A value-keyed map would have to choose.
    const shipment = render(
      <StatusBadge system="shipment_status" value="draft" />,
    );
    expect(
      shipment.container
        .querySelector("[data-status-state='default']")
        ?.getAttribute("data-intent"),
    ).toBe("neutral");
    shipment.unmount();

    const document = render(
      <StatusBadge system="document_render_status" value="draft" />,
    );
    expect(
      document.container
        .querySelector("[data-status-state='default']")
        ?.getAttribute("data-intent"),
    ).toBe("attention");
  });

  it("renders both sizes", () => {
    const small = render(
      <StatusBadge system="lot_status" value="open" size="sm" />,
    );
    expect(small.container.querySelector(".h-6")).not.toBeNull();
    small.unmount();
    const medium = render(
      <StatusBadge system="lot_status" value="open" size="md" />,
    );
    expect(medium.container.querySelector(".h-7")).not.toBeNull();
  });
});

describe("StatusBadge — empty", () => {
  it("renders the literal text 'Not set', never a dash (§2.3, §4.5)", () => {
    // A user who sees "—" learns nothing.
    for (const value of [null, undefined, ""]) {
      const { container, unmount } = render(
        <StatusBadge system="battery_record_status" value={value} />,
      );
      expect(
        container.querySelector("[data-status-state='empty']"),
      ).not.toBeNull();
      expect(screen.getByText("Not set")).toBeInTheDocument();
      unmount();
    }
  });
});

describe("StatusBadge — error", () => {
  it("renders an unrecognised value as stored, in mono, and never blank", () => {
    // A retired value in historical data, or one from a newer deployment.
    // TAXONOMY.md §5.8: render it, do not crash, never coerce it to a default,
    // never filter it out of a count. `expired` was retired at v1.2.
    const { container } = render(
      <StatusBadge system="storage_clock_status" value="expired" />,
    );
    const badge = container.querySelector("[data-status-state='unrecognised']");
    expect(badge).not.toBeNull();
    expect(screen.getByText("expired")).toBeInTheDocument();
    expect(badge?.querySelector(".font-mono")).not.toBeNull();
  });

  it("never coerces an unrecognised value to a neighbouring one", () => {
    const { container } = render(
      <StatusBadge system="container_type" value="damaged_defective" />,
    );
    // The flat T-23 value retired at v1.2 carried no classification outcome.
    // Guessing one fabricates a compliance record.
    expect(screen.getByText("damaged_defective")).toBeInTheDocument();
    expect(container.querySelector("[data-status-state='default']")).toBeNull();
  });
});

describe("StatusBadge — loading", () => {
  it("renders a skeleton at the badge's own height, so the layout does not jump", () => {
    const { container } = render(<StatusBadgeSkeleton />);
    const skeleton = container.querySelector("[data-status-state='loading']");
    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain("h-7");
    const small = render(<StatusBadgeSkeleton size="sm" />);
    expect(
      small.container.querySelector("[data-status-state='loading']")?.className,
    ).toContain("h-6");
  });
});

describe("StatusBadge — hover, focus, active and disabled", () => {
  it("is not interactive, so none of the four states exist on it (§2.3)", () => {
    const { container } = render(
      <StatusBadge system="shipment_status" value="dispatched" />,
    );
    const badge = container.querySelector("[data-status-state='default']");
    expect(badge?.tagName.toLowerCase()).toBe("span");
    expect(badge?.getAttribute("role")).toBeNull();
    expect(badge?.getAttribute("tabindex")).toBeNull();
    expect(badge?.querySelector("button")).toBeNull();
    expect(badge?.querySelector("a")).toBeNull();
  });
});
