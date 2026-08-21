"use client";

import type { MouseEvent, ReactElement } from "react";

import { GatedControl } from "@/components";
import { Button } from "@/components/ui/button";

/**
 * **Edit this entry**, rendered disabled with its reason — E-8a, `UX_SPEC.md`
 * §2.9, Rule 1.26.
 *
 * A client component for one reason: the control needs an inert handler.
 * **`aria-disabled` plus a handler that does nothing, never the `disabled`
 * attribute** — a `disabled` button leaves the tab order and fires no pointer
 * events, so its tooltip never opens and the stated reason becomes unreachable,
 * which defeats the entire point of leaving the control visible for an auditor
 * to assess (spec 01 §G5).
 *
 * **The refusal is not this button.** The guard refuses the target route and the
 * policy matrix refuses underneath it; this is a courtesy that explains itself
 * (`SITE_ARCHITECTURE.md` §5.3(6), §5.3(9)).
 */

export interface DisabledEditEntryButtonProps {
  /** `AUDITOR_READ_ONLY_REASON`, supplied by the route from `@/domain/access`. */
  readonly reason: string;
  readonly label: string;
}

export function DisabledEditEntryButton({
  reason,
  label,
}: DisabledEditEntryButtonProps): ReactElement {
  return (
    <GatedControl reason={reason}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        aria-disabled="true"
        // The one control on this route that would change a record, so it
        // carries the marker the E-8a sweep asserts on.
        data-mutating="true"
        className="min-h-11 rounded-md opacity-60"
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.preventDefault();
        }}
      >
        {label}
      </Button>
    </GatedControl>
  );
}
