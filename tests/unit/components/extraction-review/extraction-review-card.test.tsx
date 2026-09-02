// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";

import {
  bulkConfirmEligibleCodes,
  NO_READ_TITLE,
  READING_LABEL,
  STILL_READING,
  SLOW_READ_AFTER_MS,
} from "@/components/extraction-review";
import { HARD_GATED_LABEL_FIELD_CODES } from "@/domain/taxonomy/label-field-code";
import type { ActionResult } from "@/lib/action-result";
import {
  baseProps,
  cleanFields,
  failed,
  field,
  FORBIDDEN_WORDS,
  OK,
  renderCard,
} from "./fixtures";

/**
 * `ExtractionReviewCard` in isolation, in every state `UX_SPEC.md` §2.1.6
 * defines: default, hover, focus, active, disabled, loading, error, empty.
 *
 * Hover, focus and active are asserted structurally against the class string
 * where they exist, because jsdom renders no CSS pseudo-classes. The gate
 * behaviours — a confirmation that waits, a bulk confirm that never touches
 * a hard-gated field, a disabled primary that always explains itself — are the
 * tests that matter, and each is a rule with a number.
 */

afterEach(() => {
  vi.useRealTimers();
});

function rows(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-field-row]"),
  );
}

function row(container: HTMLElement, code: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `[data-field-row="${code}"]`,
  );
  if (found === null) throw new Error(`no row for ${code}`);
  return found;
}

describe("ExtractionReviewCard — default", () => {
  it("renders a row per field with name, value, source and confidence, in that order", () => {
    const { container } = renderCard();
    expect(
      container
        .querySelector("[data-review-card]")
        ?.getAttribute("data-review-state"),
    ).toBe("default");
    expect(rows(container)).toHaveLength(cleanFields().length);

    const manufacturer = row(container, "manufacturer");
    const legend = manufacturer.querySelector("legend");
    expect(legend?.textContent).toContain("Manufacturer");
    // The label is never muted (§1.2 Rule 3).
    expect(legend?.className).toContain("text-foreground");
    expect(legend?.className).not.toContain("text-muted-foreground");

    const text = manufacturer.textContent ?? "";
    const order = [
      text.indexOf("Manufacturer"),
      text.indexOf("Northvale Cell Systems"),
      text.indexOf("Read from label"),
      text.indexOf("High"),
    ];
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("gives every row an accessible name of name, source, confidence band and status (§2.1.7)", () => {
    renderCard();
    expect(
      screen.getByRole("group", {
        name: /Manufacturer, Read from label, confidence High, not yet confirmed/,
      }),
    ).toBeInTheDocument();
  });

  it("renders the band through ConfidenceBandDisplay and never a digit in the confidence column", () => {
    const { container } = renderCard({
      fields: cleanFields().map((entry) => ({
        ...entry,
        rawConfidence: "0.97",
      })),
    });
    const badges = container.querySelectorAll("[data-confidence-state]");
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.textContent ?? "").not.toMatch(/\d/);
    }
  });

  it("marks the hard-gated rows and says a person always confirms them", () => {
    const { container } = renderCard();
    for (const code of HARD_GATED_LABEL_FIELD_CODES) {
      expect(row(container, code).getAttribute("data-hard-gated")).toBe("true");
    }
    expect(
      within(row(container, "model")).getByText("Always confirmed by a person"),
    ).toBeInTheDocument();
  });

  it("renders an illegible field as the literal Not read with the model's raw text beneath (Rules 2.11, 2.12)", () => {
    const { container } = renderCard({
      fields: [
        field("serial_number", {
          value: null,
          originalValue: null,
          rawText: "▮▮▮",
          confidenceBand: "not_extracted",
        }),
      ],
    });
    const serial = row(container, "serial_number");
    expect(within(serial).getByText("Not read")).toBeInTheDocument();
    expect(within(serial).getByText("Model reported: ▮▮▮")).toBeInTheDocument();
    expect(serial.textContent).not.toContain("—");
  });

  it("shows the decoded date beside the raw date code, and Undecodable when the decode failed (Rule 2.24)", () => {
    const { container, rerenderWith } = renderCard();
    const decoded = row(container, "date_code");
    expect(within(decoded).getByText("Decoded")).toBeInTheDocument();
    expect(decoded.textContent).toContain("2021-11-01");

    rerenderWith({
      fields: [
        field("date_code", {
          value: "K2##7",
          decoded: { date: null, precisionLabel: null, undecodable: true },
        }),
      ],
    });
    expect(
      container.querySelector("[data-decode-state='undecodable']")?.textContent,
    ).toContain("Undecodable");
  });

  it("names a hover wash and a focus bar on the row, desktop-only and revealing nothing (§2.1.6)", () => {
    const { container } = renderCard();
    const className = row(container, "manufacturer").className;
    expect(className).toContain("md:hover:bg-muted/50");
    expect(className).toContain("focus-within:border-l-ring");
  });

  it("scales the confirm control on press and never changes its colour (§2.1.6 Active)", () => {
    const { container } = renderCard();
    const confirm = within(row(container, "manufacturer")).getByRole("button", {
      name: "Confirm",
    });
    expect(confirm.className).toContain("active:scale-[0.98]");
    expect(confirm.className).toContain("min-h-12");
  });
});

