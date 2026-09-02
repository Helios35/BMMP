"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactElement } from "react";
import { ImageOff } from "lucide-react";

import {
  ExtractionReviewCard,
  InlineActionError,
  PRIMARY_PENDING_DEFAULT,
  RejectReadDialog,
  VoidItemDialog,
  type ExtractionReviewCardProps,
  type ReviewCardState,
} from "@/components/extraction-review";
import { useOnlineStatus } from "@/components/offline/use-online-status";
import {
  canContinueFromReview,
  type CommitFieldState,
  type OutstandingItem,
} from "@/domain/intake/commit-gate";
import type { IntakeFlowStep } from "@/domain/intake/steps";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";
import type { Chemistry } from "@/domain/taxonomy/chemistry";

import { bindReviewActions } from "./bind-actions";
import { StepFrame, type StepFrameProps } from "./step-frame";

/**
 * `ExtractionReviewStep` — step 2 of `/batteries/new` (`UX_SPEC.md` §2.1,
 * §2.13, §3.6, E-4, E-5).
 *
 * The route reads the step and composes the card's props on the server;
 * this component adds the two things only the browser knows — whether it is
 * online, and whether the person has asked for the rows after a read that
 * produced none — and the actions, bound to the session through
 * `bindReviewActions`.
 *
 * **The page's action bar is the card's primary.** The card is rendered with
 * `renderActionBar={false}` and the frame's `MobileActionBar` carries
 * **Confirm and continue** with the outstanding checklist beneath it
 * (§2.1.4(6), §2.15), so on a phone the primary is pinned where a thumb is.
 * The checklist is `canContinueFromReview` over the same field states the
 * server refuses with — computed here only so *offline* can join it — and
 * each item scrolls to its row. The two dialogs the card's own bar would
 * have held, the whole-read reject and the void, render beneath the card.
 *
 * Desktop: two columns from `lg`, the photos on the left and sticky, the rows
 * on the right (design §9). The image bytes are not served in B1a, so the
 * left column renders each photo as a labelled placeholder at its own aspect
 * ratio, exactly as the record's Photos tab does.
 */

