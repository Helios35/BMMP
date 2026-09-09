// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { StepperNav, type StepperNavStep } from "@/components/flow/stepper-nav";
import { INTAKE_FLOW_STEPS } from "@/domain/intake/steps";
import { INTAKE_STEP_LABELS } from "@/domain/taxonomy/intake-step";

/**
 * `StepperNav` — `UX_SPEC.md` §2.12.
 *
 * Three things are proven: the labels are T-53's and nothing else; a completed
 * step is a link and a future one is `aria-disabled` with its gate named as
 * text (never hidden, never the `disabled` attribute); and the compact bar
 * says "Step N of M · Label" with a determinate progress.
 */

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const STEPS: readonly StepperNavStep[] = INTAKE_FLOW_STEPS.map((id) => ({
  id,
  label: INTAKE_STEP_LABELS[id],
}));

const GATE_REASON = "Confirm the label fields to continue.";

function renderAt(currentIndex: number, completedThrough = currentIndex) {
  return render(
    <StepperNav
      steps={STEPS}
      currentIndex={currentIndex}
      completedThrough={completedThrough}
      hrefFor={(index) => `/batteries/new?session=s1&step=${index + 1}`}
      disabledReason={() => GATE_REASON}
      label="Intake steps"
    />,
  );
}

describe("StepperNav — labels", () => {
  it("renders the three T-53 flow labels, from the taxonomy", () => {
    const { container } = renderAt(1);
    const desktop = container.querySelector("ol");
    expect(desktop?.textContent).toContain(INTAKE_STEP_LABELS.capture);
    expect(desktop?.textContent).toContain(
      INTAKE_STEP_LABELS.extraction_review,
    );
    expect(desktop?.textContent).toContain(
      INTAKE_STEP_LABELS.confirm_and_place,
    );
    expect(desktop?.textContent).not.toContain(INTAKE_STEP_LABELS.complete);
  });

  it("says where the reader is in the compact bar", () => {
    renderAt(1);
    expect(
      screen.getByText(`Step 2 of 3 · ${INTAKE_STEP_LABELS.extraction_review}`),
    ).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Intake steps" });
    expect(bar).toHaveAttribute("aria-valuenow", "67");
  });
});

describe("StepperNav — reachability", () => {
  it("links a completed step and marks the current one", () => {
    const { container } = renderAt(1);
    const completed = container.querySelector(
      "[data-step-state='completed'] a",
    );
    expect(completed).toHaveAttribute(
      "href",
      "/batteries/new?session=s1&step=1",
    );
    const current = container.querySelector(
      "[data-step-state='current'] [aria-current='step']",
    );
    expect(current?.textContent).toContain(
      INTAKE_STEP_LABELS.extraction_review,
    );
  });

  it("renders a future step aria-disabled with its gate named as text", () => {
    const { container } = renderAt(1);
    const future = container.querySelector("[data-step-state='future']");
    expect(future).not.toBeNull();
    const control = future?.querySelector("[data-step-link]");
    expect(control).toHaveAttribute("aria-disabled", "true");
    expect(control).not.toHaveAttribute("disabled");
    expect(future?.querySelector("a")).toBeNull();
    expect(future?.querySelector("[data-gated-reason]")?.textContent).toBe(
      GATE_REASON,
    );
  });

  it("keeps a step the session already reached linkable when the reader goes back", () => {
    // T-53: revisiting an earlier step discards nothing, and the step the
    // session reached stays open.
    const { container } = renderAt(0, 2);
    expect(
      container.querySelectorAll("[data-step-state='future']"),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll("[data-step-state='completed'] a"),
    ).toHaveLength(2);
  });

  it("gates the slide on the reader's motion preference", () => {
    const { container } = renderAt(0);
    const bar = container.querySelector("[role='progressbar']");
    expect(bar?.className).toContain("motion-safe:");
    expect(bar?.className).toContain("motion-reduce:");
  });
});

describe("StepperNav — Rule 1.25", () => {
  it("expresses no probability or likelihood anywhere", () => {
    const { container } = renderAt(2);
    expect(container.textContent ?? "").not.toMatch(
      /probabilit|likelihood|risk of|detected chemistry/i,
    );
  });
});
