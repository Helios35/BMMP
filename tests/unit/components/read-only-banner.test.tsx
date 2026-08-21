// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  ReadOnlyBanner,
  READ_ONLY_BANNER_MESSAGE,
} from "@/components/access/read-only-banner";
import {
  AUDITOR_READ_ONLY_REASON,
  controlTreatment,
  showsReadOnlyBanner,
} from "@/domain/access";

/**
 * `ReadOnlyBanner` in isolation, in every state `UX_SPEC.md` §2.9 defines for
 * it: default, hover, focus, active, disabled, loading, error, empty.
 *
 * **Seven of the eight are `n/a`, and §2.9's own table says why**: it is "a
 * `neutral` `Alert` pinned below the page title" and nothing else. It is not
 * interactive, so there is no hover, focus, active or disabled state; it renders
 * one fixed sentence from no data, so there is nothing to load, nothing to fail
 * and nothing to be empty of. The negatives are asserted here rather than
 * omitted.
 *
 * The decision to render it is **not this component's** and is not tested here:
 * `showsReadOnlyBanner` in `@/domain/access` holds §2.9's table, and the tests
 * below pin the two rows unit 03 depends on.
 */

describe("ReadOnlyBanner — default", () => {
  it("renders §2.9's sentence verbatim, including the promise about export", () => {
    render(<ReadOnlyBanner />);
    expect(screen.getByText(READ_ONLY_BANNER_MESSAGE)).toBeInTheDocument();
    // The sentence is load-bearing: it tells the auditor export is not among the
    // things she cannot do, and Rule 5.27 makes that binding on every route.
    expect(READ_ONLY_BANNER_MESSAGE).toBe(
      "Read-only access. You can view and export everything on this page; you can't change it.",
    );
  });

  it("carries an icon and text as well as colour, and announces politely", () => {
    // Colour is never the only signal (§1.2 Rule 4). A standing condition is
    // `status`, not `alert`: it should not interrupt on arrival.
    const { container } = render(<ReadOnlyBanner />);
    const banner = container.querySelector("[data-banner-state]");
    expect(banner?.getAttribute("role")).toBe("status");
    expect(banner?.getAttribute("data-intent")).toBe("neutral");
    expect(banner?.className).toContain("bg-intent-neutral-background");
    expect(banner?.querySelector("svg")).not.toBeNull();
  });

  it("is not dismissible — the restriction does not stop applying once it is read", () => {
    const { container } = render(<ReadOnlyBanner />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("[role='button']")).toHaveLength(0);
  });
});

describe("ReadOnlyBanner — hover, focus, active, disabled, loading, error, empty are n/a", () => {
  it("is not interactive, so it has no hover, focus, active or disabled state", () => {
    const { container } = render(<ReadOnlyBanner />);
    const banner = container.querySelector(
      "[data-banner-state]",
    ) as HTMLElement;
    expect(banner.className).not.toContain("hover:");
    expect(banner.className).not.toContain("active:");
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("renders one fixed sentence from no data, so it cannot load, fail or be empty", () => {
    // There is deliberately no `ReadOnlyBannerSkeleton` and no error variant:
    // the component takes no input beyond an optional class, so a loading or
    // error state would be a state it can never enter.
    const { container } = render(<ReadOnlyBanner />);
    expect(container.querySelector("[data-slot='skeleton']")).toBeNull();
    expect(
      container
        .querySelector("[data-banner-state]")
        ?.getAttribute("data-banner-state"),
    ).toBe("default");
  });
});

describe("§2.9's decision table — the rule unit 03 depends on", () => {
  it("renders for the auditor where the route has something to change", () => {
    expect(
      showsReadOnlyBanner({ role: "auditor", routeHasMutatingControls: true }),
    ).toBe(true);
  });

  it("does not render on a page nobody can change", () => {
    // A banner announcing a restriction on a page with no controls says nothing.
    expect(
      showsReadOnlyBanner({ role: "auditor", routeHasMutatingControls: false }),
    ).toBe(false);
  });

  it("is not for P2 on /review — that view is composed, not gated (E-8b)", () => {
    // A disabled control tells a colleague she is missing a permission; an
    // absent one tells her this is not her job. Unit 03 composes P2's view and
    // does not render this component.
    expect(
      showsReadOnlyBanner({
        role: "facility_manager",
        routeHasMutatingControls: true,
      }),
    ).toBe(false);
  });

  it("is for no other role, on any route", () => {
    for (const role of [
      "compliance_handler",
      "producer_compliance_officer",
      "mobility_supplier_technician",
      "platform_admin",
    ] as const) {
      expect(
        showsReadOnlyBanner({ role, routeHasMutatingControls: true }),
      ).toBe(false);
    }
  });

  it("pairs with disabled-not-absent for the auditor's mutating controls", () => {
    expect(
      controlTreatment({
        role: "auditor",
        capability: "read",
        isDestructive: false,
        isExportOrPrint: false,
      }),
    ).toBe("disabled_with_reason");
    // Destructive controls are omitted entirely: there is no value in showing an
    // auditor a disabled Delete.
    expect(
      controlTreatment({
        role: "auditor",
        capability: "read",
        isDestructive: true,
        isExportOrPrint: false,
      }),
    ).toBe("absent");
    // Export is never disabled for any role that can reach the route (E-8a,
    // Rule 5.27) — which is exactly what the banner's sentence promises.
    expect(
      controlTreatment({
        role: "auditor",
        capability: "read",
        isDestructive: false,
        isExportOrPrint: true,
      }),
    ).toBe("enabled");
    expect(AUDITOR_READ_ONLY_REASON).toBe("Read-only access — Auditor role.");
  });
});
