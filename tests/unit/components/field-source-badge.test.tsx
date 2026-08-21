// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  FieldSourceBadge,
  FieldSourceBadgeSkeleton,
  FIELD_SOURCES,
  type FieldSource,
} from "@/components/provenance/field-source-badge";

/**
 * `FieldSourceBadge` in isolation, in every state `UX_SPEC.md` §2.1 / §3.7
 * defines for it: default, hover, focus, active, disabled, loading, error,
 * empty.
 *
 * **Hover, focus, active and disabled are `n/a`, for the same reason `StatusBadge`
 * has none** (§2.3): a badge is not a control. Where a source needs to be
 * actionable it is wrapped in a link and the wrapper takes the ring.
 *
 * **Empty is `n/a` too**: the source is derived per field from which column
 * carried the value, so a rendered field always has one. A field with no value
 * renders no badge rather than an empty badge — the absence is the parent's
 * state, not this component's.
 *
 * **Error is `n/a`**: `FieldSource` is a closed union authored by the spec, not
 * a stored `TAXONOMY.md` value, so there is no "unrecognised value" case to
 * render. That is asserted below, because it is the difference between this
 * component and `StatusBadge` and the next builder will want to know it.
 */

describe("FieldSourceBadge — default", () => {
  it.each([
    ["read_from_label", "Read from label"],
    ["matched_from_catalog", "Matched from catalog"],
    ["decoded", "Decoded"],
    ["detected_from_image", "Detected from image"],
  ] as const)("renders %s as %s", (source, label) => {
    render(<FieldSourceBadge source={source as FieldSource} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("names the person for a value a person entered", () => {
    render(<FieldSourceBadge source="entered_by" enteredByName="Dana Ruiz" />);
    expect(screen.getByText("Entered by Dana Ruiz")).toBeInTheDocument();
  });

  it("falls back to the bare phrase rather than inventing a name", () => {
    // An attribution without the person is not an attribution. Saying less is
    // correct; saying a name the system does not hold is not.
    render(<FieldSourceBadge source="entered_by" />);
    expect(screen.getByText("Entered by")).toBeInTheDocument();
  });

  it("always renders visible text beside the icon, never a bare icon", () => {
    // A badge with no text is a decoration and is not permitted (§1.2 Rule 4).
    for (const source of FIELD_SOURCES) {
      const { container, unmount } = render(
        <FieldSourceBadge source={source} enteredByName="Dana Ruiz" />,
      );
      const badge = container.querySelector("[data-field-source]");
      expect(badge?.querySelector("svg")).not.toBeNull();
      expect((badge?.textContent ?? "").trim().length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("is always neutral — a source is not a status and never grades a field", () => {
    for (const source of FIELD_SOURCES) {
      const { container, unmount } = render(
        <FieldSourceBadge source={source} />,
      );
      const badge = container.querySelector("[data-field-source]");
      expect(badge?.getAttribute("data-intent")).toBe("neutral");
      expect(badge?.className).toContain("bg-intent-neutral-background");
      unmount();
    }
  });

  it("renders its label at the caption token, never at the primitive's text-xs", () => {
    // A6 — nothing renders below the floor. The generated Badge bakes in
    // `text-xs` (12px), so the label carries the type token itself.
    const { container } = render(<FieldSourceBadge source="decoded" />);
    const label = container.querySelector("[data-field-source] span");
    expect(label?.className).toContain("text-caption");
  });

  it("exposes the stored-shaped source for an assertion", () => {
    const { container } = render(<FieldSourceBadge source="decoded" />);
    expect(
      container
        .querySelector("[data-field-source]")
        ?.getAttribute("data-field-source"),
    ).toBe("decoded");
  });
});

describe("FieldSourceBadge — the five sources are the whole vocabulary", () => {
  it("has exactly the five §2.1 names, in order", () => {
    // One vocabulary, rendered by `/batteries/[id]` here and by unit 02's
    // `ExtractionReviewCard` on the write side. A second copy would drift, and
    // the second copy is the one that ends up in a PDF.
    expect(FIELD_SOURCES).toEqual([
      "read_from_label",
      "matched_from_catalog",
      "decoded",
      "detected_from_image",
      "entered_by",
    ]);
  });

  it("never implies a camera identified chemistry", () => {
    // Rule 2.10 admits exactly two sources for chemistry — a matched catalog
    // entry or direct human entry (`_ANCHORS.md` §7.2). The badge carries the
    // vocabulary; the rule is enforced where the source is derived. What this
    // asserts is that no label here says anything about chemistry at all, so
    // pairing one with a chemistry field cannot smuggle the claim in.
    for (const source of FIELD_SOURCES) {
      const { container, unmount } = render(
        <FieldSourceBadge source={source} />,
      );
      expect((container.textContent ?? "").toLowerCase()).not.toContain(
        "chemistry",
      );
      unmount();
    }
  });

  it("expresses no probability, likelihood or confidence of anything", () => {
    // Rule 1.25, and §0: confidence is never placed near, combined with, or
    // styled like a condition, damage or hazard signal. A source says where a
    // value came from and nothing about how sure anyone is of it.
    const forbidden =
      /probability|likelihood|risk of fire|chance of|confidence|%|\bscore\b/i;
    for (const source of FIELD_SOURCES) {
      const { container, unmount } = render(
        <FieldSourceBadge source={source} enteredByName="Dana Ruiz" />,
      );
      expect(container.textContent ?? "").not.toMatch(forbidden);
      unmount();
    }
  });
});

describe("FieldSourceBadge — hover, focus, active, disabled, error and empty are n/a", () => {
  it("never becomes interactive on its own", () => {
    const { container } = render(<FieldSourceBadge source="decoded" />);
    const badge = container.querySelector("[data-field-source]") as HTMLElement;
    expect(badge.tagName).toBe("SPAN");
    expect(badge.getAttribute("tabindex")).toBeNull();
    expect(badge.getAttribute("role")).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    // The generated Badge's only hover treatment is `[a]:hover:`, which applies
    // solely inside an anchor — §2.3's "wrap it; do not make the badge
    // interactive". The badge adds none of its own.
    expect(badge.className.replace(/\[a\]:hover:\S+/g, "")).not.toContain(
      "hover:",
    );
    expect(badge.className).not.toContain("active:");
  });

  it("has no unrecognised-value state, because the union is closed and unstored", () => {
    // `StatusBadge` renders an unrecognised stored value because a retired
    // taxonomy value can arrive from the database. A `FieldSource` is derived in
    // code from which column carried the value, so an unknown one is a type
    // error, caught before it can render.
    const everyRendered = FIELD_SOURCES.map((source) => {
      const { container } = render(<FieldSourceBadge source={source} />);
      return container.querySelector("[data-field-source]");
    });
    expect(everyRendered.every((badge) => badge !== null)).toBe(true);
  });
});

describe("FieldSourceBadge — loading", () => {
  it("renders at the badge's exact height, so a field row never reflows", () => {
    const { container } = render(<FieldSourceBadgeSkeleton />);
    const skeleton = container.querySelector(
      "[data-field-source-state='loading']",
    );
    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain("h-6");
  });
});
