// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  AiSuggestedTag,
  aiSuggestedText,
} from "@/components/ai/ai-suggested-tag";
import { ConditionForm } from "@/components/condition/condition-form";
import {
  DamageSuggestions,
  SUGGESTIONS_UNAVAILABLE,
  SUGGESTIONS_UNDECIDED_REASON,
  type DamageSuggestionsView,
} from "@/components/condition/damage-suggestions";
import { actionSucceeded } from "@/lib/action-result";

/**
 * Rules 1.29, 6.25, 6.26 — the tag says AI suggested and, once decided, who;
 * the Suggestions list ticks nothing and holds Confirm until every row is
 * decided; a failed check says so and blocks nothing.
 */

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const ROWS: DamageSuggestionsView = {
  unavailable: false,
  rows: [
    {
      key: "check-1:swelling",
      photoCheckId: "check-1",
      findingType: "swelling",
      findingLabel: "Swelling",
      photoNumber: 2,
      decision: null,
      decidedByName: null,
    },
    {
      key: "check-1:surface_marking",
      photoCheckId: "check-1",
      findingType: "surface_marking",
      findingLabel: "Surface marking",
      photoNumber: 2,
      decision: "rejected",
      decidedByName: "Dana R.",
    },
  ],
};

describe("AiSuggestedTag (Rule 1.29)", () => {
  it("says AI suggested, and who decided once someone has", () => {
    expect(aiSuggestedText(null)).toBe("AI suggested");
    expect(aiSuggestedText({ verb: "confirmed", byName: "Dana R." })).toBe(
      "AI suggested · confirmed by Dana R.",
    );
    render(
      <AiSuggestedTag decision={{ verb: "rejected", byName: "Dana R." }} />,
    );
    expect(screen.getByText("AI suggested · rejected by Dana R.")).toBeTruthy();
  });

  it("carries no number of any kind", () => {
    const { container } = render(<AiSuggestedTag />);
    expect(container.textContent).not.toMatch(/\d/);
  });
});

describe("the Suggestions list (Rule 6.25)", () => {
  it("names the finding and its photo, tags each row, and shows the decision with who made it", () => {
    render(<DamageSuggestions view={ROWS} onDecide={null} />);
    expect(screen.getByText("Swelling — photo 2")).toBeTruthy();
    expect(screen.getAllByText(/^AI suggested/)).toHaveLength(2);
    expect(screen.getByText("AI suggested · rejected by Dana R.")).toBeTruthy();
  });

  it("decides a row through the action it is given", async () => {
    const onDecide = vi.fn(() => Promise.resolve(actionSucceeded(undefined)));
    render(<DamageSuggestions view={ROWS} onDecide={onDecide} />);
    fireEvent.click(
      document.querySelector('[data-suggestion-accept="swelling"]')!,
    );
    await waitFor(() => expect(onDecide).toHaveBeenCalledTimes(1));
    expect(onDecide).toHaveBeenCalledWith(ROWS.rows[0], "accepted");
  });

  it("reads a failed check as unavailable and renders nothing for no suggestions", () => {
    const { container, rerender } = render(
      <DamageSuggestions
        view={{ unavailable: true, rows: [] }}
        onDecide={null}
      />,
    );
    expect(screen.getByText(SUGGESTIONS_UNAVAILABLE)).toBeTruthy();
    rerender(
      <DamageSuggestions
        view={{ unavailable: false, rows: [] }}
        onDecide={null}
      />,
    );
    expect(container.querySelector("[data-damage-suggestions]")).toBeNull();
  });
});

describe("ConditionForm with suggestions", () => {
  it("ticks nothing and holds Confirm, with its reason, while a suggestion is undecided", () => {
    render(
      <ConditionForm
        findings={["none_observed"]}
        isDefective={false}
        confirmed={null}
        onChange={() => Promise.resolve(actionSucceeded(undefined))}
        onConfirm={() => Promise.resolve(actionSucceeded(undefined))}
        damagePhoto={null}
        suggestions={ROWS}
        onDecideSuggestion={() => Promise.resolve(actionSucceeded(undefined))}
      />,
    );
    const swelling = document.querySelector(
      '[data-finding="swelling"]',
    ) as HTMLElement | null;
    expect(swelling?.getAttribute("data-state")).toBe("unchecked");
    const confirm = document.querySelector("[data-confirm-condition]");
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getAllByText(SUGGESTIONS_UNDECIDED_REASON).length,
    ).toBeGreaterThan(0);
  });
});
