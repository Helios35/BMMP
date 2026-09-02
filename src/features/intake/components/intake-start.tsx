"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { CircleAlert, Crop } from "lucide-react";

import { GatedControl } from "@/components/access/gated-control";
import {
  ENTER_MANUALLY,
  InlineActionError,
  READ_FAILED_BODY,
  READ_FAILED_TITLE,
  TRY_AGAIN,
} from "@/components/extraction-review";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { IntakeFlowStep } from "@/domain/intake/steps";
import type { IntakeSessionStatus } from "@/domain/taxonomy/intake-session-status";
import {
  enterDetailsManually,
  runLabelExtraction,
  setLabelCropRegion,
  startIntakeSession,
  type LabelExtractionData,
} from "@/features/intake/actions";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import { intakeStepHref } from "./intake-hrefs";
import {
  PhotoCaptureStep,
  xhrUploadTransport,
  type ExistingIntakePhoto,
  type ImageSize,
  type UploadedPhoto,
  type UploadTransport,
} from "./photo-capture-step";
import { ResumeNotice, type ResumeNoticeSession } from "./resume-notice";
import { StepFrame, type StepFrameProps } from "./step-frame";

/**
 * `IntakeStart` — step 1 of `/batteries/new`, with or without a session
 * (`UX_SPEC.md` §2.2, §3.6, §3.9; Flow A-a; `TECHNICAL_SPEC.md` §7.3).
 *
 * The resume notice for the person's unfinished intakes, then
 * `PhotoCaptureStep`, which starts the session on the first capture and
 * renders its own action bar — its primary depends on upload state this
 * component cannot see, so the frame renders none of its own here.
 *
 * ## Read label
 *
 * The primary runs `runLabelExtraction` with the stored label photo's id
 * **and its file name** — the read is keyed on the name, which is why the
 * capture step reports both — and moves to step 2 once the pipeline has
 * handed the session to a person. Three other answers are rendered here:
 *
 * - **`needs_manual_crop`** — the provider could not find the label. An
 *   `attention` alert offers the whole photo as the label region, which
 *   resumes the pipeline through `setLabelCropRegion` with the full geometry
 *   as a manual crop (T-51 `manual`). A drag-to-crop box is not built in this
 *   unit; the whole-photo region is the honest default and is recorded as
 *   such.
 * - **a failed read** — the session is left `failed` and recoverable with its
 *   photos (EC-14). The `critical` alert says so and offers **Try again** on
 *   the same photo beside **Enter details manually**. It renders again after
 *   a reload, from the session's status, so a failure survives a locked
 *   phone.
 * - **nothing to read** — the primary is gated by the capture step until a
 *   label photo has been sent (E-3(5)).
 *
 * ## Enter details manually
 *
 * The step's secondary, and the failure alert's second action: the way on
 * when the read cannot happen (E-3(5), EC-14, D-20). It starts the session
 * if no capture has, asks the server to open step 2 by hand
 * (`enterDetailsManually` — the draft is seeded unread and marked as the
 * manual path), and moves there. Manual entry does not bypass the gate
 * (E-4): every row is *Not read* until a person types and confirms it.
 *
 * The photo's own size, for the whole-photo region, comes from the upload
 * reply: the transport is wrapped so every stored photo's facts are kept
 * beside its id, and a resumed session's label photo arrives with its size
 * from the server.
 */

export interface StartLabelPhoto {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** `null` on a resumed session — the name was not retained. */
  readonly fileName: string | null;
}

export interface IntakeStartProps {
  readonly frame: Pick<StepFrameProps, "title" | "breadcrumbs" | "notice">;
  /** `null` before the first capture. */
  readonly sessionId: string | null;
  readonly sessionStatus: IntakeSessionStatus | null;
  /**
   * The furthest step the session has reached, when the person has come
   * back to capture from a later step (T-53: revisiting discards nothing).
   */
  readonly reachedStep?: IntakeFlowStep;
  /** `?container=` — resolved server-side to the code the person reads. */
  readonly containerContext: {
    readonly id: string;
    readonly code: string;
  } | null;
  /** Stored on a resumed session. */
  readonly existingPhotos: readonly ExistingIntakePhoto[];
  /** The stored label photo of a resumed session, for **Read label**. */
  readonly labelPhoto: StartLabelPhoto | null;
  /** The person's other unfinished intakes (Flow A-a). */
  readonly resumeSessions: readonly ResumeNoticeSession[];
  /** `/api/intake/photos`. */
  readonly uploadUrl: string;
  /** Tests inject these; the defaults are the browser's. */
  readonly transport?: UploadTransport;
  readonly readImageSize?: (url: string) => Promise<ImageSize | null>;
}