describe("ExtractionReviewCard — confirming waits for the server (§6.4)", () => {
  it("does not mark a row confirmed until confirmField resolves ok, and never on its own", async () => {
    let resolve: ((result: ActionResult<unknown>) => void) | undefined;
    const confirmField = vi.fn(
      () =>
        new Promise<ActionResult<unknown>>((done) => {
          resolve = done;
        }),
    );
    const { container } = renderCard({
      actions: { ...baseProps().actions, confirmField },
    });

    const manufacturer = row(container, "manufacturer");
    fireEvent.click(
      within(manufacturer).getByRole("button", { name: "Confirm" }),
    );

    expect(confirmField).toHaveBeenCalledWith(
      "manufacturer",
      "Northvale Cell Systems",
    );
    // In flight: present-participle label, aria-busy, row still pending.
    const busy = within(manufacturer).getByRole("button", {
      name: "Confirming…",
    });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(manufacturer.getAttribute("data-field-status")).toBe("pending");
    expect(manufacturer.querySelector("[data-confirmed-line]")).toBeNull();

    await act(async () => {
      resolve?.(OK);
    });

    // Resolved ok: the button is ready again, and the row is *still* pending —
    // the card renders confirmed only when the server's props say so.
    expect(
      within(manufacturer).getByRole("button", { name: "Confirm" }),
    ).toBeInTheDocument();
    expect(manufacturer.getAttribute("data-field-status")).toBe("pending");
  });

  it("collapses a confirmed row to check, value, name, time and Change (§2.1.4(3))", () => {
    const { container } = renderCard({
      fields: [
        field("manufacturer", {
          value: "Northvale Cell Systems",
          status: "confirmed",
          confirmedByName: "Dana Reyes",
          confirmedAt: "2026-08-11T21:30:00.000Z",
        }),
      ],
    });
    const confirmed = row(container, "manufacturer");
    expect(confirmed.getAttribute("data-field-status")).toBe("confirmed");
    expect(confirmed.querySelector("[data-confirmed-line] svg")).not.toBeNull();
    expect(within(confirmed).getByText("Dana Reyes")).toBeInTheDocument();
    expect(
      within(confirmed).getByRole("button", { name: "Change" }),
    ).toBeInTheDocument();
    expect(
      within(confirmed).queryByRole("button", { name: "Confirm" }),
    ).toBeNull();
  });

  it("renders a failed action inline beneath the row and leaves the row pending (§10.3)", async () => {
    const actions = {
      ...baseProps().actions,
      confirmField: vi.fn(async () =>
        failed("The value was not saved. Try again."),
      ),
    };
    const { container } = renderCard({ actions });
    const manufacturer = row(container, "manufacturer");

    await act(async () => {
      fireEvent.click(
        within(manufacturer).getByRole("button", { name: "Confirm" }),
      );
    });

    const error = manufacturer.querySelector("[data-row-error]");
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain("The value was not saved. Try again.");
    expect(manufacturer.getAttribute("data-field-status")).toBe("pending");
    // The card is still there — never a page replacement.
    expect(container.querySelector("[data-review-card]")).not.toBeNull();
  });

  it("opens the editor from the value, from Correct and from the E key, pre-filled, and relabels the confirm (§2.1.4(2), §6.6)", async () => {
    const { container, actions } = renderCard();
    const manufacturer = row(container, "manufacturer");

    fireEvent.click(
      within(manufacturer).getByRole("button", { name: "Correct" }),
    );
    const input = within(manufacturer).getByRole("textbox", {
      name: "Manufacturer",
    });
    expect(input).toHaveValue("Northvale Cell Systems");
    expect(
      within(manufacturer).getByText("Read as: Northvale Cell Systems"),
    ).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Northvale Cells" } });
    await act(async () => {
      fireEvent.click(
        within(manufacturer).getByRole("button", {
          name: "Confirm corrected value",
        }),
      );
    });
    expect(actions.confirmField).toHaveBeenCalledWith(
      "manufacturer",
      "Northvale Cells",
    );

    // The value itself is a tap target, and E edits.
    const voltage = row(container, "voltage");
    fireEvent.click(
      within(voltage).getByRole("button", { name: "Correct Voltage" }),
    );
    expect(
      within(voltage).getByRole("textbox", { name: "Voltage" }),
    ).toBeInTheDocument();

    const serial = row(container, "serial_number");
    fireEvent.keyDown(serial, { key: "e" });
    expect(
      within(serial).getByRole("textbox", { name: "Serial number" }),
    ).toBeInTheDocument();
  });

  it("saves a typed value on a not-read row as pending, and offers leave-empty only when optional (§2.1.5)", async () => {
    const { container, actions } = renderCard({
      fields: [
        field("serial_number", {
          value: null,
          originalValue: null,
          confidenceBand: "not_extracted",
        }),
        field("model", {
          value: null,
          originalValue: null,
          confidenceBand: "not_extracted",
          isHardGated: true,
          isRequired: true,
        }),
      ],
    });
    const serial = row(container, "serial_number");
    expect(
      within(serial).getByRole("button", { name: "Leave empty" }),
    ).toBeInTheDocument();
    const model = row(container, "model");
    expect(
      within(model).queryByRole("button", { name: "Leave empty" }),
    ).toBeNull();

    fireEvent.click(
      within(serial).getByRole("button", { name: "Enter a value" }),
    );
    fireEvent.change(
      within(serial).getByRole("textbox", { name: "Serial number" }),
      { target: { value: "SN-1" } },
    );
    await act(async () => {
      fireEvent.click(
        within(serial).getByRole("button", { name: "Save entered value" }),
      );
    });
    expect(actions.enterValue).toHaveBeenCalledWith("serial_number", "SN-1");
    expect(actions.confirmField).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(
        within(model).getByRole("button", { name: "Enter a value" }),
      );
    });
    expect(
      within(model).getByRole("textbox", { name: "Model / part number" }),
    ).toBeInTheDocument();
  });

  it("rejects a field, shows critical intent, and keeps the original read visible", async () => {
    const { container, actions, rerenderWith } = renderCard();
    await act(async () => {
      fireEvent.click(
        within(row(container, "voltage")).getByRole("button", {
          name: "Reject",
        }),
      );
    });
    expect(actions.rejectField).toHaveBeenCalledWith("voltage");

    rerenderWith({
      fields: [
        field("voltage", {
          status: "rejected",
          value: null,
          originalValue: "355.2 V",
        }),
      ],
    });
    const rejected = row(container, "voltage");
    expect(rejected.getAttribute("data-intent")).toBe("critical");
    expect(within(rejected).getByText("Read as: 355.2 V")).toBeInTheDocument();
    expect(
      within(rejected).getByRole("button", { name: "Enter a value" }),
    ).toBeInTheDocument();
  });
});

