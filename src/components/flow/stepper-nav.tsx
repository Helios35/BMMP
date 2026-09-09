"use client";

import Link from "next/link";
import type { ReactElement } from "react";
import { Check } from "lucide-react";

import { GatedControl } from "@/components/access/gated-control";
import { Progress } from "@/components/ui/progress";
import type { IntakeStep } from "@/domain/taxonomy/intake-step";
import { cn } from "@/lib/utils";

/**
 * `StepperNav` — `UX_SPEC.md` §2.12. Used on `/batteries/new` and, when unit
 * 05 builds it, `/shipments/new`.
 *
 * **It decides nothing about where the session is.** The route resolves the
 * position from `intake_session.current_step` through `resolveIntakeStep`
 * (T-53, Rule 2.2) and hands this component three integers and a link
 * function. A step ahead of the session is rendered disabled with the gate
 * named — never hidden and never a dead link — because the URL cannot move
 * the pipeline and a reader should be able to see why (§2.12 Disabled,
 * Rule 1.26).
 *
 * Labels arrive from the caller, who reads them from `INTAKE_STEP_LABELS`;
 * nothing here names a step.
 *
 * Two renderings, exactly one of which is in the accessibility tree at a
 * time: the numbered list from `md`, the compact "Step 2 of 3" bar with a
 * segmented `Progress` below it. `display: none` is what makes that true, as
 * it is for the two primary navigations.
 *
 * Motion: the progress fill slides over 240ms (§6.5) and only under
 * `motion-safe:`, so a reader who has asked for reduced motion gets none.
 */

export interface StepperNavStep {
  readonly id: IntakeStep;
  /** From `INTAKE_STEP_LABELS` — never inline. */
  readonly label: string;
}

export interface StepperNavProps {
  readonly steps: readonly StepperNavStep[];
  /** Zero-based index of the step the reader is on. */
  readonly currentIndex: number;
  /**
   * Zero-based index of the furthest step the session has reached. A step at
   * or before it is reachable by link even when the reader has gone back to
   * an earlier one (T-53: revisiting discards nothing).
   */
  readonly completedThrough: number;
  readonly hrefFor: (index: number) => string;
  /**
   * Why a step ahead of the session cannot be opened, for the tooltip and the
   * caption. `null` or absent falls back to a generic sentence — but the
   * route should always know the gate, so pass it.
   */
  readonly disabledReason?: (index: number) => string | null;
  /** The accessible name of the landmark — *"Intake steps"*. */
  readonly label?: string;
  readonly className?: string;
}

export type StepperStepState = "completed" | "current" | "future";

const FALLBACK_DISABLED_REASON =
  "This step opens when the current step is complete.";

function stateFor(
  index: number,
  currentIndex: number,
  completedThrough: number,
): StepperStepState {
  if (index === currentIndex) return "current";
  if (index < currentIndex || index <= completedThrough) return "completed";
  return "future";
}

export function StepperNav({
  steps,
  currentIndex,
  completedThrough,
  hrefFor,
  disabledReason,
  label = "Steps",
  className,
}: StepperNavProps): ReactElement {
  const total = steps.length;
  const current = steps[currentIndex];
  const percent =
    total === 0 ? 0 : Math.round(((currentIndex + 1) / total) * 100);
  const summary =
    current === undefined
      ? `Step ${currentIndex + 1} of ${total}`
      : `Step ${currentIndex + 1} of ${total} · ${current.label}`;

  return (
    <nav
      aria-label={label}
      data-stepper="true"
      data-stepper-current={currentIndex}
      className={cn("flex flex-col gap-2", className)}
    >
      {/* Desktop: numbered steps with titles (§2.12). */}
      <ol className="hidden items-center gap-4 md:flex">
        {steps.map((step, index) => {
          const state = stateFor(index, currentIndex, completedThrough);
          return (
            <li
              key={step.id}
              data-step-state={state}
              data-step-id={step.id}
              className="flex items-center gap-4"
            >
              <StepItem
                index={index}
                step={step}
                state={state}
                href={hrefFor(index)}
                reason={disabledReason?.(index) ?? FALLBACK_DISABLED_REASON}
              />
              {index < total - 1 ? (
                <span
                  aria-hidden="true"
                  className="h-px w-8 bg-border"
                  data-step-connector="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Mobile: the compact bar. Titles do not fit and are not forced in. */}
      <div
        className="flex flex-col gap-2 md:hidden"
        data-stepper-compact="true"
      >
        <p className="text-label" aria-current="step">
          {summary}
        </p>
        <Progress
          value={percent}
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={summary}
          className={cn(
            "h-2 rounded-md bg-muted",
            // The 240ms slide (§6.5), gated on the reader's motion preference.
            // The generated indicator carries `transition-all`; the duration is
            // reached from outside because the primitive is never hand-edited
            // (§1.1).
            "motion-safe:[&_[data-slot=progress-indicator]]:duration-240",
            "motion-reduce:[&_[data-slot=progress-indicator]]:transition-none",
          )}
        />
      </div>
    </nav>
  );
}

function StepItem({
  index,
  step,
  state,
  href,
  reason,
}: {
  readonly index: number;
  readonly step: StepperNavStep;
  readonly state: StepperStepState;
  readonly href: string;
  readonly reason: string;
}): ReactElement {
  const number = index + 1;
  const marker = (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border text-label",
        state === "current" &&
          "border-primary bg-primary text-primary-foreground",
        state === "completed" && "border-primary text-primary",
        state === "future" && "border-border text-muted-foreground",
      )}
    >
      {state === "completed" ? <Check className="size-4" /> : number}
    </span>
  );

  const baseClass =
    "flex min-h-11 items-center gap-2 rounded-md px-2 text-label focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

  if (state === "current") {
    return (
      <span
        aria-current="step"
        data-step-link={step.id}
        className={cn(baseClass, "text-foreground")}
      >
        {marker}
        <span>{step.label}</span>
      </span>
    );
  }

  if (state === "completed") {
    return (
      <Link
        href={href}
        data-step-link={step.id}
        className={cn(baseClass, "text-foreground hover:bg-muted")}
      >
        {marker}
        <span>{step.label}</span>
        <span className="sr-only"> — completed</span>
      </Link>
    );
  }

  // Future: visible, focusable, explained. Never the `disabled` attribute and
  // never a link to a step the pipeline has not reached (§2.12, Rule 2.2).
  return (
    <GatedControl reason={reason}>
      <span
        role="link"
        aria-disabled="true"
        tabIndex={-1}
        data-step-link={step.id}
        className={cn(baseClass, "text-muted-foreground")}
      >
        {marker}
        <span>{step.label}</span>
      </span>
    </GatedControl>
  );
}
