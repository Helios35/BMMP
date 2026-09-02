"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
} from "react";
import { CircleAlert } from "lucide-react";

import { GatedControl } from "@/components/access/gated-control";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

/**
 * The three things every control on the extraction review card shares.
 *
 * - **The disabled state is one decision, made once.** §2.1.6's *Disabled*
 *   row is the whole card — offline, or an expired support grant — with one
 *   `Alert` at the top saying why. The reason travels down through a context
 *   so no row has to be told twice and no control can forget.
 * - **An action in flight keeps its label and gains a present participle**
 *   (§6.3). A bare spinner replacing a labelled button is a defect.
 * - **A failure is rendered where it happened** (§10.3): an inline `critical`
 *   alert beside the control, never a page replacement, and the row it belongs
 *   to stays exactly as the server last described it. Nothing here is
 *   optimistic (§6.4).
 */

export interface ReviewDisabledState {
  /** `null` while the card is interactive. */
  readonly reason: string | null;
  /** The id of the single Alert stating the reason, for `aria-describedby`. */
  readonly alertId: string | null;
}

export const ReviewDisabledContext = createContext<ReviewDisabledState>({
  reason: null,
  alertId: null,
});

export function useReviewDisabled(): ReviewDisabledState {
  return useContext(ReviewDisabledContext);
}

/* ---------------------------------------------------------------- action */

export interface ActionCall {
  readonly pending: boolean;
  readonly error: string | null;
  /**
   * Runs the action and resolves to its result. Nothing is marked done here:
   * the caller re-renders from server state when its props change.
   */
  readonly run: (
    action: () => Promise<ActionResult<unknown>>,
  ) => Promise<ActionResult<unknown> | null>;
  readonly clearError: () => void;
}

/**
 * One in-flight action, its error, and nothing else.
 *
 * `run` refuses to start a second call while one is pending — a double tap on
 * a 48px button in a gloved hand is ordinary, and two confirmations of one
 * field is not what the person meant.
 */
export function useActionCall(): ActionCall {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (
      action: () => Promise<ActionResult<unknown>>,
    ): Promise<ActionResult<unknown> | null> => {
      if (pending) return null;
      setPending(true);
      setError(null);
      try {
        const result = await action();
        if (!result.ok) setError(result.error.message);
        return result;
      } finally {
        setPending(false);
      }
    },
    [pending],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { pending, error, run, clearError };
}

/* ---------------------------------------------------------------- button */

export interface ReviewButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "disabled" | "onClick"
> {
  /** The label while the action runs — a present participle. */
  readonly pendingLabel?: string;
  readonly pending?: boolean;
  /**
   * A reason of this control's own for being inert — the commit gate's
   * checklist, say. Rendered through `GatedControl` so the reason is reachable
   * by keyboard and visible on a phone.
   */
  readonly gatedReason?: string | null;
  readonly onPress?: (event: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * A `Button` that is honest about why it will not act.
 *
 * **Never the `disabled` attribute.** A disabled button leaves the tab order
 * and cannot explain itself (Rule 1.26). Three things make it inert instead:
 * `aria-disabled`, a handler that returns before doing anything, and a stated
 * reason — the card's single disabled-state alert (referenced by
 * `aria-describedby`) or this control's own `gatedReason` through
 * `GatedControl`.
 */
export function ReviewButton({
  pendingLabel,
  pending = false,
  gatedReason = null,
  onPress,
  children,
  className,
  type = "button",
  ...rest
}: ReviewButtonProps): ReactElement {
  const disabled = useReviewDisabled();
  const cardInert = disabled.reason !== null;
  const inert = cardInert || gatedReason !== null || pending;

  const button = (
    <Button
      type={type}
      aria-disabled={inert ? "true" : undefined}
      aria-busy={pending ? "true" : undefined}
      aria-describedby={cardInert ? (disabled.alertId ?? undefined) : undefined}
      data-pending={pending ? "true" : undefined}
      className={cn(
        ACTION_BUTTON_CLASS,
        // §2.1.6 Active — scale, never a colour change. Disabled — dimmed.
        "transition-transform duration-100 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        inert && "opacity-60",
        className,
      )}
      onClick={(event) => {
        if (inert) {
          event.preventDefault();
          return;
        }
        onPress?.(event);
      }}
      {...rest}
    >
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </Button>
  );

  if (gatedReason !== null && !cardInert) {
    return <GatedControl reason={gatedReason}>{button}</GatedControl>;
  }
  return button;
}

/* ----------------------------------------------------------------- error */

/**
 * §10.3 — the failure, in place, in plain language. `role="alert"` so it is
 * announced; `critical` so it is seen.
 */
export function InlineActionError({
  message,
  className,
  dataAttribute,
}: {
  readonly message: string;
  readonly className?: string;
  readonly dataAttribute?: string;
}): ReactElement {
  return (
    <Alert
      role="alert"
      data-intent="critical"
      {...(dataAttribute === undefined ? {} : { [dataAttribute]: "true" })}
      className={cn("gap-2", INTENT_SURFACE_CLASSES.critical, className)}
    >
      <CircleAlert aria-hidden="true" />
      <AlertTitle className="text-body-strong text-balance">
        {message}
      </AlertTitle>
    </Alert>
  );
}
