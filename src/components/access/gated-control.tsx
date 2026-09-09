"use client";

import { useId, type ReactElement, type ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * `GatedControl` — the wrapper that makes *disabled with a reason* honest
 * (`UX_SPEC.md` §2.9, §2.1.4; Rule 1.26).
 *
 * **The control inside must use `aria-disabled`, never the `disabled`
 * attribute.** A `disabled` button leaves the tab order and fires no pointer
 * events, so its tooltip never opens and the stated reason becomes unreachable —
 * which defeats the whole purpose of leaving the control visible for an auditor
 * to assess. `aria-disabled` plus an inert handler keeps the control focusable,
 * announced as disabled, and able to explain itself.
 *
 * The reason is reachable two ways and exactly one is in the accessibility tree
 * at a time: a `Tooltip` from `md` up, and a visible caption line below it.
 * Hover is never the only way to reveal information (§1.5), and **a silently
 * disabled control is a defect, not a safe default.**
 *
 * From `md` the caption is `sr-only` — absolutely positioned at 1px so it
 * stays in the accessibility tree and out of the layout. **A caller sizes the
 * trigger through `triggerClassName`, never through a child selector on the
 * wrapper**: a `[&>span]:w-*` rule reaches the caption too, outranks
 * `sr-only`'s width, and lays the caption out at its text width — which put
 * 49px of horizontal scroll on a 1280px viewport once.
 *
 * **Server-side rejection is the actual enforcement; the attribute is a
 * courtesy** (`SITE_ARCHITECTURE.md` §5.3(6), §5.3(9)). This component makes no
 * access decision — a route asks `controlTreatment()` in `@/domain/access` and
 * passes the reason it returns.
 */

export interface GatedControlProps {
  /** `AUDITOR_READ_ONLY_REASON`, or the route's own. Never empty. */
  readonly reason: string;
  /** The control, already carrying `aria-disabled` and an inert handler. */
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * Classes for the focusable trigger span around the control — the only
   * element a caller may size, so the reason caption is never caught by a
   * selector meant for the control.
   */
  readonly triggerClassName?: string;
}

export function GatedControl({
  reason,
  children,
  className,
  triggerClassName,
}: GatedControlProps): ReactElement {
  const reasonId = useId();

  return (
    <div
      data-gated-control="true"
      className={cn("flex flex-col items-start gap-1", className)}
    >
      {/* The wrapper is focusable so the tooltip can open from the keyboard even
          when the control inside is inert. */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-describedby={reasonId}
              className={cn(
                "inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                triggerClassName,
              )}
            >
              {children}
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-caption">{reason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <span
        id={reasonId}
        data-gated-reason="true"
        className="text-caption text-muted-foreground md:sr-only"
      >
        {reason}
      </span>
    </div>
  );
}