describe("ExtractionReviewCard — chemistry has exactly two sources (Rules 2.9, 2.10)", () => {
  it("never labels the chemistry row Read from label or Detected from image, in any state", () => {
    const states = [
      field("chemistry_code", {
        value: "Li-ion NMC",
        originalValue: "Li-ion NMC",
        source: "read_from_label",
        isHardGated: true,
      }),
      field("chemistry_code", {
        value: "li_nmc",
        originalValue: "Li-ion NMC",
        source: "matched_from_catalog",
        isHardGated: true,
      }),
      field("chemistry_code", {
        value: "li_lfp",
        originalValue: "Li-ion NMC",
        source: "entered_by",
        isHardGated: true,
      }),
      field("chemistry_code", {
        value: "li_nmc",
        originalValue: "Li-ion NMC",
        source: "matched_from_catalog",
        status: "confirmed",
        isHardGated: true,
      }),
      field("chemistry_code", {
        value: null,
        originalValue: "Li-ion NMC",
        source: "read_from_label",
        status: "rejected",
        isHardGated: true,
      }),
    ];
    for (const chemistry of states) {
      const { container, unmount } = renderCard({ fields: [chemistry] });
      const sources = Array.from(
        row(container, "chemistry_code").querySelectorAll(
          "[data-field-source]",
        ),
      ).map((badge) => badge.getAttribute("data-field-source"));
      expect(sources).not.toContain("read_from_label");
      expect(sources).not.toContain("detected_from_image");
      expect(row(container, "chemistry_code").textContent).not.toMatch(
        FORBIDDEN_WORDS,
      );
      unmount();
    }
  });

  it("shows the label's characters as characters and says how a chemistry gets set", () => {
    const { container } = renderCard({
      fields: [
        field("chemistry_code", {
          value: "Li-ion NMC",
          originalValue: "Li-ion NMC",
          isHardGated: true,
        }),
      ],
    });
    const chemistry = row(container, "chemistry_code");
    expect(within(chemistry).getByText("Not set")).toBeInTheDocument();
    expect(
      within(chemistry).getByText("Label characters: Li-ion NMC"),
    ).toBeInTheDocument();
    expect(chemistry.querySelector("[data-field-source]")).toBeNull();
    expect(
      screen.getByRole("group", {
        name: /Chemistry code, no source yet, confidence High, not yet confirmed/,
      }),
    ).toBeInTheDocument();
  });

  it("labels a catalog-supplied chemistry Matched from catalog and a typed one Entered by you, through T-01's labels", () => {
    const { container, rerenderWith } = renderCard({
      fields: [
        field("chemistry_code", {
          value: "li_nmc",
          originalValue: "Li-ion NMC",
          source: "matched_from_catalog",
          isHardGated: true,
        }),
      ],
    });
    let chemistry = row(container, "chemistry_code");
    expect(
      chemistry
        .querySelector("[data-field-source]")
        ?.getAttribute("data-field-source"),
    ).toBe("matched_from_catalog");
    expect(
      within(chemistry).getByText("Lithium-ion — NMC"),
    ).toBeInTheDocument();

    rerenderWith({
      fields: [
        field("chemistry_code", {
          value: "li_lfp",
          originalValue: "Li-ion NMC",
          source: "entered_by",
          isHardGated: true,
        }),
      ],
    });
    chemistry = row(container, "chemistry_code");
    expect(within(chemistry).getByText("Entered by you")).toBeInTheDocument();
    expect(
      within(chemistry).getByText("Lithium-ion — LFP"),
    ).toBeInTheDocument();
  });

  it("rejecting the catalog-matched chemistry also clears the match (§2.1.5)", async () => {
    const { container, actions } = renderCard({
      fields: [
        field("chemistry_code", {
          value: "li_nmc",
          originalValue: "Li-ion NMC",
          source: "matched_from_catalog",
          isHardGated: true,
        }),
      ],
      selectedCatalogEntryId: "cat-1",
    });
    await act(async () => {
      fireEvent.click(
        within(row(container, "chemistry_code")).getByRole("button", {
          name: "Reject",
        }),
      );
    });
    expect(actions.rejectField).toHaveBeenCalledWith("chemistry_code");
    expect(actions.selectCandidate).toHaveBeenCalledWith(null);
  });

  it("offers a Select over the chemistries with unknown excluded on the manual path", () => {
    const { container } = renderCard({
      fields: [
        field("chemistry_code", {
          value: "Li-ion NMC",
          originalValue: "Li-ion NMC",
          isHardGated: true,
        }),
      ],
    });
    const chemistry = row(container, "chemistry_code");
    fireEvent.click(
      within(chemistry).getByRole("button", { name: "Enter a value" }),
    );
    const trigger = chemistry.querySelector("[data-chemistry-select]");
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("role")).toBe("combobox");
  });
});

