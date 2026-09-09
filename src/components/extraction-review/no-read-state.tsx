"use client";

import type { ReactElement } from "react";
import { ScanLine } from "lucide-react";

import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import { cn } from "@/lib/utils";
import {
  NO_READ_BODY,
  NO_READ_ENTER,
  NO_READ_RETAKE,
  NO_READ_SEARCH,
  NO_READ_TIPS,
  NO_READ_TITLE,
} from "./review-copy";
import {
  InlineActionError,
  ReviewButton,
  useActionCall,
} from "./review-controls";
import type { ExtractionReviewActions, ReviewImage } from "./types";

/**
 * E-4 — the label cannot be read at all (`UX_SPEC.md` §5, E-4).
 *
 * **Distinct from low confidence and never sharing its treatment.** Zero
 * fields is not "eleven low fields": there is nothing to confirm, so no rows
 * render, no gate banner asks anyone to resolve anything, and the three
 * actions — re-take, enter by hand, search the catalog — are the whole of the
 * offer, equally weighted. The photo renders at full width with three concrete
 * tips, because the most likely fix is a better photograph.
 *
 * The `intake_photo` and the failed `label_extraction` are both **retained**;
 * an unreadable label is itself a useful training example (Rules 2.29, 7.11;
 * D-7). Entering by hand does not bypass the gate.
 */
export function NoReadState({
  photo,
  actions,
}: {
  readonly photo: ReviewImage | null;
  readonly actions: Pick<
    ExtractionReviewActions,
    "retakePhoto" | "enterManually" | "searchCatalog"
  >;
}): ReactElement {
  const retake = useActionCall();
  const enter = useActionCall();
  const search = useActionCall();
  const error = retake.error ?? enter.error ?? search.error;

  return (
    <div data-no-read-state="true" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <ScanLine
          aria-hidden="true"
          className={cn("mt-1 size-4 shrink-0", INTENT_TEXT_CLASSES.attention)}
        />
        <div className="flex flex-col gap-2">
          <p className="max-w-[72ch] text-body-strong text-balance">
            {NO_READ_TITLE}
          </p>
          <p className="max-w-[72ch] text-body">{NO_READ_BODY}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <ReviewButton
          data-no-read-action="retake"
          pending={retake.pending}
          pendingLabel="Opening the camera…"
          onPress={() => void retake.run(() => actions.retakePhoto())}
        >
          {NO_READ_RETAKE}
        </ReviewButton>
        <ReviewButton
          variant="outline"
          data-no-read-action="enter"
          pending={enter.pending}
          pendingLabel="Switching to manual entry…"
          onPress={() => void enter.run(() => actions.enterManually())}
        >
          {NO_READ_ENTER}
        </ReviewButton>
        <ReviewButton
          variant="outline"
          data-no-read-action="search"
          pending={search.pending}
          pendingLabel="Opening the catalog…"
          onPress={() => void search.run(() => actions.searchCatalog())}
        >
          {NO_READ_SEARCH}
        </ReviewButton>
      </div>

      {error === null ? null : (
        <InlineActionError dataAttribute="data-no-read-error" message={error} />
      )}

      {photo === null || photo.src === null ? null : (
        // eslint-disable-next-line @next/next/no-img-element -- a local capture preview or a stored object, never an optimised remote asset.
        <img
          src={photo.src}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          data-no-read-photo="true"
          className="h-auto w-full rounded-md border"
        />
      )}

      <ul
        data-no-read-tips="true"
        className="flex list-disc flex-col gap-1 pl-6 text-body"
      >
        {NO_READ_TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </div>
  );
}
