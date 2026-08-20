// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  ConfidenceBandDisplay,
  ConfidenceBandDisplaySkeleton,
} from "@/components/confidence/confidence-band-display";
import { CONFIDENCE_BANDS } from "@/domain/taxonomy/confidence-band";

/**
 * The confidence-band display in isolation — `UX_SPEC.md` §2.1.2 and D-22.
 *
 * The properties under test are the ones that carry legal and product weight:
 * four states rather than three, the band label primary and the number
 * secondary, no percentage anywhere, and no threshold in the component.
 */

describe("ConfidenceBandDisplay — default", () => {
  it("renders all four bands with the intents §2.1.2 assigns", () => {
    const expected = {
      high: { label: "High", intent: "ok" },
      medium: { label: "Medium", intent: "attention" },
      low: { label: "Low", intent: "critical" },
      not_extracted: { label: "None", intent: "neutral" },
    } as const;

    // Four states, not three (D-22). `not_extracted` reads "None" — an
    // extraction ran and read nothing, which is a real answer.
    expect(CONFIDENCE_BANDS).toHaveLength(4);

    for (const band of CONFIDENCE_BANDS) {
      const { container, unmount } = render(
        <ConfidenceBandDisplay band={band} />,
      );
      const badge = container.querySelector(
        "[data-confidence-state='default']",
      );
      expect(badge?.getAttribute("data-band"), band).toBe(band);
      expect(badge?.getAttribute("data-intent"), band).toBe(
        expected[band].intent,
      );
      expect(screen.getByText(expected[band].label)).toBeInTheDocument();
      expect(badge?.querySelector("svg"), band).not.toBeNull();
      unmount();
    }
  });

  it("makes the band the primary signal and the number secondary (D-22)", () => {
    const { container } = render(
      <ConfidenceBandDisplay band="low" rawConfidence="0.52907" />,
    );
    const badge = container.querySelector("[data-confidence-state='default']");
    const score = container.querySelector("[data-confidence-score]");
    // The band sits in the badge; the score sits beneath it as caption-sized
    // metadata. Nobody reads two decimal places as precision the extraction
    // does not have.
    expect(badge?.textContent).toContain("Low");
    expect(badge?.textContent).not.toContain("0.52907");
    expect(score?.textContent).toContain("0.52907");
    expect(score?.className).toContain("text-muted-foreground");
  });

  it("never renders the raw score as a percentage (T-10, D-22)", () => {
    const { container } = render(
      <ConfidenceBandDisplay band="medium" rawConfidence="0.78440" />,
    );
    // The provider's number is a score in 0..1, rendered as its exact stored
    // digits. A `%` beside it would imply a calibration nobody has established.
    expect(container.textContent).not.toContain("%");
    expect(container.textContent).not.toContain("78.44");
    expect(container.textContent).toContain("0.78440");
  });

  it("omits the score cleanly when there is none", () => {
    // `not_extracted` has no raw confidence — a null score, not a zero one.
    const { container } = render(
      <ConfidenceBandDisplay band="not_extracted" rawConfidence={null} />,
    );
    expect(container.querySelector("[data-confidence-score]")).toBeNull();
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("says a hard-gated field is always confirmed by a person (Rule 2.15)", () => {
    // Model, chemistry code and assessed condition never auto-commit, at any
    // band — so a `High` badge on one of them must not imply otherwise.
    const { container } = render(
      <ConfidenceBandDisplay band="high" rawConfidence="0.99" isHardGated />,
    );
    expect(
      container.querySelector("[data-confidence-hard-gated]")?.textContent,
    ).toBe("Always confirmed by a person");
  });

  it("carries no threshold value anywhere in its output", () => {
    // The cutoffs are platform configuration owned by P6 (D-22). A component
    // that printed one would make a configuration change a redesign.
    for (const band of CONFIDENCE_BANDS) {
      const { container, unmount } = render(
        <ConfidenceBandDisplay band={band} />,
      );
      expect(container.textContent ?? "").not.toMatch(/\d/);
      unmount();
    }
  });

  it("never names a hazard, a probability or a condition", () => {
    // Confidence is a property of a text extraction from an image. It is never
    // placed near, combined with, or styled like a condition, damage or hazard
    // signal (UX_SPEC.md §0), and never expresses a probability of ignition.
    const { container } = render(
      <ConfidenceBandDisplay band="low" rawConfidence="0.30" isHardGated />,
    );
    expect(container.textContent ?? "").not.toMatch(
      /risk|hazard|probability|likelihood|damage|fire|ignition/i,
    );
  });
});

describe("ConfidenceBandDisplay — empty", () => {
  it("distinguishes 'not yet evaluated' from 'read nothing'", () => {
    // A field with no extraction is not the same as a field an extraction read
    // nothing from. Collapsing the two loses the difference between "we have
    // not looked" and "we looked and could not read it".
    for (const band of [null, undefined, ""]) {
      const { container, unmount } = render(
        <ConfidenceBandDisplay band={band} />,
      );
      expect(
        container.querySelector("[data-confidence-state='empty']"),
      ).not.toBeNull();
      expect(screen.getByText("Not evaluated")).toBeInTheDocument();
      unmount();
    }

    const extracted = render(<ConfidenceBandDisplay band="not_extracted" />);
    expect(
      extracted.container.querySelector("[data-confidence-state='default']"),
    ).not.toBeNull();
    expect(screen.getByText("None")).toBeInTheDocument();
  });
});

describe("ConfidenceBandDisplay — error", () => {
  it("renders an unrecognised band as stored, in mono, never coerced", () => {
    const { container } = render(<ConfidenceBandDisplay band="very_high" />);
    expect(
      container.querySelector("[data-confidence-state='unrecognised']"),
    ).not.toBeNull();
    expect(screen.getByText("very_high")).toBeInTheDocument();
    // Not silently read as `high`, which would be a fabricated confidence.
    expect(screen.queryByText("High")).not.toBeInTheDocument();
  });
});

describe("ConfidenceBandDisplay — loading", () => {
  it("renders a skeleton for both the band and the score line", () => {
    const { container } = render(<ConfidenceBandDisplaySkeleton />);
    const skeleton = container.querySelector(
      "[data-confidence-state='loading']",
    );
    expect(skeleton).not.toBeNull();
    expect(skeleton?.querySelectorAll("[data-slot='skeleton']")).toHaveLength(
      2,
    );
  });
});

describe("ConfidenceBandDisplay — hover, focus, active and disabled", () => {
  it("is not interactive, so none of the four states exist on it", () => {
    const { container } = render(<ConfidenceBandDisplay band="high" />);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[tabindex]")).toBeNull();
  });
});