describe("ExtractionReviewCard — bulk confirm excludes the hard-gated fields, always (§2.1.4(4))", () => {
  it("computes the eligible set from the rows and never includes model, chemistry code or assessed condition", async () => {
    const fields = cleanFields().map((entry) => ({
      ...entry,
      // Every row High and pending, including the hard-gated three, with a value.
      confidenceBand: "high" as const,
      status: "pending" as const,
      value: entry.value ?? "set",
      input:
        entry.input.kind === "readonly"
          ? { kind: "text" as const }
          : entry.input,
    }));
    const { container, actions } = renderCard({ fields });
    const bulk = container.querySelector<HTMLButtonElement>(
      "[data-bulk-confirm]",
    );
    expect(bulk).not.toBeNull();

    await act(async () => {
      fireEvent.click(bulk as HTMLButtonElement);
    });

    expect(actions.confirmAllHighConfidence).toHaveBeenCalledTimes(1);
    const argument = (
      actions.confirmAllHighConfidence as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[0] as readonly string[];
    for (const code of HARD_GATED_LABEL_FIELD_CODES) {
      expect(argument).not.toContain(code);
    }
    expect(argument.length).toBeGreaterThan(0);
    expect(argument).toEqual(bulkConfirmEligibleCodes(fields));
  });

  it("does not render the bulk control when fewer than three rows are High", () => {
    const { container } = renderCard({ bulkConfirmAvailable: false });
    expect(container.querySelector("[data-bulk-confirm]")).toBeNull();
  });
});

describe("ExtractionReviewCard — the commit gate explains itself (§2.1.4(6))", () => {
  it("renders the primary aria-disabled with at least one outstanding item, each a button that scrolls to its row", () => {
    const { container } = renderCard();
    const primary = container.querySelector<HTMLButtonElement>(
      "[data-primary-action]",
    );
    expect(primary).toHaveAttribute("aria-disabled", "true");
    expect(primary).not.toHaveAttribute("disabled");

    const items = container.querySelectorAll<HTMLElement>(
      "[data-outstanding-item]",
    );
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(item.tagName).toBe("BUTTON");
    }
    const chemistryItem = container.querySelector(
      "[data-outstanding-item='confirm_hard_gated'][data-outstanding-field='chemistry_code']",
    );
    expect(chemistryItem?.textContent).toContain("Chemistry code");

    const scrolled = vi.fn();
    row(container, "chemistry_code").scrollIntoView = scrolled;
    fireEvent.click(chemistryItem as HTMLElement);
    expect(scrolled).toHaveBeenCalled();
  });

  it("enables the primary and calls continue once nothing is outstanding", async () => {
    const { container, actions } = renderCard({ outstanding: [] });
    const primary = container.querySelector<HTMLButtonElement>(
      "[data-primary-action]",
    );
    expect(primary).not.toHaveAttribute("aria-disabled");
    await act(async () => {
      fireEvent.click(primary as HTMLButtonElement);
    });
    expect(actions.continue).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-outstanding-checklist]")).toBeNull();
  });

  it("can leave the action bar to the route's MobileActionBar", () => {
    const { container } = renderCard({ renderActionBar: false });
    expect(container.querySelector("[data-review-action-bar]")).toBeNull();
    expect(rows(container).length).toBeGreaterThan(0);
  });
});

