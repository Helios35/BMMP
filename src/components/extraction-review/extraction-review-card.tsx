"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { CircleAlert, ImageOff, WifiOff } from "lucide-react";

import { CARD_SPACING } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { OutstandingItem } from "@/domain/intake/commit-gate";
import {
  HARD_GATED_LABEL_FIELD_CODES,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";
import { cn } from "@/lib/utils";
import { ReviewActionBar } from "./action-bar";
import { CatalogMatchPanel } from "./catalog-match-panel";
import { FieldRow, FieldRowSkeleton } from "./field-row";
import { GateBanner } from "./gate-banner";
import { NoReadState } from "./no-read-state";
import {
  BULK_CONFIRM,
  BULK_CONFIRM_NOTE,
  BULK_CONFIRMING,
  CANCEL_READ,
  ENLARGE_CROP,
  ENTER_MANUALLY,
  NO_CROP_YET,
  NOT_READ_YET,
  READ_FAILED_BODY,
  READ_FAILED_TITLE,
  readAtLabel,
  READING_LABEL,
  SLOW_READ_AFTER_MS,
  STILL_READING,
  TRY_AGAIN,
} from "./review-copy";
import {
  InlineActionError,
  ReviewButton,
  ReviewDisabledContext,
  useActionCall,
  type ReviewDisabledState,
} from "./review-controls";
import type {
  ExtractionReviewActions,
  ExtractionReviewCardProps,
  ReviewFieldView,
  ReviewImage,
} from "./types";

/**
 * `ExtractionReviewCard` — `UX_SPEC.md` §2.1. **The highest-value component
 * in the product.** It is where a person takes responsibility for what the
 * machine read, and it is what makes every downstream document defensible.
 *
 * ## What it is
 *
 * A composition of the pieces beside it — header, gate banner, field rows,
 * catalog match panel, action bar — and nothing else. It holds no data
 * access, knows no route, imports nothing from `next/navigation`, and does
 * every consequential thing through the `actions` the route hands it.
 * `/batteries/new` step 2 and `/review` render this one component.
 *
 * ## Three things it will not do
 *
 * - **Confirm optimistically.** A row reads as confirmed only when the props
 *   say the server wrote it (§6.4). The card awaits every action and re-renders
 *   from the answer.
 * - **Bulk-confirm a hard-gated field.** The eligible set is computed here from
 *   the rows — pending, High, and never `model`, `chemistry_code` or
 *   `assessed_condition` — and handed to the action as its argument, so a test
 *   can hold the card to it (Rules 2.15, 2.17; `_ANCHORS.md` §6).
 * - **Compose a reason.** The primary's checklist is `OutstandingItem`s from
 *   `src/domain/intake/commit-gate.ts`, the same list the server refuses with.
 *
 * ## States (§2.1.6)
 *
 * `default` · `loading` (skeleton rows, a text status, always a Cancel; slow
 * copy after the threshold) · `error` (a `critical` alert in place of the rows
 * with *Try again* and *Enter details manually*; photos preserved) · `empty`
 * (E-4, distinct from low confidence: no rows, three actions, the photo, three
 * tips) · `disabled` (every control `aria-disabled`, dimmed, one alert saying
 * why; values fully readable). There is no read-only mode: only P1 and P6
 * render this component at all (Rule 2.22).
 */

/** The disabled-state alert's copy when the route gives no reason of its own. */
const DISABLED_FALLBACK_REASON =
  "Confirmations can't be saved right now. Values stay readable.";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

function scrollTo(element: Element | null): void {
  if (element === null) return;
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }
  const control = element.querySelector<HTMLElement>(
    "button:not([aria-disabled='true']), input, [role='combobox']",
  );
  control?.focus({ preventScroll: true });
}

function isHardGatedCode(code: LabelFieldCode): boolean {
  return (HARD_GATED_LABEL_FIELD_CODES as readonly LabelFieldCode[]).includes(
    code,
  );
}

/**
 * §2.1.4(4) — the rows a bulk confirm may touch. Exported so the argument the
 * card passes can be asserted against the props it was given.
 */
