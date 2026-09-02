// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { MobileActionBar } from "@/components/flow/mobile-action-bar";
import type { OutstandingItem } from "@/domain/intake/commit-gate";

/**
 * `MobileActionBar` — `UX_SPEC.md` §2.15, §2.1.4(6), §6.3, §6.4.
 *
 * A disabled primary is explained by the checklist above it, every item a
 * 44px control; the primary itself is `aria-disabled` inside a `GatedControl`
 * and never carries the `disabled` attribute. An enabled primary with a
 * promise enters its pending label and waits — nothing is rendered as done
 * before the promise settles.
 */

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const OUTSTANDING: readonly OutstandingItem[] = [
  {
    kind: "confirm_hard_gated",
    fieldCode: "chemistry_code",
    label: "Confirm Chemistry code",
  },
  { kind: "choose_container", label: "Choose a container" },
];

describe("MobileActionBar — disabled with a checklist", () => {
  it("renders the checklist, each item a 44px button carrying its kind", () => {
    const onItem = vi.fn();
    const { container } = render(
      <MobileActionBar
        primary={{ label: "Confirm and log battery", disabled: true }}
        outstanding={OUTSTANDING}
        onOutstandingItem={onItem}
      />,
    );
    const items = container.querySelectorAll("[data-outstanding-item]");
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.tagName).toBe("BUTTON");
      expect(item.className).toContain("min-h-11");
    }
    expect(items[0]).toHaveAttribute(
      "data-outstanding-item",
      "confirm_hard_gated",
    );
    expect(items[1]).toHaveAttribute(
      "data-outstanding-item",
      "choose_container",
    );

    fireEvent.click(items[0] as Element);
    expect(onItem).toHaveBeenCalledWith(OUTSTANDING[0]);
  });

  it("marks the primary aria-disabled inside a gated control, never disabled", () => {
    const { container } = render(
      <MobileActionBar
        primary={{ label: "Confirm and log battery", disabled: true }}
        outstanding={OUTSTANDING}
      />,
    );
    const primary = screen.getByRole("button", {
      name: "Confirm and log battery",
    });
    expect(primary).toHaveAttribute("aria-disabled", "true");
    expect(primary).not.toHaveAttribute("disabled");
    expect(primary.className).toContain("min-h-14");
    expect(container.querySelector("[data-gated-control]")).not.toBeNull();
  });

  it("stretches the trigger and never the reason caption, so the caption stays sr-only from md", () => {
    // The caption is absolutely positioned by `sr-only`. A width rule on the
    // wrapper that reached every child span outranked that 1px width, laid
    // the caption out at its text width, and scrolled a 1280px viewport
    // sideways by 49px. These are the classes the fix relies on: the trigger
    // carries the widths, the caption carries `md:sr-only` and no width.
    const reason = "Add a label photo to read it.";
    const { container } = render(
      <MobileActionBar
        primary={{
          label: "Read label",
          disabled: true,
          disabledReason: reason,
        }}
      />,
    );
    const gated = container.querySelector("[data-gated-control]");
    expect(gated).not.toBeNull();
    expect(gated?.className).not.toMatch(/\[&>span/);

    const trigger = gated?.querySelector("[aria-describedby]");
    expect(trigger?.className).toContain("w-full");
    expect(trigger?.className).toContain("md:w-auto");

    const caption = gated?.querySelector("[data-gated-reason]");
    expect(caption?.textContent).toBe(reason);
    expect(caption?.className).toContain("md:sr-only");
    expect(caption?.className).not.toMatch(/(^|\s|:)w-(full|auto)(\s|$)/);
    expect(trigger?.getAttribute("aria-describedby")).toBe(caption?.id);
  });

  it("hides the checklist when the primary is enabled", () => {
    const { container } = render(
      <MobileActionBar
        primary={{ label: "Continue", onClick: () => {} }}
        outstanding={OUTSTANDING}
      />,
    );
    expect(container.querySelector("[data-outstanding-list]")).toBeNull();
  });

  it("carries the attribute the tab bar hides itself on", () => {
    const { container } = render(
      <MobileActionBar primary={{ label: "Continue", onClick: () => {} }} />,
    );
    expect(
      container.querySelector("[data-mobile-action-bar='true']"),
    ).not.toBeNull();
  });
});

describe("MobileActionBar — never optimistic", () => {
  it("shows the pending label until the promise settles", async () => {
    let settle: () => void = () => {};
    const onClick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    render(
      <MobileActionBar
        primary={{
          label: "Read label",
          onClick,
          pendingLabel: "Reading label…",
        }}
      />,
    );
    const button = screen.getByRole("button", { name: "Read label" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Reading label…" }),
    ).toHaveAttribute("aria-busy", "true");

    // A second tap while pending does nothing — one commit, one request.
    fireEvent.click(screen.getByRole("button", { name: "Reading label…" }));
    expect(onClick).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle();
    });
    expect(
      screen.getByRole("button", { name: "Read label" }),
    ).not.toHaveAttribute("aria-busy");
  });

  it("renders an href primary as a link and a secondary above it", () => {
    render(
      <MobileActionBar
        primary={{ label: "Continue", href: "/batteries/new?step=2" }}
        secondary={{ label: "Enter details manually", onClick: () => {} }}
      />,
    );
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      "/batteries/new?step=2",
    );
    expect(
      screen.getByRole("button", { name: "Enter details manually" }),
    ).toHaveAttribute("data-action-role", "secondary");
  });
});