describe("ExtractionReviewCard — the gate banner (§2.1.4(5))", () => {
  it("renders a pending status with the count, Resolve now scrolling to the first flagged row, and Save to review queue", async () => {
    const fields = cleanFields().map((entry) =>
      entry.fieldCode === "model"
        ? { ...entry, confidenceBand: "low" as const }
        : entry,
    );
    const { container, actions } = renderCard({
      fields,
      gate: {
        isReviewRequired: true,
        fieldsBelowThreshold: 1,
        reasonCodes: [
          "field_confidence_below_threshold",
          "field_below_confidence_threshold",
        ],
      },
    });
    const banner = container.querySelector("[data-gate-banner]");
    expect(banner).toHaveAttribute("role", "status");
    expect(banner?.textContent).toContain(
      "Needs review — 1 field below the confidence threshold. Nothing is saved until you confirm.",
    );
    // A recognised reason renders its label; an unrecognised fixture-era code renders as stored.
    expect(banner?.textContent).toContain("Low confidence on a field");
    expect(
      banner?.querySelector(
        "[data-gate-reason='field_below_confidence_threshold']",
      )?.className,
    ).toContain("text-mono");

    const scrolled = vi.fn();
    row(container, "model").scrollIntoView = scrolled;
    fireEvent.click(screen.getByRole("button", { name: "Resolve now" }));
    expect(scrolled).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Save to review queue" }),
      );
    });
    expect(actions.saveToQueue).toHaveBeenCalledTimes(1);
  });

  it("renders no banner when the gate passed", () => {
    const { container } = renderCard();
    expect(container.querySelector("[data-gate-banner]")).toBeNull();
  });
});

