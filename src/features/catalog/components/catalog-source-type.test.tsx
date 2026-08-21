// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { CATALOG_ENTRY_SOURCE_TYPE_LABELS } from "@/domain/taxonomy/catalog-entry-source-type";
import { CatalogSourceType } from "./catalog-source-type";

/**
 * T-61 on `/catalog/[id]`, in both of its states.
 *
 * The unrecognised arm is the one that matters today: every catalog fixture
 * stores `manufacturer_datasheet`, which T-61 does not author
 * (`BUILD_NOTES_b1a-doc-defects.md` §2.2). **It must not crash, must not blank,
 * must not coerce to a default and must not invent a label** — and after the
 * fixture migration the same component renders the authored label with no
 * change here. That is the test on both sides.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CatalogSourceType — a value T-61 authors", () => {
  it("renders the label from the one T-61 lookup", () => {
    render(<CatalogSourceType sourceType="manufacturer_published" />);

    expect(
      screen.getByText(CATALOG_ENTRY_SOURCE_TYPE_LABELS.manufacturer_published),
    ).toBeInTheDocument();
  });
});

describe("CatalogSourceType — a value T-61 does not author", () => {
  it("renders the stored value exactly as stored, and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(<CatalogSourceType sourceType="manufacturer_datasheet" />);

    const rendered = screen.getByText("manufacturer_datasheet");
    expect(rendered).toBeInTheDocument();
    expect(rendered).toHaveAttribute("data-taxonomy-state", "unrecognised");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("never coerces to a T-61 label", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { container } = render(
      <CatalogSourceType sourceType="manufacturer_datasheet" />,
    );

    for (const label of Object.values(CATALOG_ENTRY_SOURCE_TYPE_LABELS)) {
      expect(container.textContent).not.toContain(label);
    }
  });

  it("never blanks the field", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { container } = render(<CatalogSourceType sourceType="  " />);

    // Whitespace is still a stored value. It is rendered, not dropped: a field
    // that disappears is indistinguishable from one that failed to render.
    expect(
      container.querySelector('[data-taxonomy-state="unrecognised"]'),
    ).not.toBeNull();
  });
});
