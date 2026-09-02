// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import {
  CatalogMatchPanel,
  CANNOT_SHIP_NOTE,
} from "@/components/extraction-review";
import { CANDIDATES, FORBIDDEN_WORDS, okActions } from "./fixtures";

/**
 * `CatalogMatchPanel` in isolation, in every state `UX_SPEC.md` §2.13
 * defines: default, hover, focus, active, disabled, loading, error, empty.
 *
 * Disabled is the card's disabled state (the context), asserted on the card;
 * hover, focus and active are the generated `RadioGroup` item's own. What is
 * asserted here is the rule content: nothing pre-selected, the basis stated,
 * the score never shown, and the E-5 miss state saying the record cannot ship.
 */

function renderPanel(
  overrides: Partial<Parameters<typeof CatalogMatchPanel>[0]> = {},
) {
  const actions = okActions();
  const utils = render(
    <CatalogMatchPanel
      state="default"
      candidates={CANDIDATES}
      selectedCatalogEntryId={null}
      cannotShipNote={false}
      actions={actions}
      {...overrides}
    />,
  );
  return { ...utils, actions };
}

describe("CatalogMatchPanel — default", () => {
  it("highlights the top candidate without checking it (Rule 2.19)", () => {
    const { container } = renderPanel();
    const top = container.querySelector("[data-top-candidate='true']");
    expect(top).not.toBeNull();
    expect(top?.getAttribute("data-catalog-candidate")).toBe("cat-1");
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(radio).toHaveAttribute("aria-checked", "false");
    }
    expect(top?.className).toContain("bg-muted/50");
  });

  it("states the match basis for every candidate and never a score", () => {
    const { container } = renderPanel();
    expect(
      screen.getByText("Matched on manufacturer + part number"),
    ).toBeInTheDocument();
    expect(screen.getByText("Matched on manufacturer")).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\b[01]\.\d+\b/);
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(FORBIDDEN_WORDS);
  });

  it("selecting a candidate calls selectCandidate with its id, and rows are 56px", async () => {
    const { container, actions } = renderPanel();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("radio")[1] as HTMLElement);
    });
    expect(actions.selectCandidate).toHaveBeenCalledWith("cat-2");
    expect(
      container.querySelector("[data-catalog-candidate]")?.className,
    ).toContain("min-h-14");
  });

  it("reflects the route's selection and offers Search the catalog", () => {
    const { actions } = renderPanel({ selectedCatalogEntryId: "cat-2" });
    expect(screen.getAllByRole("radio")[1]).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Search the catalog" }));
    expect(actions.searchCatalog).toHaveBeenCalledTimes(1);
  });
});

describe("CatalogMatchPanel — loading, error, empty", () => {
  it("loading: three skeleton rows and the matching status", () => {
    const { container } = renderPanel({ state: "loading" });
    expect(
      container.querySelectorAll(
        "[data-catalog-loading] [data-slot='skeleton']",
      ),
    ).toHaveLength(3);
    expect(screen.getByRole("status").textContent).toContain(
      "Matching against the catalog",
    );
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("error: an attention alert with Retry and Continue without a catalog match", async () => {
    const { container, actions } = renderPanel({ state: "error" });
    expect(
      container.querySelector("[role='alert']")?.getAttribute("data-intent"),
    ).toBe("attention");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: "Continue without a catalog match",
        }),
      );
    });
    expect(actions.selectCandidate).toHaveBeenCalledWith(null);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    expect(actions.retryExtraction).toHaveBeenCalledTimes(1);
  });

  it("empty: E-5 verbatim, the cannot-ship line, and three equally available actions", async () => {
    const { container, actions } = renderPanel({
      state: "empty",
      candidates: [],
      cannotShipNote: true,
    });
    expect(
      container.querySelector("[data-catalog-match-state='empty']"),
    ).not.toBeNull();
    expect(screen.getByText("No catalog match found.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "We read the label but this product isn't in the catalog yet. You can still log this battery.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(CANNOT_SHIP_NOTE)).toBeInTheDocument();

    const buttons = container.querySelectorAll("[data-catalog-action]");
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button.getAttribute("data-variant")).toBe("outline");
    }
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Search the catalog" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Enter details manually" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Propose a new catalog entry" }),
      );
    });
    expect(actions.searchCatalog).toHaveBeenCalledTimes(1);
    expect(actions.enterManually).toHaveBeenCalledTimes(1);
    expect(actions.proposeEntry).toHaveBeenCalledTimes(1);
  });

  it("empty: omits the cannot-ship line when the route says the record can ship", () => {
    renderPanel({ state: "empty", candidates: [], cannotShipNote: false });
    expect(screen.queryByText(CANNOT_SHIP_NOTE)).toBeNull();
  });

  it("renders a failed selection inline and keeps the candidates", async () => {
    const actions = okActions();
    actions.selectCandidate = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "CONFLICT" as const,
        message: "That entry was retired.",
        correlationId: "c",
      },
    }));
    const { container } = renderPanel({ actions });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("radio")[0] as HTMLElement);
    });
    expect(
      container.querySelector("[data-catalog-error]")?.textContent,
    ).toContain("That entry was retired.");
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });
});
