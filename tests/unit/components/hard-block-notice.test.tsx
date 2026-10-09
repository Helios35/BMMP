// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { HardBlockNotice } from "@/components/hard-block/hard-block-notice";
import { StatusBadge } from "@/components/status/status-badge";

/**
 * `HardBlockNotice` — `UX_SPEC.md` §2.6; Rules 6.9, 6.10. The five parts are
 * all required, the paths are the caller's and nothing else, and the error
 * state fails closed.
 */

const BLOCKED = {
  state: "blocked" as const,
  dataAttribute: "air",
  title: "Air transport is not available for this shipment.",
  statement:
    "Damaged, defective and recalled batteries are prohibited from air transport.",
  citations: ["Test citation from the governing rule version"],
  missingCitation: "No citation is on file.",
  items: [
    {
      id: "r-1",
      label: "BR-0003",
      href: "/batteries/r-1",
      indicators: ["swelling"],
    },
    {
      id: "r-2",
      label: "BR-0009",
      href: null,
      indicators: ["recall association"],
    },
  ],
  paths: [
    { id: "ground", label: "Ship by ground", href: "/a" },
    {
      id: "remove",
      label: "Remove these records and ship the rest by air",
      href: "/b",
    },
    { id: "reassess", label: "Re-assess the damage on a record", href: "/c" },
  ],
};

describe("HardBlockNotice", () => {
  it("carries all five parts: statement, citation, records, indicators, and the way forward", () => {
    const { container } = render(<HardBlockNotice {...BLOCKED} />);
    const notice = container.querySelector("[data-hard-block-notice='air']");
    expect(notice?.getAttribute("role")).toBe("alert");
    expect(screen.getByText(BLOCKED.statement)).toBeInTheDocument();
    expect(
      screen.getByText("Test citation from the governing rule version"),
    ).toBeInTheDocument();
    expect(screen.getByText("BR-0003")).toBeInTheDocument();
    expect(screen.getByText("— swelling")).toBeInTheDocument();
    // A recall is named as a recall, not as damage (§2.6).
    expect(screen.getByText("— recall association")).toBeInTheDocument();
  });

  it("offers exactly the caller's paths, as actions — three for air, and no override", () => {
    const { container } = render(<HardBlockNotice {...BLOCKED} />);
    const paths = [...container.querySelectorAll("[data-hard-block-path]")];
    expect(
      paths.map((path) => path.getAttribute("data-hard-block-path")),
    ).toEqual(["ground", "remove", "reassess"]);
    expect(paths.every((path) => path.tagName === "A")).toBe(true);
    // No acknowledge, proceed or override control of any kind.
    expect(container.querySelector("input[type='checkbox']")).toBeNull();
    expect(container.textContent).not.toMatch(
      /proceed|override|understand the risk/i,
    );
  });

  it("states a missing citation rather than inventing one", () => {
    const { container } = render(
      <HardBlockNotice {...BLOCKED} citations={[]} />,
    );
    expect(
      container.querySelector("[data-hard-block-citation='missing']")
        ?.textContent,
    ).toBe("No citation is on file.");
  });

  it("fails closed when the constraint could not be evaluated, with Retry", () => {
    const { container } = render(
      <HardBlockNotice
        state="error"
        dataAttribute="air"
        message="We couldn't confirm this shipment's constraints. Air transport is unavailable until we can."
        retryHref="/shipments/new?step=2"
        retryLabel="Retry"
      />,
    );
    expect(
      container.querySelector("[data-hard-block-state='error']"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-hard-block-retry]")?.getAttribute("href"),
    ).toBe("/shipments/new?step=2");
  });
});

describe("StatusBadge — escalateTo (E-14)", () => {
  it("raises an ok status to attention, so no green tick shows while a manifest is outstanding", () => {
    const { container } = render(
      <StatusBadge
        system="shipment_status"
        value="documents_issued"
        escalateTo="attention"
      />,
    );
    expect(
      container
        .querySelector("[data-status-state='default']")
        ?.getAttribute("data-intent"),
    ).toBe("attention");
  });

  it("never softens a value's own intent", () => {
    const { container } = render(
      <StatusBadge system="ddr_flag" value="damaged" escalateTo="attention" />,
    );
    expect(
      container
        .querySelector("[data-status-state='default']")
        ?.getAttribute("data-intent"),
    ).toBe("critical");
  });
});
