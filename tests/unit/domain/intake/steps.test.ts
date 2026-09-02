import { describe, expect, it } from "vitest";

import {
  canOpenStep,
  INTAKE_FLOW_STEPS,
  nextStep,
  prevStep,
  resolveIntakeStep,
  stepFromIndex,
  stepIndex,
  type IntakeStepPosition,
} from "@/domain/intake/steps";
import { INTAKE_STEPS } from "@/domain/taxonomy/intake-step";

/**
 * Step arithmetic — T-53, Rules 2.2, 2.3; `SITE_ARCHITECTURE.md` §1.3.
 *
 * The fixtures store `completed`, `human_confirmation` and `photo_capture` for
 * `current_step`; `resolveIntakeStep` is where those become T-53 values, and
 * those three mappings are pinned here.
 */

function session(patch: Partial<IntakeStepPosition> = {}): IntakeStepPosition {
  return {
    currentStep: "capture",
    status: "open",
    isReviewRequired: false,
    ...patch,
  };
}

describe("INTAKE_FLOW_STEPS", () => {
  it("T-53 — is the taxonomy's order with the terminal step removed", () => {
    expect(INTAKE_FLOW_STEPS).toEqual(INTAKE_STEPS.slice(0, -1));
  });
});

describe("stepIndex and stepFromIndex", () => {
  it("T-53 — are one-based and inverse of each other", () => {
    for (const step of INTAKE_STEPS) {
      expect(stepFromIndex(stepIndex(step))).toBe(step);
    }
    expect(stepIndex("capture")).toBe(1);
    expect(stepIndex("complete")).toBe(4);
  });

  it("Rule 2.2 — an index off the list names no step", () => {
    expect(stepFromIndex(0)).toBeNull();
    expect(stepFromIndex(5)).toBeNull();
    expect(stepFromIndex(1.5)).toBeNull();
    expect(stepFromIndex(Number.NaN)).toBeNull();
  });
});

describe("resolveIntakeStep", () => {
  it("T-53 — returns an authored step as stored", () => {
    for (const step of INTAKE_STEPS) {
      expect(resolveIntakeStep(session({ currentStep: step }))).toBe(step);
    }
  });

  it("D-38 — maps the fixture's human_confirmation, awaiting confirmation, to extraction_review", () => {
    expect(
      resolveIntakeStep(
        session({
          currentStep: "human_confirmation",
          status: "awaiting_confirmation",
          isReviewRequired: true,
        }),
      ),
    ).toBe("extraction_review");
  });

  it("D-38 — maps the fixture's completed to complete", () => {
    expect(
      resolveIntakeStep(
        session({ currentStep: "completed", status: "completed" }),
      ),
    ).toBe("complete");
  });

  it("D-38 — maps the fixture's photo_capture, still open, to capture", () => {
    expect(
      resolveIntakeStep(
        session({ currentStep: "photo_capture", status: "open" }),
      ),
    ).toBe("capture");
  });

  it("EC-14 — a failed or extracting session with an unrecognised step is back at capture", () => {
    expect(
      resolveIntakeStep(
        session({ currentStep: "something", status: "failed" }),
      ),
    ).toBe("capture");
    expect(
      resolveIntakeStep(session({ currentStep: "", status: "extracting" })),
    ).toBe("capture");
  });

  it("Rule 2.14 — a session the gate marked for review is at review even when its step never caught up", () => {
    expect(
      resolveIntakeStep(
        session({
          currentStep: "stale",
          status: "open",
          isReviewRequired: true,
        }),
      ),
    ).toBe("extraction_review");
  });
});

describe("canOpenStep", () => {
  it("Rule 2.2 — never ahead of where the session is", () => {
    const atReview = session({ currentStep: "extraction_review" });
    expect(canOpenStep(atReview, "confirm_and_place")).toBe(false);
    expect(canOpenStep(atReview, "complete")).toBe(false);
  });

  it("T-53 — revisiting an earlier step is fine", () => {
    const atPlace = session({ currentStep: "confirm_and_place" });
    expect(canOpenStep(atPlace, "capture")).toBe(true);
    expect(canOpenStep(atPlace, "extraction_review")).toBe(true);
    expect(canOpenStep(atPlace, "confirm_and_place")).toBe(true);
  });

  it("T-53 — resolves a fixture-era step before comparing", () => {
    const fixture = session({
      currentStep: "human_confirmation",
      status: "awaiting_confirmation",
    });
    expect(canOpenStep(fixture, "extraction_review")).toBe(true);
    expect(canOpenStep(fixture, "confirm_and_place")).toBe(false);
  });

  it("Rule 2.23 — a completed session opens only its terminal step", () => {
    const done = session({ currentStep: "complete", status: "completed" });
    expect(canOpenStep(done, "complete")).toBe(true);
    expect(canOpenStep(done, "extraction_review")).toBe(false);
  });

  it("T-08 — an abandoned session opens nothing", () => {
    const gone = session({
      currentStep: "extraction_review",
      status: "abandoned",
    });
    expect(canOpenStep(gone, "capture")).toBe(false);
    expect(canOpenStep(gone, "extraction_review")).toBe(false);
  });
});

describe("nextStep and prevStep", () => {
  it("Rule 2.3 — walk the fixed order and stop at the ends", () => {
    expect(nextStep("capture")).toBe("extraction_review");
    expect(nextStep("extraction_review")).toBe("confirm_and_place");
    expect(nextStep("confirm_and_place")).toBe("complete");
    expect(nextStep("complete")).toBeNull();
    expect(prevStep("complete")).toBe("confirm_and_place");
    expect(prevStep("capture")).toBeNull();
  });
});
