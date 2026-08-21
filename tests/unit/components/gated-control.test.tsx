// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { GatedControl } from "@/components/access/gated-control";
import { Button } from "@/components/ui/button";
import { AUDITOR_READ_ONLY_REASON } from "@/domain/access";

/**
 * `GatedControl` in isolation, in every state `UX_SPEC.md` §2.9 defines for the
 * gated control it wraps: default, hover, focus, active, disabled, loading,
 * error, empty.
 *
 * **Disabled is the only state this component has** — it exists for nothing
 * else. Hover, focus and active belong to the control inside it, which is a
 * generated `Button` with its own states. Loading, error and empty are `n/a`:
 * the wrapper takes a reason string and children and reads nothing, so it has
 * nothing to load, nothing to fail at and nothing to be empty of. The negatives
 * are asserted rather than omitted.
 */

/**
 * jsdom implements no `ResizeObserver`, and Radix's popper measures its anchor
 * with one the moment a `TooltipTrigger` mounts. A no-op keeps the trigger
 * mountable without a dependency. The right home for this is
 * `tests/setup/dom.ts`; it is local here because that file belongs to another
 * unit's surface.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const REASON = AUDITOR_READ_ONLY_REASON;

/**
 * The shape §G5 requires: **`aria-disabled`, never the `disabled` attribute.** A
 * `disabled` button leaves the tab order and fires no pointer events, so its
 * tooltip never opens and the stated reason becomes unreachable — which defeats
 * the entire purpose of leaving the control visible for an auditor to assess.
 */
function gatedButton(onClick: () => void) {
  return (
    <GatedControl reason={REASON}>
      <Button
        aria-disabled="true"
        data-disabled="true"
        size="lg"
        className="min-h-11 rounded-md opacity-60"
        onClick={(event) => {
          event.preventDefault();
          onClick();
        }}
      >
        Edit this entry
      </Button>
    </GatedControl>
  );
}

describe("GatedControl — disabled with a reason", () => {
  it("marks the control aria-disabled and never uses the disabled attribute", () => {
    render(gatedButton(() => {}));
    const button = screen.getByRole("button", { name: "Edit this entry" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toHaveAttribute("disabled");
    expect(button).not.toBeDisabled();
  });

  it("keeps the control in the tab order so its reason is reachable", () => {
    render(gatedButton(() => {}));
    const button = screen.getByRole("button", { name: "Edit this entry" });
    button.focus();
    expect(button).toHaveFocus();
  });

  it("renders the reason as text, not only as a tooltip", () => {
    // Hover is never the only way to reveal information (§1.5), and a silently
    // disabled control is a defect, not a safe default (Rule 1.26).
    const { container } = render(gatedButton(() => {}));
    const reason = container.querySelector("[data-gated-reason]");
    expect(reason?.textContent).toBe(REASON);
    expect(screen.getByText(REASON)).toBeInTheDocument();
  });

  it("links the reason to the control with aria-describedby", () => {
    const { container } = render(gatedButton(() => {}));
    const trigger = container.querySelector("[tabindex='0']");
    const describedBy = trigger?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const reason = container.querySelector(
      `[data-gated-reason][id='${describedBy}']`,
    );
    expect(reason?.textContent).toBe(REASON);
  });

  it("does the caller's action only through the caller's own inert handler", () => {
    // The attribute is a courtesy. Server-side rejection is the actual
    // enforcement (`SITE_ARCHITECTURE.md` §5.3(6), §5.3(9)) — this wrapper makes
    // no access decision at all.
    const onClick = vi.fn();
    render(gatedButton(onClick));
    fireEvent.click(screen.getByRole("button", { name: "Edit this entry" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("GatedControl — hover, focus and active belong to the control it wraps", () => {
  it("adds no hover or active treatment of its own", () => {
    const { container } = render(gatedButton(() => {}));
    const root = container.querySelector("[data-gated-control]") as HTMLElement;
    expect(root.className).not.toContain("hover:");
    expect(root.className).not.toContain("active:");
  });

  it("rings its own focusable wrapper, because the tooltip opens from there", () => {
    const { container } = render(gatedButton(() => {}));
    const trigger = container.querySelector("[tabindex='0']") as HTMLElement;
    trigger.focus();
    expect(trigger).toHaveFocus();
    expect(trigger.className).toContain("focus-visible:ring-2");
    expect(trigger.className).toContain("focus-visible:ring-ring");
  });
});

describe("GatedControl — loading, error and empty are n/a", () => {
  it("reads nothing, so it has no loading, error or empty state", () => {
    const { container } = render(gatedButton(() => {}));
    expect(container.querySelector("[data-slot='skeleton']")).toBeNull();
    expect(container.querySelector("[role='alert']")).toBeNull();
  });
});
