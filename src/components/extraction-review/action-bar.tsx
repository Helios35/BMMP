"use client";

import type { ReactElement } from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OutstandingItem } from "@/domain/intake/commit-gate";
import { outstandingSummary, PRIMARY_PENDING_DEFAULT } from "./review-copy";
import {
  InlineActionError,
  ReviewButton,
  useActionCall,
} from "./review-controls";
import { RejectReadDialog } from "./reject-read-dialog";
import { VoidItemDialog } from "./void-item-dialog";
import type { ExtractionReviewActions } from "./types";

/**
 * The action bar — `UX_SPEC.md` §2.1.1, §2.1.4(6), §2.1.5.
 *
 * **A disabled primary always renders its reason as a checklist directly
 * beneath it.** The items come from `outstandingCommitItems` /
 * `canContinueFromReview` in `src/domain/intake/commit-gate.ts` — the same
 * function the server refuses with — and are never composed here. Each item
 * is a button that scrolls to its row. A bare disabled button with no
 * explanation is a defect.
 *
 * Sticky at the bottom of the viewport on a phone (§2.1.1); inline from `md`.
 * A route that hosts the same checklist in `MobileActionBar` passes
 * `renderActionBar={false}` on the card and this never mounts.
 */

export interface ReviewActionBarProps {
  readonly primaryLabel: string;
  readonly primaryPendingLabel?: string;
  readonly outstanding: readonly OutstandingItem[];
  readonly showVoid: boolean;
  readonly actions: Pick<
    ExtractionReviewActions,
    "continue" | "rejectRead" | "voidItem"
  >;
  /** Scrolls to the row an item names. The card owns the rows. */
  readonly onOutstandingItem: (item: OutstandingItem) => void;
}

export function ReviewActionBar({
  primaryLabel,
  primaryPendingLabel = PRIMARY_PENDING_DEFAULT,
  outstanding,
  showVoid,
  actions,
  onOutstandingItem,
}: ReviewActionBarProps): ReactElement {
  const proceed = useActionCall();
  const gated = outstanding.length > 0;

  return (
    <div
      data-review-action-bar="true"
      className={cn(
        // Sticky on a phone, with the safe-area inset; inline from `md`.
        "sticky bottom-0 flex flex-col gap-3 border-t bg-card pt-4 pb-[env(safe-area-inset-bottom)] md:static md:border-t-0 md:pt-0",
      )}
    >
      {proceed.error === null ? null : (
        // §6.2 — a failed commit names what rejected it, above the bar.
        <InlineActionError
          dataAttribute="data-action-bar-error"
          message={proceed.error}
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <RejectReadDialog actions={actions} />
          {showVoid && actions.voidItem !== undefined ? (
            <VoidItemDialog onVoid={actions.voidItem} />
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <ReviewButton
            data-primary-action="true"
            data-gated={gated ? "true" : "false"}
            className="min-h-12 w-full md:min-h-11 md:w-auto"
            pending={proceed.pending}
            pendingLabel={primaryPendingLabel}
            gatedReason={gated ? outstandingSummary(outstanding.length) : null}
            onPress={() => void proceed.run(() => actions.continue())}
          >
            {primaryLabel}
            <ArrowRight aria-hidden="true" />
          </ReviewButton>
        </div>
      </div>

      {gated ? (
        <OutstandingChecklist
          outstanding={outstanding}
          onItem={onOutstandingItem}
        />
      ) : null}
    </div>
  );
}

/**
 * The reason checklist. Rendered from `OutstandingItem`s, never composed.
 *
 * Exported so `MobileActionBar` can host the identical list when the route
 * suppresses the card's own bar.
 */
export function OutstandingChecklist({
  outstanding,
  onItem,
}: {
  readonly outstanding: readonly OutstandingItem[];
  readonly onItem: (item: OutstandingItem) => void;
}): ReactElement {
  return (
    <div data-outstanding-checklist="true" className="flex flex-col gap-2">
      <p className="text-label text-foreground">
        {outstandingSummary(outstanding.length)}
      </p>
      <ul className="flex flex-col gap-1">
        {outstanding.map((item) => (
          <li key={`${item.kind}:${item.fieldCode ?? ""}:${item.label}`}>
            <ReviewButton
              variant="ghost"
              data-outstanding-item={item.kind}
              data-outstanding-field={item.fieldCode}
              className="h-auto w-full justify-start text-left"
              onPress={() => onItem(item)}
            >
              {item.label}
            </ReviewButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