describe("ExtractionReviewCard — states (§2.1.6)", () => {
  it("loading: skeleton rows, the estimate, a Cancel, and the slow copy with manual entry after the threshold", () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-11T21:22:00.000Z");
    vi.setSystemTime(now);
    const { container, actions } = renderCard({
      state: "loading",
      loadingSince: now.toISOString(),
    });

    expect(
      container
        .querySelector("[data-review-card]")
        ?.getAttribute("data-review-state"),
    ).toBe("loading");
    expect(
      container.querySelectorAll("[data-field-row-skeleton]").length,
    ).toBeGreaterThan(0);
    const copy = container.querySelector("[data-loading-copy='default']");
    expect(copy).toHaveAttribute("role", "status");
    expect(copy?.textContent ?? "").toContain(READING_LABEL);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enter details manually" }),
    ).toBeNull();
    expect(rows(container)).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(SLOW_READ_AFTER_MS + 1);
    });
    expect(
      container.querySelector("[data-loading-copy='slow']")?.textContent,
    ).toContain(STILL_READING);
    expect(
      screen.getByRole("button", { name: "Enter details manually" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(actions.retakePhoto).toHaveBeenCalledTimes(1);
  });

  it("loading: a read that started long ago renders the slow copy immediately", () => {
    const { container } = renderCard({
      state: "loading",
      loadingSince: "2000-01-01T00:00:00.000Z",
    });
    expect(
      container.querySelector("[data-loading-copy='slow']"),
    ).not.toBeNull();
  });

  it("error: a critical alert in place of the rows with Try again and Enter details manually", async () => {
    const { container, actions } = renderCard({
      state: "error",
      errorMessage: "The reader did not respond.",
    });
    expect(
      container
        .querySelector("[data-review-card]")
        ?.getAttribute("data-review-state"),
    ).toBe("error");
    expect(rows(container)).toHaveLength(0);
    const alert = container.querySelector("[data-review-error] [role='alert']");
    expect(alert?.getAttribute("data-intent")).toBe("critical");
    expect(alert?.textContent).toContain("The reader did not respond.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(actions.retryExtraction).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Enter details manually" }),
      );
    });
    expect(actions.enterManually).toHaveBeenCalledTimes(1);
  });

  it("empty: E-4's no-read state, verbatim, with three actions, the photo and three tips — and no rows", async () => {
    const { container, actions } = renderCard({
      state: "empty",
      fields: [],
      originalPhoto: {
        src: "data:image/png;base64,",
        alt: "Label photo",
        width: 640,
        height: 480,
      },
    });
    expect(
      container
        .querySelector("[data-review-card]")
        ?.getAttribute("data-review-state"),
    ).toBe("empty");
    expect(container.querySelector("[data-no-read-state]")).not.toBeNull();
    expect(screen.getByText(NO_READ_TITLE)).toBeInTheDocument();
    expect(
      screen.getByText(
        "The photo may be too blurred, too dark, at too steep an angle, or the label may be worn.",
      ),
    ).toBeInTheDocument();
    expect(rows(container)).toHaveLength(0);
    expect(container.querySelector("[data-gate-banner]")).toBeNull();

    expect(container.querySelectorAll("[data-no-read-tips] li")).toHaveLength(
      3,
    );
    expect(
      container.querySelector("[data-no-read-photo]")?.className,
    ).toContain("w-full");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Re-take the photo" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Enter the details by hand" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Search the catalog" }),
      );
    });
    expect(actions.retakePhoto).toHaveBeenCalledTimes(1);
    expect(actions.enterManually).toHaveBeenCalledTimes(1);
    expect(actions.searchCatalog).toHaveBeenCalledTimes(1);
  });

  it("empty and low-confidence are different states with different treatment (E-4)", () => {
    const low = renderCard({
      fields: cleanFields().map((entry) => ({
        ...entry,
        confidenceBand: "low" as const,
      })),
      gate: {
        isReviewRequired: true,
        fieldsBelowThreshold: 11,
        reasonCodes: ["field_confidence_below_threshold"],
      },
    });
    const lowState = low.container
      .querySelector("[data-review-card]")
      ?.getAttribute("data-review-state");
    expect(rows(low.container).length).toBeGreaterThan(0);
    expect(low.container.querySelector("[data-no-read-state]")).toBeNull();
    low.unmount();

    const empty = renderCard({ state: "empty", fields: [] });
    const emptyState = empty.container
      .querySelector("[data-review-card]")
      ?.getAttribute("data-review-state");
    expect(emptyState).toBe("empty");
    expect(emptyState).not.toBe(lowState);
    expect(rows(empty.container)).toHaveLength(0);
    expect(
      empty.container.querySelector("[data-no-read-state]"),
    ).not.toBeNull();
  });

  it("disabled: every control aria-disabled and dimmed, one alert stating why, values readable, handlers inert", async () => {
    const { container, actions } = renderCard({
      state: "disabled",
      disabledReason:
        "You're offline — confirmations can't be saved until you reconnect",
    });
    const alerts = container.querySelectorAll("[data-review-disabled]");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain(
      "You're offline — confirmations can't be saved until you reconnect",
    );

    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      // Enlarging the crop is reading, not confirming; it stays available.
      if (button.hasAttribute("data-crop-thumbnail")) continue;
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toHaveAttribute("disabled");
      expect(button.className).toContain("opacity-60");
    }
    // Values stay fully readable.
    expect(
      within(row(container, "manufacturer")).getByText(
        "Northvale Cell Systems",
      ),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        within(row(container, "manufacturer")).getByRole("button", {
          name: "Confirm",
        }),
      );
    });
    expect(actions.confirmField).not.toHaveBeenCalled();
  });
});