export interface ReviewPlaceholderImage {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

/** The card's props as the server composes them — everything but the actions and the browser's state. */
export type ReviewCardView = Pick<
  ExtractionReviewCardProps,
  | "sessionId"
  | "readAt"
  | "timeZone"
  | "gate"
  | "fields"
  | "candidates"
  | "selectedCatalogEntryId"
  | "catalogMatchState"
  | "cannotShipNote"
  | "cropThumbnail"
  | "originalPhoto"
  | "ownsCondition"
  | "bulkConfirmAvailable"
  | "loadingSince"
> & {
  readonly state: Exclude<ReviewCardState, "disabled">;
  readonly errorMessage?: string;
};

export interface ExtractionReviewStepProps {
  readonly frame: Pick<StepFrameProps, "title" | "breadcrumbs" | "notice">;
  readonly sessionId: string;
  readonly batteryRecordId: string;
  readonly correlationId: string;
  /** The furthest step reached — step 3 when the person has come back to review. */
  readonly reachedStep?: IntakeFlowStep;
  readonly labelPhotoId: string | null;
  readonly card: ReviewCardView;
  /** `commitFieldStates(draft)` — the gate's input, for the offline item. */
  readonly fieldStates: readonly CommitFieldState[];
  readonly images: {
    readonly crop: ReviewPlaceholderImage | null;
    readonly original: ReviewPlaceholderImage | null;
  };
  readonly proposal: {
    readonly manufacturerName: string;
    readonly modelName: string | null;
    readonly partNumber: string | null;
    readonly chemistry: Chemistry;
    readonly applicationClass: ApplicationClass;
  } | null;
  readonly catalogQuery: string | null;
}

const PRIMARY_LABEL = "Confirm and continue";

/** §2.1.6 Disabled — the whole card, with the reason. */
const OFFLINE_REASON =
  "You're offline. Confirmations can't be saved until you reconnect; values stay readable.";

const IMAGE_UNAVAILABLE = "Image not available on the mock adapter.";

function scrollToRow(item: OutstandingItem): void {
  if (item.fieldCode === undefined) return;
  const row = document.querySelector<HTMLElement>(
    `[data-field-row="${item.fieldCode}"]`,
  );
  row?.scrollIntoView({ block: "center" });
  row
    ?.querySelector<HTMLElement>(
      "button:not([aria-disabled='true']), input, [role='combobox']",
    )
    ?.focus({ preventScroll: true });
}

export function ExtractionReviewStep({
  frame,
  sessionId,
  batteryRecordId,
  correlationId,
  reachedStep = "extraction_review",
  labelPhotoId,
  card,
  fieldStates,
  images,
  proposal,
  catalogQuery,
}: ExtractionReviewStepProps): ReactElement {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [manual, setManual] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const actions = useMemo(
    () =>
      bindReviewActions({
        sessionId,
        batteryRecordId,
        correlationId,
        labelPhotoId,
        // The name is not retained past the capture step; the provider's
        // default read applies to a re-read from here.
        labelFileName: null,
        proposal,
        catalogQuery,
        navigate: (href) => router.push(href),
        refresh: () => router.refresh(),
        enterManually: () => setManual(true),
        // A failed read is the session's state (EC-14): the manual path is
        // then a write the server records, and the step re-reads from it.
        readFailed: card.state === "error",
      }),
    [
      sessionId,
      batteryRecordId,
      correlationId,
      labelPhotoId,
      proposal,
      catalogQuery,
      card.state,
      router,
    ],
  );

  // Offline overrides everything: no confirmation is saved without the
  // server (§6.4). Manual entry shows the rows behind an empty or failed
  // read so a person can type into them; typing is `enterValue`.
  const state: ReviewCardState = !isOnline
    ? "disabled"
    : manual && (card.state === "empty" || card.state === "error")
      ? "default"
      : card.state;

  const outstanding = canContinueFromReview(fieldStates, !isOnline);
  const canContinue = outstanding.length === 0 && state === "default";

  async function onContinue(): Promise<void> {
    setNotice(null);
    const result = await actions.continue();
    if (!result.ok) setNotice(result.error.message);
  }

  return (
    <StepFrame
      {...frame}
      sessionId={sessionId}
      currentStep="extraction_review"
      reachedStep={reachedStep}
      actionBar={{
        primary: {
          label: PRIMARY_LABEL,
          pendingLabel: PRIMARY_PENDING_DEFAULT,
          onClick: onContinue,
          disabled: !canContinue,
        },
        outstanding,
        onOutstandingItem: scrollToRow,
        notice:
          notice === null ? null : (
            <InlineActionError
              dataAttribute="data-continue-error"
              message={notice}
            />
          ),
      }}
    >
      <div
        data-review-layout="true"
        // One part photos to three parts rows. At two the review card's
        // column measured 581px at 1280 and its value column collapsed to
        // 38px; at three it is 653px there and 516px at 1024 (`field-row.tsx`
        // carries the per-track arithmetic). The photos are placeholders at
        // their own aspect ratio and read fine at 172px.
        className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] lg:items-start lg:gap-8"
      >
        <aside
          aria-label="Label photos"
          data-review-photos="true"
          className="flex flex-col gap-4 lg:sticky lg:top-16"
        >
          <PhotoPlaceholder image={images.crop} />
          <PhotoPlaceholder image={images.original} />
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <ExtractionReviewCard
            {...card}
            state={state}
            {...(state === "disabled"
              ? { disabledReason: OFFLINE_REASON }
              : {})}
            outstanding={outstanding}
            primaryLabel={PRIMARY_LABEL}
            primaryPendingLabel={PRIMARY_PENDING_DEFAULT}
            mode="intake"
            renderActionBar={false}
            actions={actions}
          />
          {state === "default" || state === "disabled" ? (
            <div
              data-review-secondary-actions="true"
              className="flex flex-wrap items-center gap-2"
            >
              <RejectReadDialog actions={actions} />
              {actions.voidItem === undefined ? null : (
                <VoidItemDialog onVoid={actions.voidItem} />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </StepFrame>
  );
}

/**
 * A stored photo, at its own aspect ratio, with no bytes behind it.
 *
 * The same placeholder the record's Photos tab renders: when the object
 * store serves a real URL the frame is already the right size and nothing
 * moves (the seam working, not leaking).
 */
function PhotoPlaceholder({
  image,
}: {
  readonly image: ReviewPlaceholderImage | null;
}): ReactElement | null {
  if (image === null) return null;
  return (
    <figure
      data-photo-placeholder="true"
      className="flex flex-col gap-2 rounded-lg border border-border p-4"
    >
      <figcaption className="text-label text-foreground">
        {image.label}
      </figcaption>
      <div
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted p-4"
      >
        <ImageOff aria-hidden="true" className="size-6" />
        <p className="max-w-[36ch] text-center text-caption">
          {IMAGE_UNAVAILABLE}
        </p>
      </div>
    </figure>
  );
}
