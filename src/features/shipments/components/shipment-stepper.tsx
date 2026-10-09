"use client";

import type { ReactElement } from "react";

import { StepperNav, type StepperNavStep } from "@/components/flow/stepper-nav";

/**
 * `/shipments/new`'s `StepperNav` — `UX_SPEC.md` §2.12.
 *
 * The route decides every link and every gate on the server and hands them
 * here as data; this island only turns them into the functions `StepperNav`
 * takes. It decides nothing about where the shipment is.
 */
export function ShipmentStepper({
  steps,
  currentIndex,
  completedThrough,
  hrefs,
  disabledReasons,
  label,
}: {
  readonly steps: readonly StepperNavStep[];
  readonly currentIndex: number;
  readonly completedThrough: number;
  /** One per step. */
  readonly hrefs: readonly string[];
  /** One per step — null where the step is open. */
  readonly disabledReasons: readonly (string | null)[];
  readonly label: string;
}): ReactElement {
  return (
    <StepperNav
      steps={steps}
      currentIndex={currentIndex}
      completedThrough={completedThrough}
      hrefFor={(index) => hrefs[index] ?? hrefs[0] ?? ""}
      disabledReason={(index) => disabledReasons[index] ?? null}
      label={label}
    />
  );
}
