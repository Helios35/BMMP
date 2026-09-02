// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import * as fixtures from "@/data/mock/fixtures";
import * as ID from "@/data/mock/fixtures/ids";
import { AUDITOR_READ_ONLY_REASON } from "@/domain/access/control-treatment";
import { NO_SESSION_FOR_PHOTO } from "@/features/battery-record/components/edit-condition-dialog";
import { RecordActions } from "@/features/battery-record/record-actions";

/**
 * `RecordActions` — both branches.
 *
 * **The auditor branch is byte-identical to what unit 01 shipped.** The
 * fixture beside this file is that branch's rendered HTML, captured before
 * this unit touched the component; `guard-auditor-controls.spec.ts` asserts
 * on the same output from the outside, and a diff here is a diff there.
 *
 * The enabled branch renders the same four controls with the same
 * `data-control` ids, so a test written against one screen finds the same
 * things on the other.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

/** jsdom has no ResizeObserver; Radix's tooltip measures with one on mount. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const AUDITOR_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "unit",
  "features",
  "battery-record",
  "__fixtures__",
  // `.txt` so `prettier --check` never reflows it: the assertion is
  // byte-for-byte against what unit 01 rendered.
  "record-actions-auditor.html.txt",
);

function record(id: string) {
  const row = fixtures.batteryRecords.find((entry) => entry.id === id);
  if (row === undefined) throw new Error("No battery record fixture");
  return row;
}

function assessment(id: string) {
  const row = fixtures.damageAssessments.find((entry) => entry.id === id);
  if (row === undefined) throw new Error("No damage assessment fixture");
  return row;
}

describe("RecordActions — the auditor branch is unchanged", () => {
  it("renders exactly the HTML unit 01 shipped", () => {
    const { container } = render(
      <RecordActions role="auditor" capability="read" recordId="rec-1" />,
    );
    expect(container.innerHTML).toBe(readFileSync(AUDITOR_FIXTURE, "utf8"));
  });

  it("still carries three inert controls with the reason, and no destructive one", () => {
    const { container } = render(
      <RecordActions role="auditor" capability="read" recordId="rec-1" />,
    );
    const mutating = container.querySelectorAll('[data-mutating="true"]');
    expect(mutating).toHaveLength(3);
    for (const control of mutating) {
      expect(control).toHaveAttribute("aria-disabled", "true");
      expect(control).not.toHaveAttribute("disabled");
    }
    expect(
      container.querySelectorAll('[data-destructive="true"]'),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-gated-reason="true"]'),
    ).toHaveLength(3);
    expect(container.textContent).toContain(AUDITOR_READ_ONLY_REASON);
  });
});

describe("RecordActions — the enabled branch", () => {
  const vehicle = record(ID.BATTERY.vehicleTraction);
  const sound = assessment(ID.DAMAGE.vehicleSound);

  it("renders four live controls with the same data attributes", () => {
    const { container } = render(
      <RecordActions
        role="compliance_handler"
        capability="write"
        recordId={vehicle.id}
        record={vehicle}
        currentAssessment={sound}
      />,
    );

    const controls = [...container.querySelectorAll("[data-control]")].map(
      (node) => node.getAttribute("data-control"),
    );
    expect(controls).toEqual([
      "edit-assessed-condition",
      "rerun-catalog-matching",
      "attach-a-photo",
      "void-this-record",
    ]);

    const mutating = container.querySelectorAll('[data-mutating="true"]');
    expect(mutating).toHaveLength(4);
    for (const control of mutating) {
      // 44px targets, never the `disabled` attribute.
      expect(control.className).toContain("min-h-11");
      expect(control).not.toHaveAttribute("disabled");
    }

    const voidControl = container.querySelector(
      '[data-control="void-this-record"]',
    );
    expect(voidControl).toHaveAttribute("data-destructive", "true");
    expect(voidControl).toHaveAttribute("data-variant", "destructive");

    // The record's session is present, so nothing is gated.
    expect(
      container.querySelectorAll('[data-gated-control="true"]'),
    ).toHaveLength(0);
    expect(
      container.querySelector('[data-record-actions="true"]'),
    ).toHaveAttribute("data-record-id", vehicle.id);
  });

  it("gates Attach a photo with the record's own reason when there is no intake session", () => {
    const noSession = record(ID.BATTERY.mobilityScooter);
    expect(noSession.intakeSessionId).toBeNull();

    const { container } = render(
      <RecordActions
        role="compliance_handler"
        capability="write"
        recordId={noSession.id}
        record={noSession}
        currentAssessment={assessment(ID.DAMAGE.mobilitySound)}
      />,
    );

    const attach = container.querySelector('[data-control="attach-a-photo"]');
    expect(attach).toHaveAttribute("aria-disabled", "true");
    expect(attach).not.toHaveAttribute("disabled");
    expect(
      attach?.closest('[data-gated-control="true"]')?.textContent,
    ).toContain(NO_SESSION_FOR_PHOTO);

    // The other three are live.
    expect(
      container.querySelector('[data-control="edit-assessed-condition"]'),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("renders the enabled branch for the platform admin holding write", () => {
    const { container } = render(
      <RecordActions
        role="platform_admin"
        capability="write"
        recordId={vehicle.id}
        record={vehicle}
      />,
    );
    expect(container.querySelectorAll('[data-mutating="true"]')).toHaveLength(
      4,
    );
  });

  it("renders nothing for a role with read that is not the auditor", () => {
    const { container } = render(
      <RecordActions
        role="producer_compliance_officer"
        capability="read"
        recordId={vehicle.id}
        record={vehicle}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