export function bulkConfirmEligibleCodes(
  fields: readonly ReviewFieldView[],
): readonly LabelFieldCode[] {
  return fields
    .filter(
      (field) =>
        field.status === "pending" &&
        field.confidenceBand === "high" &&
        field.value !== null &&
        field.input.kind !== "readonly" &&
        !field.isHardGated &&
        !isHardGatedCode(field.fieldCode),
    )
    .map((field) => field.fieldCode);
}

/** The first row a person has to deal with — Low or None, still pending. */
function firstFlaggedRow(
  fields: readonly ReviewFieldView[],
): ReviewFieldView | undefined {
  return fields.find(
    (field) =>
      field.status === "pending" &&
      (field.confidenceBand === "low" ||
        field.confidenceBand === "not_extracted"),
  );
}

export function ExtractionReviewCard(
  props: ExtractionReviewCardProps,
): ReactElement {
  const {
    state,
    readAt,
    timeZone,
    fields,
    actions,
    outstanding,
    renderActionBar = true,
  } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const alertId = useId();
  const announcement = useConfirmationAnnouncement(fields);

  const disabledState = useMemo<ReviewDisabledState>(
    () =>
      state === "disabled"
        ? {
            reason: props.disabledReason ?? DISABLED_FALLBACK_REASON,
            alertId,
          }
        : { reason: null, alertId: null },
    [state, props.disabledReason, alertId],
  );

  function scrollToRow(fieldCode: LabelFieldCode | undefined): void {
    const root = rootRef.current;
    if (root === null) return;
    const target =
      fieldCode === undefined
        ? root.querySelector("[data-review-action-bar]")
        : root.querySelector(`[data-field-row="${fieldCode}"]`);
    scrollTo(target ?? root);
  }

  function onResolveNow(): void {
    scrollToRow(firstFlaggedRow(fields)?.fieldCode);
  }

  function onOutstandingItem(item: OutstandingItem): void {
    scrollToRow(item.fieldCode);
  }

  const showVoid = props.mode === "review" || actions.voidItem !== undefined;

  return (
    <ReviewDisabledContext.Provider value={disabledState}>
      <Card
        ref={rootRef}
        role="region"
        aria-label="Extraction review"
        data-review-card="true"
        data-review-state={state}
        data-review-mode={props.mode}
        data-session-id={props.sessionId}
        className={cn(CARD_SPACING, "gap-4")}
      >
        <CardContent className="flex flex-col gap-6">
          {/* §2.1.7 — a confirmation announces politely. */}
          <div role="status" aria-live="polite" className="sr-only">
            {announcement}
          </div>

          <Header
            readAt={readAt}
            timeZone={timeZone}
            crop={props.cropThumbnail}
            original={props.originalPhoto}
          />

          {state === "disabled" ? (
            <Alert
              id={alertId}
              role="status"
              data-review-disabled="true"
              data-intent="attention"
              className={cn("gap-2", INTENT_SURFACE_CLASSES.attention)}
            >
              <WifiOff aria-hidden="true" />
              <AlertTitle className="text-body-strong text-balance">
                {disabledState.reason}
              </AlertTitle>
            </Alert>
          ) : null}

          {state === "loading" ? (
            <LoadingBody
              key={props.loadingSince ?? "now"}
              loadingSince={props.loadingSince ?? null}
              actions={actions}
            />
          ) : null}

          {state === "error" ? (
            <ErrorBody
              message={props.errorMessage ?? READ_FAILED_TITLE}
              actions={actions}
            />
          ) : null}

          {state === "empty" ? (
            <NoReadState
              photo={props.originalPhoto ?? props.cropThumbnail}
              actions={actions}
            />
          ) : null}

          {state === "default" || state === "disabled" ? (
            <>
              <GateBanner
                gate={props.gate}
                actions={actions}
                onResolveNow={onResolveNow}
              />

              {props.bulkConfirmAvailable ? (
                <BulkConfirm fields={fields} actions={actions} />
              ) : null}

              <div data-field-rows="true" className="flex flex-col gap-2">
                {fields.map((field) => (
                  <FieldRow
                    key={field.fieldCode}
                    field={field}
                    timeZone={timeZone}
                    actions={actions}
                  />
                ))}
              </div>

              <Separator />

              <CatalogMatchPanel
                state={props.catalogMatchState}
                candidates={props.candidates}
                selectedCatalogEntryId={props.selectedCatalogEntryId}
                cannotShipNote={props.cannotShipNote}
                actions={actions}
              />

              {renderActionBar ? (
                <>
                  <Separator />
                  <ReviewActionBar
                    primaryLabel={props.primaryLabel}
                    primaryPendingLabel={props.primaryPendingLabel}
                    outstanding={outstanding}
                    showVoid={showVoid}
                    actions={actions}
                    onOutstandingItem={onOutstandingItem}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </ReviewDisabledContext.Provider>
  );
}

/* ---------------------------------------------------------- announcement */

/**
 * "Manufacturer confirmed" for the polite live region, derived from the props
 * as they change: the server said a row is confirmed and the card repeats it.
 * State is adjusted during render (the documented pattern for reacting to a
 * prop change) rather than in an effect.
 */
function useConfirmationAnnouncement(
  fields: readonly ReviewFieldView[],
): string {
  const confirmedNow = fields
    .filter((field) => field.status === "confirmed")
    .map((field) => field.fieldCode)
    .join(",");
  const [seen, setSeen] = useState(confirmedNow);
  const [announcement, setAnnouncement] = useState("");

  if (seen !== confirmedNow) {
    const before = new Set(seen.split(",").filter((code) => code !== ""));
    const added = fields.filter(
      (field) => field.status === "confirmed" && !before.has(field.fieldCode),
    );
    setSeen(confirmedNow);
    if (added.length > 0) {
      setAnnouncement(
        `${added.map((field) => field.label).join(", ")} confirmed`,
      );
    }
  }
  return announcement;
}

/* ---------------------------------------------------------------- header */

function Header({
  readAt,
  timeZone,
  crop,
  original,
}: {
  readonly readAt: string | null;
  readonly timeZone: string;
  readonly crop: ReviewImage | null;
  readonly original: ReviewImage | null;
}): ReactElement {
  const large = original ?? crop;
  return (
    <div
      data-review-header="true"
      className="flex items-center justify-between gap-4"
    >
      {crop === null || crop.src === null ? (
        <div
          data-crop-thumbnail="empty"
          className="flex size-16 items-center justify-center rounded-md border bg-muted text-muted-foreground md:size-24"
        >
          <ImageOff aria-hidden="true" className="size-4" />
          <span className="sr-only">{NO_CROP_YET}</span>
        </div>
      ) : (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              data-crop-thumbnail="default"
              aria-label={ENLARGE_CROP}
              className="size-16 shrink-0 overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none md:size-24"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview or a stored object; never a remote asset to optimise. */}
              <img
                src={crop.src}
                alt={crop.alt}
                width={crop.width}
                height={crop.height}
                className="size-full object-cover"
              />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogTitle className="text-h2">{crop.alt}</DialogTitle>
            <DialogDescription className="sr-only">
              {ENLARGE_CROP}
            </DialogDescription>
            {large === null || large.src === null ? null : (
              // eslint-disable-next-line @next/next/no-img-element -- see above.
              <img
                src={large.src}
                alt={large.alt}
                width={large.width}
                height={large.height}
                className="h-auto w-full rounded-md"
              />
            )}
          </DialogContent>
        </Dialog>
      )}
      <p data-read-at="true" className="text-caption text-muted-foreground">
        {readAt === null ? NOT_READ_YET : readAtLabel(readAt, timeZone)}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------- bulk confirm */

function BulkConfirm({
  fields,
  actions,
}: {
  readonly fields: readonly ReviewFieldView[];
  readonly actions: Pick<ExtractionReviewActions, "confirmAllHighConfidence">;
}): ReactElement {
  const call = useActionCall();
  const eligible = bulkConfirmEligibleCodes(fields);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <ReviewButton
          variant="outline"
          data-bulk-confirm="true"
          data-bulk-confirm-count={eligible.length}
          pending={call.pending}
          pendingLabel={BULK_CONFIRMING}
          gatedReason={
            eligible.length === 0 ? "No high-confidence field is pending" : null
          }
          onPress={() =>
            void call.run(() => actions.confirmAllHighConfidence(eligible))
          }
        >
          {BULK_CONFIRM}
        </ReviewButton>
        <p className="text-caption text-muted-foreground">
          {BULK_CONFIRM_NOTE}
        </p>
      </div>
      {call.error === null ? null : (
        <InlineActionError
          dataAttribute="data-bulk-error"
          message={call.error}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- loading */

function elapsedSince(loadingSince: string | null): number {
  if (loadingSince === null) return 0;
  const started = Date.parse(loadingSince);
  return Number.isFinite(started) ? Math.max(0, Date.now() - started) : 0;
}

/**
 * §2.1.6 Loading. Mounted with `key={loadingSince}` so its initial state is
 * computed once per read; the timer flips the copy at the threshold.
 */
function LoadingBody({
  loadingSince,
  actions,
}: {
  readonly loadingSince: string | null;
  readonly actions: Pick<
    ExtractionReviewActions,
    "retakePhoto" | "enterManually"
  >;
}): ReactElement {
  const [slow, setSlow] = useState(
    () => elapsedSince(loadingSince) >= SLOW_READ_AFTER_MS,
  );
  useEffect(() => {
    if (slow) return;
    const remaining = SLOW_READ_AFTER_MS - elapsedSince(loadingSince);
    const timer = setTimeout(() => setSlow(true), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [slow, loadingSince]);
  const cancel = useActionCall();
  const manual = useActionCall();
  const error = cancel.error ?? manual.error;

  return (
    <div data-review-loading="true" className="flex flex-col gap-4">
      <p
        role="status"
        data-loading-copy={slow ? "slow" : "default"}
        className="text-body"
      >
        {slow ? STILL_READING : READING_LABEL}
      </p>
      <div data-field-rows-skeleton="true" className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <FieldRowSkeleton key={index} />
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <ReviewButton
          variant="outline"
          data-cancel-read="true"
          pending={cancel.pending}
          pendingLabel="Cancelling…"
          onPress={() => void cancel.run(() => actions.retakePhoto())}
        >
          {CANCEL_READ}
        </ReviewButton>
        {slow ? (
          <ReviewButton
            variant="outline"
            data-enter-manually="true"
            pending={manual.pending}
            pendingLabel="Switching to manual entry…"
            onPress={() => void manual.run(() => actions.enterManually())}
          >
            {ENTER_MANUALLY}
          </ReviewButton>
        ) : null}
      </div>
      {error === null ? null : (
        <InlineActionError dataAttribute="data-loading-error" message={error} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- error */

function ErrorBody({
  message,
  actions,
}: {
  readonly message: string;
  readonly actions: Pick<
    ExtractionReviewActions,
    "retryExtraction" | "enterManually"
  >;
}): ReactElement {
  const retry = useActionCall();
  const manual = useActionCall();
  const error = retry.error ?? manual.error;
  return (
    <div data-review-error="true" className="flex flex-col gap-4">
      <Alert
        role="alert"
        data-intent="critical"
        className={cn("gap-2", INTENT_SURFACE_CLASSES.critical)}
      >
        <CircleAlert aria-hidden="true" />
        <AlertTitle className="text-body-strong text-balance">
          {message}
        </AlertTitle>
        <AlertDescription className="grid gap-3 text-body text-current">
          <p className="max-w-[72ch]">{READ_FAILED_BODY}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ReviewButton
              data-try-again="true"
              pending={retry.pending}
              pendingLabel="Reading again…"
              onPress={() => void retry.run(() => actions.retryExtraction())}
            >
              {TRY_AGAIN}
            </ReviewButton>
            <ReviewButton
              variant="outline"
              data-enter-manually="true"
              pending={manual.pending}
              pendingLabel="Switching to manual entry…"
              onPress={() => void manual.run(() => actions.enterManually())}
            >
              {ENTER_MANUALLY}
            </ReviewButton>
          </div>
        </AlertDescription>
      </Alert>
      {error === null ? null : (
        <InlineActionError
          dataAttribute="data-error-action-error"
          message={error}
        />
      )}
    </div>
  );
}
