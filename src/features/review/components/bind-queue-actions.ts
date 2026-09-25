"use client";

import type { ExtractionReviewActions } from "@/components/extraction-review";
import {
  enterDetailsManually,
  rejectExtraction,
  runLabelExtraction,
} from "@/features/intake/actions";
import {
  bindReviewActions,
  type ReviewActionBindings,
} from "@/features/intake/components/bind-actions";
import { intakeStepHref } from "@/features/intake/components/intake-hrefs";
import { actionFailed, type ActionResult } from "@/lib/action-result";

import { confirmReviewItem, voidReviewItem } from "../actions";
import { afterResolvingHref, type ResolutionOutcome } from "../review-hrefs";

/**
 * The card's actions on `/review` — `UX_SPEC.md` §2.1.5, §3.8a.
 *
 * **Built from `/batteries/new`'s bindings, not beside them.** Every draft
 * write — confirm a field, reject it, type a value, pick a candidate, enter a
 * chemistry, propose an entry — is the intake route's own binding, unchanged,
 * because a queue item is an intake the gate held and those writes are the
 * same writes. Five members differ here, and each says why:
 *
 * - **`continue` is the commit.** On this route the card's primary is
 *   *Confirm and commit* (§3.8a), through `confirmReviewItem` — the queue's
 *   door onto the intake's one commit. On success the next item opens.
 * - **`voidItem` is the queue's void**, through `voidReviewItem`, and the
 *   next item opens (Rule 2.23).
 * - **`saveToQueue` is not offered** — the item is already on the queue; the
 *   card hides the button in `review` mode and this refuses if reached.
 * - **`rejectRead` returns the item to the queue in a manual-entry state**
 *   (§2.1.5): the read is rejected and retained, the rows open for typing, and
 *   the person stays here. It does not disappear and it does not resolve.
 * - **`retryExtraction` reads again and stays here.** A read that needs a
 *   hand-drawn box goes to the capture step, where the photo is.
 *
 * *Re-take the photo* still goes to `/batteries/new`'s capture step: the
 * camera is there, and the item stays on the queue while it is used.
 */

export interface QueueActionBindings extends Omit<
  ReviewActionBindings,
  "navigate"
> {
  /** The item that opens once this one has left the queue, or `null` when it was the last. */
  readonly nextItemId: string | null;
  readonly navigate: (href: string) => void;
}

const ALREADY_ON_QUEUE = "This item is already on the review queue.";

export function bindQueueActions(
  bindings: QueueActionBindings,
): ExtractionReviewActions {
  const { sessionId, correlationId, nextItemId, navigate, refresh } = bindings;
  const base = bindReviewActions(bindings);

  /** After an item leaves the queue: the next one, and what became of this one. */
  function afterResolving(
    batteryRecordId: string,
    outcome: ResolutionOutcome,
  ): void {
    navigate(afterResolvingHref(nextItemId, batteryRecordId, outcome));
  }

  async function resolve<T extends { readonly batteryRecordId: string }>(
    outcome: ResolutionOutcome,
    call: () => Promise<ActionResult<T>>,
  ): Promise<ActionResult<T>> {
    const result = await call();
    if (result.ok) afterResolving(result.data.batteryRecordId, outcome);
    return result;
  }

  return {
    ...base,

    continue: () => resolve("logged", () => confirmReviewItem({ sessionId })),

    voidItem: (reason: string) =>
      resolve("voided", () => voidReviewItem({ sessionId, reason })),

    saveToQueue: () =>
      Promise.resolve(
        actionFailed({
          code: "CONFLICT",
          message: ALREADY_ON_QUEUE,
          correlationId,
        }),
      ),

    rejectRead: async () => {
      const rejected = await rejectExtraction({ sessionId });
      if (!rejected.ok) return rejected;
      const manual = await enterDetailsManually({ sessionId });
      refresh();
      return manual;
    },

    retryExtraction: async () => {
      if (bindings.labelPhotoId === null) return base.retryExtraction();
      const result = await runLabelExtraction({
        sessionId,
        labelPhotoId: bindings.labelPhotoId,
        labelFileName: bindings.labelFileName,
      });
      if (result.ok) {
        if (result.data.kind === "needs_manual_crop") {
          navigate(intakeStepHref(sessionId, "capture"));
        } else {
          refresh();
        }
      }
      return result;
    },
  };
}