const READ_LABEL = "Read label";

const CROP_NEEDED_TITLE =
  "We couldn't find the label automatically. Choose the label region.";
const CROP_NEEDED_BODY =
  "The whole photo can stand as the label region. The read then runs on all of it.";
const USE_WHOLE_PHOTO = "Use the whole photo as the label";
const USING_WHOLE_PHOTO = "Reading the whole photo…";
const PHOTO_SIZE_UNKNOWN =
  "The photo's size has not been read yet. Send the photo again to continue.";
const MANUAL_ENTRY_PENDING = "Opening manual entry…";

export function IntakeStart({
  frame,
  sessionId,
  sessionStatus,
  reachedStep = "capture",
  containerContext,
  existingPhotos,
  labelPhoto,
  resumeSessions,
  uploadUrl,
  transport = xhrUploadTransport,
  readImageSize,
}: IntakeStartProps): ReactElement {
  const router = useRouter();

  // The session this step is working in: the URL's, else the one the first
  // capture started. Kept in state so a second capture reuses it.
  const [startedId, setStartedId] = useState<string | null>(null);
  const activeSessionId = sessionId ?? startedId;

  // The label photo the read runs on: the resumed session's, replaced by the
  // latest label photo the capture step reports.
  const [label, setLabel] = useState<StartLabelPhoto | null>(labelPhoto);
  const uploads = useRef(new Map<string, UploadedPhoto>());

  const [cropNeeded, setCropNeeded] = useState<string | null>(null);
  const [cropPending, setCropPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  /** Every stored photo's reply, kept beside its id for the crop geometry. */
  const recordingTransport: UploadTransport = async (request, onProgress) => {
    const result = await transport(request, onProgress);
    if (result.ok)
      uploads.current.set(result.photo.intakePhotoId, result.photo);
    return result;
  };

  async function startSession(): Promise<
    ActionResult<{ sessionId: string; batteryRecordId: string }>
  > {
    const result = await startIntakeSession({
      containerId: containerContext?.id ?? null,
    });
    if (result.ok) setStartedId(result.data.sessionId);
    return result;
  }

  function onLabelPhotoReady(photoId: string, fileName: string | null): void {
    const stored = uploads.current.get(photoId);
    setLabel({
      id: photoId,
      width: stored?.width ?? 0,
      height: stored?.height ?? 0,
      fileName,
    });
    setCropNeeded(null);
    setFailure(null);
  }

  /** Where each pipeline answer sends the person. */
  function settle(
    session: string,
    result: ActionResult<LabelExtractionData>,
  ): void {
    if (!result.ok) {
      setFailure(result.error.message);
      router.refresh();
      return;
    }
    if (result.data.kind === "needs_manual_crop") {
      setCropNeeded(result.data.labelPhotoId);
      return;
    }
    router.push(intakeStepHref(session, "extraction_review"));
  }

  async function readLabel(): Promise<void> {
    if (activeSessionId === null || label === null) return;
    setFailure(null);
    settle(
      activeSessionId,
      await runLabelExtraction({
        sessionId: activeSessionId,
        labelPhotoId: label.id,
        labelFileName: label.fileName,
      }),
    );
  }

  async function readWholePhoto(): Promise<void> {
    if (
      activeSessionId === null ||
      label === null ||
      cropNeeded === null ||
      cropPending ||
      label.width === 0 ||
      label.height === 0
    ) {
      return;
    }
    setCropPending(true);
    try {
      settle(
        activeSessionId,
        await setLabelCropRegion({
          sessionId: activeSessionId,
          labelPhotoId: cropNeeded,
          labelFileName: label.fileName,
          geometry: {
            x: 0,
            y: 0,
            width: label.width,
            height: label.height,
            sourceWidth: label.width,
            sourceHeight: label.height,
          },
        }),
      );
    } finally {
      setCropPending(false);
    }
  }

  /**
   * The way on without a read (E-3(5), EC-14, D-20): the session is started
   * if the first capture has not started one, the server opens step 2 by
   * hand, and the person is taken there. Nothing is marked done here; step
   * 2 re-reads the draft the server wrote.
   */
  async function enterManually(): Promise<void> {
    setManualError(null);
    let session = activeSessionId;
    if (session === null) {
      const started = await startSession();
      if (!started.ok) {
        setManualError(started.error.message);
        return;
      }
      session = started.data.sessionId;
    }
    const result = await enterDetailsManually({ sessionId: session });
    if (!result.ok) {
      setManualError(result.error.message);
      router.refresh();
      return;
    }
    router.push(intakeStepHref(session, "extraction_review"));
  }

  const sizeKnown = label !== null && label.width > 0 && label.height > 0;
  const showFailure = failure !== null || sessionStatus === "failed";

  return (
    <StepFrame
      {...frame}
      sessionId={activeSessionId}
      currentStep="capture"
      reachedStep={reachedStep}
    >
      <ResumeNotice sessions={resumeSessions} />

      {showFailure ? (
        <Alert
          role="alert"
          data-read-label-error="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">
            {failure ?? READ_FAILED_TITLE}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 text-current">
            <p className="max-w-[72ch] text-body">{READ_FAILED_BODY}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {label === null ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  data-read-label-retry="true"
                  onClick={() => void readLabel()}
                  className={ACTION_BUTTON_CLASS}
                >
                  {TRY_AGAIN}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="lg"
                data-read-label-manual="true"
                onClick={() => void enterManually()}
                className={ACTION_BUTTON_CLASS}
              >
                {ENTER_MANUALLY}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {manualError === null ? null : (
        <InlineActionError
          dataAttribute="data-enter-manually-error"
          message={manualError}
        />
      )}

      {cropNeeded !== null ? (
        <Alert
          role="alert"
          data-crop-needed={cropNeeded}
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.attention)}
        >
          <Crop aria-hidden="true" />
          <AlertTitle className="text-body-strong">
            {CROP_NEEDED_TITLE}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 text-current">
            <p className="max-w-[72ch] text-body">{CROP_NEEDED_BODY}</p>
            <WholePhotoControl
              sizeKnown={sizeKnown}
              pending={cropPending}
              onPress={() => void readWholePhoto()}
            />
          </AlertDescription>
        </Alert>
      ) : null}

      <PhotoCaptureStep
        sessionId={activeSessionId}
        containerContext={containerContext}
        startSession={startSession}
        uploadUrl={uploadUrl}
        onLabelPhotoReady={onLabelPhotoReady}
        existingPhotos={existingPhotos}
        primary={{ label: READ_LABEL, onContinue: readLabel }}
        secondary={{
          label: ENTER_MANUALLY,
          pendingLabel: MANUAL_ENTRY_PENDING,
          onClick: enterManually,
        }}
        transport={recordingTransport}
        {...(readImageSize === undefined ? {} : { readImageSize })}
      />
    </StepFrame>
  );
}

function WholePhotoControl({
  sizeKnown,
  pending,
  onPress,
}: {
  readonly sizeKnown: boolean;
  readonly pending: boolean;
  readonly onPress: () => void;
}): ReactNode {
  if (!sizeKnown) {
    return (
      <GatedControl reason={PHOTO_SIZE_UNKNOWN}>
        <Button
          type="button"
          variant="default"
          size="lg"
          aria-disabled="true"
          data-use-whole-photo="true"
          data-disabled="true"
          onClick={(event) => event.preventDefault()}
          className={cn(ACTION_BUTTON_CLASS, "opacity-60")}
        >
          {USE_WHOLE_PHOTO}
        </Button>
      </GatedControl>
    );
  }
  return (
    <Button
      type="button"
      variant="default"
      size="lg"
      aria-busy={pending ? "true" : undefined}
      aria-disabled={pending ? "true" : undefined}
      data-use-whole-photo="true"
      data-action-state={pending ? "pending" : "idle"}
      onClick={onPress}
      className={ACTION_BUTTON_CLASS}
    >
      {pending ? USING_WHOLE_PHOTO : USE_WHOLE_PHOTO}
    </Button>
  );
}
