"use client";

import { useEffect, type ReactElement, type ReactNode } from "react";

import {
  MobileActionBar,
  StepperNav,
  type MobileActionBarProps,
  type StepperNavStep,
} from "@/components/flow";
import { PageHeader, PageShell } from "@/components/page";
import { INTAKE_FLOW_STEPS, type IntakeFlowStep } from "@/domain/intake/steps";
import { INTAKE_STEP_LABELS } from "@/domain/taxonomy/intake-step";

import { intakeStepHrefAt } from "./intake-hrefs";

/**
 * `StepFrame` — the one composition every step of `/batteries/new` renders
 * inside (`UX_SPEC.md` §2.12, §2.15, §3.6; `SITE_ARCHITECTURE.md` §2.4).
 *
 * `PageShell` → `PageHeader` (breadcrumbs, title, the pinned notices) →
 * `StepperNav` → the step's body → `MobileActionBar`. Three steps, one
 * outline, so the stepper sits at the same height on every step and the
 * primary is found in the same place whether the person is photographing a
 * label or logging the battery.
 *
 * ## Why it is a client component
 *
 * The stepper takes an href function and the action bar takes the primary's
 * handler, and neither can cross a server → client boundary as a prop. The
 * route therefore hands the server-rendered pieces — the breadcrumb trail
 * (resolved against the capability map, server-side only) and the notices —
 * in as `ReactNode`s, and each step composition renders this frame around
 * its own client body. The frame decides nothing about where the session is:
 * `currentStep` and `reachedStep` arrive resolved from
 * `intake_session.current_step` (T-53, Rule 2.2).
 *
 * ## The action bar
 *
 * Steps 2 and 3 pass `actionBar`; step 1 passes none, because
 * `PhotoCaptureStep` renders its own — its primary depends on upload state
 * the frame cannot see. Where the frame renders the bar it also owns the
 * keyboard: **Cmd/Ctrl + Enter submits the step** when, and only when, the
 * gate is satisfied — the same `disabled` the button reads, so a shortcut can
 * never do what the button would refuse. The card deliberately leaves this to
 * the route (design §8.1).
 */

export interface StepFrameProps {
  /** `APP_ROUTE_NAMES["/batteries/new"]`. */
  readonly title: string;
  /** Server-rendered `Breadcrumbs` (§2.4 — every multi-step route). */
  readonly breadcrumbs?: ReactNode;
  /** The grace notice and the resume alert, pinned below the title (§2.9). */
  readonly notice?: ReactNode;
  /** `null` before the first capture starts a session. */
  readonly sessionId: string | null;
  readonly currentStep: IntakeFlowStep;
  /** The furthest step the session has reached — links open up to it. */
  readonly reachedStep: IntakeFlowStep;
  readonly children: ReactNode;
  /** Steps 2 and 3. Absent on step 1, where the capture step renders its own. */
  readonly actionBar?: MobileActionBarProps | null;
}

const STEPS: readonly StepperNavStep[] = INTAKE_FLOW_STEPS.map((id) => ({
  id,
  label: INTAKE_STEP_LABELS[id],
}));

function indexOf(step: IntakeFlowStep): number {
  return INTAKE_FLOW_STEPS.indexOf(step);
}

/** Why a step ahead of the session is closed, naming the step that opens it. */
function disabledReasonFor(index: number): string | null {
  const previous = INTAKE_FLOW_STEPS[index - 1];
  if (previous === undefined) return null;
  return `Opens once ${INTAKE_STEP_LABELS[previous]} is complete.`;
}

function isSubmitShortcut(event: KeyboardEvent): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey);
}

export function StepFrame({
  title,
  breadcrumbs,
  notice,
  sessionId,
  currentStep,
  reachedStep,
  children,
  actionBar = null,
}: StepFrameProps): ReactElement {
  const primary = actionBar?.primary ?? null;
  const submit =
    primary !== null && primary.disabled !== true ? primary.onClick : undefined;

  // Cmd/Ctrl+Enter fires the primary exactly as a tap would — through the
  // same handler, under the same gate. Nothing is bound while the primary is
  // disabled, so the shortcut cannot bypass the checklist.
  useEffect(() => {
    if (submit === undefined) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (!isSubmitShortcut(event)) return;
      event.preventDefault();
      void submit?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submit]);

  return (
    <PageShell>
      <PageHeader title={title} breadcrumbs={breadcrumbs} notice={notice} />
      <StepperNav
        label="Intake steps"
        steps={STEPS}
        currentIndex={indexOf(currentStep)}
        completedThrough={indexOf(reachedStep)}
        hrefFor={(index) => intakeStepHrefAt(sessionId, index)}
        disabledReason={disabledReasonFor}
      />
      <div
        data-intake-step={currentStep}
        data-intake-session={sessionId ?? undefined}
        // Below `md` the action bar is pinned to the viewport, so the body
        // keeps clear of it with bottom padding; from `md` the bar is inline.
        className={
          actionBar === null
            ? "flex flex-col gap-6"
            : "flex flex-col gap-6 pb-16 md:pb-0"
        }
      >
        {children}
      </div>
      {actionBar === null ? null : <MobileActionBar {...actionBar} />}
    </PageShell>
  );
}
