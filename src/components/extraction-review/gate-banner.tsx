"use client";

import type { ReactElement } from "react";
import { Clock } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import {
  REVIEW_REASON_CODE_LABELS,
  REVIEW_REASON_CODES,
} from "@/domain/taxonomy/review-reason-code";
import { cn } from "@/lib/utils";
import {
  needsReviewTitle,
  NEEDS_REVIEW_TITLE_NO_FIELDS,
  RESOLVE_NOW,
  SAVE_TO_QUEUE,
  SAVING_TO_QUEUE,
} from "./review-copy";
import {
  InlineActionError,
  ReviewButton,
  useActionCall,
} from "./review-controls";
import type { ExtractionReviewActions, ExtractionReviewGate } from "./types";

/**
 * `GateBanner` — `UX_SPEC.md` §2.1.4(5); Rule 2.14; D-20.
 *
 * **When any single field is below threshold, the whole record is in
 * review.** The banner says so once, above the rows, in `pending` intent and
 * `role="status"` — a standing condition announced politely, not an alarm.
 * Motion is never a status: low-confidence rows look like every other row and
 * this banner carries the message.
 *
 * The reasons are T-52 values as the session stores them. A code this build
 * does not recognise renders as stored, in mono, and is never dropped — the
 * fixtures hold three such codes today (`TAXONOMY.md` §5.8).
 */

export interface GateBannerProps {
  readonly gate: ExtractionReviewGate;
  readonly actions: Pick<ExtractionReviewActions, "saveToQueue">;
  /** Scrolls to the first flagged row. The card owns the rows, so it supplies the scroll. */
  readonly onResolveNow: () => void;
}

export function GateBanner({
  gate,
  actions,
  onResolveNow,
}: GateBannerProps): ReactElement | null {
  const save = useActionCall();

  if (!gate.isReviewRequired) return null;

  const reasons = gate.reasonCodes.map((code) =>
    readTaxonomyValue(REVIEW_REASON_CODES, REVIEW_REASON_CODE_LABELS, code),
  );

  return (
    <Alert
      role="status"
      data-gate-banner="true"
      data-intent="pending"
      className={cn("gap-2", INTENT_SURFACE_CLASSES.pending)}
    >
      <Clock aria-hidden="true" />
      <AlertTitle className="text-body-strong text-balance">
        {gate.fieldsBelowThreshold > 0
          ? needsReviewTitle(gate.fieldsBelowThreshold)
          : NEEDS_REVIEW_TITLE_NO_FIELDS}
      </AlertTitle>
      <AlertDescription className="grid gap-3 text-body text-current">
        {reasons.length === 0 ? null : (
          <ul data-gate-reasons="true" className="flex flex-wrap gap-2">
            {reasons.map((reason) => (
              <li
                key={reason.storedValue}
                data-gate-reason={reason.storedValue}
                className={cn(
                  "text-caption",
                  reason.recognised ? undefined : "text-mono",
                )}
              >
                {reason.recognised ? reason.label : reason.storedValue}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <ReviewButton
            variant="outline"
            data-resolve-now="true"
            onPress={onResolveNow}
          >
            {RESOLVE_NOW}
          </ReviewButton>
          <ReviewButton
            variant="ghost"
            data-save-to-queue="true"
            pending={save.pending}
            pendingLabel={SAVING_TO_QUEUE}
            onPress={() => void save.run(() => actions.saveToQueue())}
          >
            {SAVE_TO_QUEUE}
          </ReviewButton>
        </div>
        {save.error === null ? null : (
          <InlineActionError
            dataAttribute="data-banner-error"
            message={save.error}
          />
        )}
      </AlertDescription>
    </Alert>
  );
}