describe("ExtractionReviewCard — reject the read, void the item (§2.1.5)", () => {
  it("opens the whole-read reject dialog with the spec's copy and calls rejectRead on confirm", async () => {
    const { actions } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Reject this read" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(
      "Discard everything read from this label?",
    );
    expect(dialog.textContent).toContain(
      "Your photos are kept. You'll re-take the photo or enter the details by hand.",
    );
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Discard the read" }),
      );
    });
    expect(actions.rejectRead).toHaveBeenCalledTimes(1);
  });

  it("renders Void only in review mode, and refuses an empty reason", async () => {
    const intake = renderCard({
      actions: { ...baseProps().actions, voidItem: undefined },
    });
    expect(screen.queryByRole("button", { name: "Void this item" })).toBeNull();
    intake.unmount();

    const { actions } = renderCard({ mode: "review" });
    fireEvent.click(screen.getByRole("button", { name: "Void this item" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Void with this reason",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(dialog.textContent).toContain(
      "A reason is required before this can be voided.",
    );

    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(actions.voidItem).not.toHaveBeenCalled();

    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Reason for voiding" }),
      { target: { value: "Duplicate of BR-0004" } },
    );
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Void with this reason" }),
      );
    });
    expect(actions.voidItem).toHaveBeenCalledWith("Duplicate of BR-0004");
  });
});

describe("ExtractionReviewCard — never a probability, never a chemistry from a camera", () => {
  it("renders no forbidden word in any state", () => {
    const variants: readonly Parameters<typeof renderCard>[0][] = [
      {},
      { state: "loading", loadingSince: "2000-01-01T00:00:00.000Z" },
      { state: "error", errorMessage: "The reader did not respond." },
      { state: "empty", fields: [] },
      { state: "disabled", disabledReason: "Your support grant expired" },
      {
        mode: "review",
        catalogMatchState: "empty",
        candidates: [],
        cannotShipNote: true,
      },
      { catalogMatchState: "error" },
      { catalogMatchState: "loading" },
      {
        gate: {
          isReviewRequired: true,
          fieldsBelowThreshold: 2,
          reasonCodes: ["catalog_match_ambiguous"],
        },
        fields: cleanFields().map((entry) => ({
          ...entry,
          rawConfidence: "0.41",
          confidenceBand: "low" as const,
        })),
      },
    ];
    for (const variant of variants) {
      const { container, unmount } = renderCard(variant);
      const text =
        container.querySelector("[data-review-card]")?.textContent ?? "";
      expect(text).not.toMatch(FORBIDDEN_WORDS);
      expect(text).not.toMatch(/%/);
      unmount();
    }
  });
});
