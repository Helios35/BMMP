// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  ContainerFillMeter,
  ContainerFillMeterSkeleton,
  decimalText,
  NO_LIMIT_CAPTION,
} from "@/components/storage/container-fill-meter";

/**
 * `ContainerFillMeter` — `UX_SPEC.md` §2.5; Rules 4.25, 4.26; E-7.
 *
 * **No number and no unit is a literal in the component**: every figure here
 * is handed in, and a limit arrives with its own unit and source. With no
 * limit configured it says so and never invents one; over a limit it warns and
 * blocks nothing (B1a).
 */

const READING = { current: "504.500", capacity: "900.000", unit: "kg" };

describe("ContainerFillMeter", () => {
  it("renders fill against capacity in the column's unit, as text and as a bar", () => {
    render(
      <ContainerFillMeter
        reading={READING}
        limit={null}
        label="Fill for C-0001"
      />,
    );
    expect(screen.getByText("504.5 of 900 kg")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Fill for C-0001" });
    expect(bar).toHaveAttribute("aria-valuenow", "56");
    expect(bar).toHaveAttribute("aria-valuetext", "504.5 of 900 kg");
  });

  it("states that no quantity limit is set, rather than inventing one (E-7)", () => {
    const { container } = render(
      <ContainerFillMeter reading={READING} limit={null} label="Fill" />,
    );
    expect(screen.getByText(NO_LIMIT_CAPTION)).toBeInTheDocument();
    expect(container.querySelector("[data-fill-over-limit]")).toBeNull();
  });

  it("warns over a limit with the reading, the limit, its unit and its source — and blocks nothing", () => {
    const { container } = render(
      <ContainerFillMeter
        reading={READING}
        limit={{
          value: "15",
          unit: "cu ft",
          reading: "18.2",
          source: "per your site's jurisdiction and fire-code profile",
        }}
        label="Fill"
        settingsHref="/settings/organization"
      />,
    );
    const warning = container.querySelector("[data-fill-over-limit]");
    expect(warning?.textContent).toContain(
      "18.2 cu ft — over the 15 cu ft limit for this site.",
    );
    expect(warning?.textContent).toContain(
      "per your site's jurisdiction and fire-code profile",
    );
    expect(warning?.textContent).toContain("Nothing is blocked.");
    // A warning, never a control to argue with.
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders the unit the rule gives it — energy as readily as volume", () => {
    const { container } = render(
      <ContainerFillMeter
        reading={READING}
        limit={{
          value: "40000",
          unit: "Wh",
          reading: "12000",
          source: "per rule",
        }}
        label="Fill"
      />,
    );
    expect(container.querySelector("[data-fill-limit]")?.textContent).toContain(
      "12000 of the 40000 Wh limit",
    );
  });

  it("says empty, and says when no capacity was recorded", () => {
    render(
      <ContainerFillMeter
        reading={{ current: null, capacity: null, unit: "kg" }}
        limit={null}
        label="Fill"
      />,
    );
    expect(
      screen.getByText("Empty · no capacity recorded"),
    ).toBeInTheDocument();
  });

  it("stands in at its own height while loading", () => {
    const { container } = render(<ContainerFillMeterSkeleton />);
    expect(
      container.querySelector('[data-fill-meter-state="loading"]'),
    ).not.toBeNull();
  });

  it("drops trailing zeros and never changes a digit", () => {
    expect(decimalText("504.500")).toBe("504.5");
    expect(decimalText("900.000")).toBe("900");
    expect(decimalText("0.310")).toBe("0.31");
    expect(decimalText("120")).toBe("120");
  });

  it("contains no threshold number or unit as a literal (Rule 1.23; _ANCHORS.md §7.4)", () => {
    // jsdom's `import.meta.url` is not a file URL; the repo root is the cwd.
    const source = readFileSync(
      path.join(
        process.cwd(),
        "src/components/storage/container-fill-meter.tsx",
      ),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const forbidden of [
      "cu ft",
      "ft³",
      "m³",
      "kWh",
      '"kg"',
      "15",
      'Wh"',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
