"use client";

import type { ExtractionReviewActions } from "@/components/extraction-review";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";
import type { Chemistry } from "@/domain/taxonomy/chemistry";
import type { DamageFindingType } from "@/domain/taxonomy/damage-finding-type";
import type { LabelFieldCode } from "@/domain/taxonomy/label-field-code";
import {
  advanceToStep,
  choosePlacement,
  confirmCondition,
  confirmField,
  confirmIntake,
  createContainerForIntake,
  enterChemistry,
  enterFieldValue,
  proposeCatalogEntry,
  rejectExtraction,
  rejectField,
  runLabelExtraction,
  saveToReviewQueue,
  selectCatalogCandidate,
  setCondition,
  setSourceDevice,
  setStateOfCharge,
  voidIntakeSession,
} from "@/features/intake/actions";
import { actionFailed, type ActionResult } from "@/lib/action-result";
import type { DraftSourceDevice, DraftStateOfCharge } from "@/types/intake";

import { intakeStepHref } from "./intake-hrefs";

/**
 * The Server Actions, bound to one session and shaped for the components
 * that call them — `UX_SPEC.md` §2.1, §3.9; `TECHNICAL_SPEC.md` §7.1.
 *
 * `ExtractionReviewCard` is decoupled: it knows no route and no session, and
 * every consequential thing it does goes out through an
 * {@link ExtractionReviewActions} object (design §8.1). This module is where
 * that object is built for `/batteries/new` — each member is the matching
 * action from `../actions`, called with the session id closed over, and
 * nothing else. `/review` (unit 03) builds its own object against the same
 * actions with a different `navigate`.
 *
 * ## Two rules every closure keeps
 *
 * - **The server's answer is the only answer.** A closure returns the
 *   `ActionResult` it got, unchanged, and asks the route to re-read the step
 *   (`refresh`) only after `ok: true`. Nothing is marked done here, and a
 *   confirmation or a commit is never rendered before the server has written
 *   it (§6.4).
 * - **Navigation belongs to the route.** A closure that moves the person on
 *   — to step 3, back to capture, to the record — calls `navigate` with the
 *   href and never touches `next/navigation` itself, so the same bindings
 *   render under a test with no router.
 *
 * Two members have no server action of their own and say so in the code:
 * `enterManually` is a change of view (the rows render for typing; typing is
 * `enterValue`), and `confirmAllHighConfidence` is the card's own eligible
 * set confirmed one field at a time through `confirmField`, because there is
 * no bulk write and a bulk write would be the path §2.1.4(4) forbids for the
 * hard-gated three.
 */

export interface ReviewActionBindings {
  readonly sessionId: string;
  readonly batteryRecordId: string;
  /** `intake_session.correlation_id`, for a failure composed on this side. */
  readonly correlationId: string;
  /** The original label photo, for **Try again**; `null` when none is stored. */
  readonly labelPhotoId: string | null;
  /** The upload's file name where the route still holds it; `null` on a resumed session. */
  readonly labelFileName: string | null;
  /**
   * What a catalog proposal would carry, composed by the route from the
   * draft. `null` while the draft lacks a manufacturer or a chemistry — a
   * proposal needs both (`proposeCatalogEntrySchema`).
   */
  readonly proposal: {
    readonly manufacturerName: string;
    readonly modelName: string | null;
    readonly partNumber: string | null;
    readonly chemistry: Chemistry;
    readonly applicationClass: ApplicationClass;
  } | null;
  /** The text to search the catalog for — the read manufacturer and model. */
  readonly catalogQuery: string | null;
  readonly navigate: (href: string) => void;
  readonly refresh: () => void;
  /** Show the rows for hand entry (E-4, E-5). A view change, not a write. */
  readonly enterManually: () => void;
}

const NO_LABEL_PHOTO_TO_READ =
  "There is no label photo to read again. Re-take the photo to continue.";

const PROPOSAL_NEEDS_IDENTITY =
  "A catalog proposal needs the manufacturer and the chemistry. Enter both on the card first.";

export function bindReviewActions(
  bindings: ReviewActionBindings,
): ExtractionReviewActions {
  const {
    sessionId,
    batteryRecordId,
    correlationId,
    navigate,
    refresh,
    enterManually,
  } = bindings;

  /** Run a draft write and re-read the step when it landed. */
  async function write<T>(
    call: () => Promise<ActionResult<T>>,
  ): Promise<ActionResult<T>> {
    const result = await call();
    if (result.ok) refresh();
    return result;
  }

  /** Run an action and, when it landed, move the person to `href`. */
  async function leave<T>(
    call: () => Promise<ActionResult<T>>,
    href: (data: T) => string,
  ): Promise<ActionResult<T>> {
    const result = await call();
    if (result.ok) navigate(href(result.data));
    return result;
  }

  /** §2.1.5 whole-read reject and §2.1.6 Cancel both return to capture with the photos kept. */
  const backToCapture = (): Promise<ActionResult<unknown>> =>
    leave(
      () => rejectExtraction({ sessionId }),
      () => intakeStepHref(sessionId, "capture"),
    );

  return {
    confirmField: (fieldCode: LabelFieldCode, value: string | null) =>
      write(() => confirmField({ sessionId, fieldCode, value })),

    rejectField: (fieldCode: LabelFieldCode) =>
      write(() => rejectField({ sessionId, fieldCode })),

    enterValue: (fieldCode: LabelFieldCode, value: string | null) =>
      write(() => enterFieldValue({ sessionId, fieldCode, value })),

    selectCandidate: (catalogEntryId: string | null) =>
      write(() => selectCatalogCandidate({ sessionId, catalogEntryId })),

    enterChemistry: (chemistry: Chemistry) =>
      write(() => enterChemistry({ sessionId, chemistry })),

    rejectRead: backToCapture,

    // §2.1.4 — save and leave. `/review` is unit 03's; until it exists the
    // record page is where a pending-review record is read.
    saveToQueue: () =>
      leave(
        () => saveToReviewQueue({ sessionId }),
        () => `/batteries/${batteryRecordId}`,
      ),

    voidItem: (reason: string) =>
      leave(
        () => voidIntakeSession({ sessionId, reason }),
        () => "/batteries",
      ),

    continue: () =>
      leave(
        () => advanceToStep({ sessionId, step: "confirm_and_place" }),
        () => intakeStepHref(sessionId, "confirm_and_place"),
      ),

    /**
     * One `confirmField` per eligible code, in the card's order, stopping at
     * the first refusal so the rows the server did confirm are the rows the
     * person sees confirmed. The set arrives from `bulkConfirmEligibleCodes`
     * and never carries a hard-gated code (§2.1.4(4)).
     */
    confirmAllHighConfidence: async (fieldCodes: readonly LabelFieldCode[]) => {
      let last: ActionResult<unknown> = { ok: true, data: null };
      for (const fieldCode of fieldCodes) {
        last = await confirmField({ sessionId, fieldCode, value: null });
        if (!last.ok) break;
      }
      if (fieldCodes.length > 0) refresh();
      return last;
    },

    retryExtraction: async () => {
      if (bindings.labelPhotoId === null) {
        return actionFailed({
          code: "VALIDATION",
          message: NO_LABEL_PHOTO_TO_READ,
          correlationId,
        });
      }
      const labelPhotoId = bindings.labelPhotoId;
      return leave(
        () =>
          runLabelExtraction({
            sessionId,
            labelPhotoId,
            labelFileName: bindings.labelFileName,
          }),
        (data) =>
          // A read that needs a hand-drawn crop is finished on the capture
          // step, where the photo is.
          data.kind === "needs_manual_crop"
            ? intakeStepHref(sessionId, "capture")
            : intakeStepHref(sessionId, "extraction_review"),
      );
    },

    enterManually: () => {
      enterManually();
      return Promise.resolve({ ok: true, data: null });
    },

    retakePhoto: backToCapture,

    // The draft is persisted server-side, so leaving for the catalog loses
    // nothing; the resume notice brings the person back (Flow A-a).
    searchCatalog: () => {
      const query = bindings.catalogQuery;
      navigate(
        query === null ? "/catalog" : `/catalog?q=${encodeURIComponent(query)}`,
      );
      return Promise.resolve({ ok: true, data: null });
    },

    proposeEntry: () => {
      const proposal = bindings.proposal;
      if (proposal === null) {
        return Promise.resolve(
          actionFailed({
            code: "VALIDATION",
            message: PROPOSAL_NEEDS_IDENTITY,
            correlationId,
          }),
        );
      }
      return write(() =>
        proposeCatalogEntry({
          sessionId,
          manufacturerName: proposal.manufacturerName,
          modelName: proposal.modelName,
          partNumber: proposal.partNumber,
          chemistry: proposal.chemistry,
          applicationClass: proposal.applicationClass,
        }),
      );
    },
  };
}

/* ------------------------------------------------------------- step 3 */

export interface PlacementActionBindings {
  readonly sessionId: string;
  readonly refresh: () => void;
}

/** What step 3's forms and picker call — each the matching Server Action, bound. */
export interface PlacementActions {
  readonly setCondition: (
    findingTypes: readonly DamageFindingType[],
    isDefective: boolean,
  ) => Promise<ActionResult<unknown>>;
  readonly confirmCondition: () => Promise<ActionResult<unknown>>;
  readonly setStateOfCharge: (
    value: DraftStateOfCharge,
  ) => Promise<ActionResult<unknown>>;
  readonly setSourceDevice: (
    value: DraftSourceDevice,
  ) => Promise<ActionResult<unknown>>;
  readonly choosePlacement: (
    containerId: string | null,
  ) => Promise<ActionResult<unknown>>;
  readonly createContainer: (input: {
    readonly storageLocation: string;
  }) => Promise<ActionResult<{ readonly id: string }>>;
  /** The commit. On success the action itself redirects to the record. */
  readonly confirmIntake: () => Promise<ActionResult<never>>;
}

export function bindPlacementActions(
  bindings: PlacementActionBindings,
): PlacementActions {
  const { sessionId, refresh } = bindings;

  async function write<T>(
    call: () => Promise<ActionResult<T>>,
  ): Promise<ActionResult<T>> {
    const result = await call();
    if (result.ok) refresh();
    return result;
  }

  return {
    setCondition: (findingTypes, isDefective) =>
      write(() =>
        setCondition({
          sessionId,
          findingTypes: [...findingTypes],
          isDefective,
        }),
      ),
    confirmCondition: () => write(() => confirmCondition({ sessionId })),
    setStateOfCharge: (value) =>
      write(() =>
        setStateOfCharge({
          sessionId,
          band: value.band,
          percent: value.percent,
          source: value.source,
        }),
      ),
    setSourceDevice: (value) =>
      write(() => setSourceDevice({ sessionId, sourceDevice: value })),
    choosePlacement: (containerId) =>
      write(() => choosePlacement({ sessionId, containerId })),
    createContainer: async (input) => {
      const result = await write(() =>
        createContainerForIntake({
          sessionId,
          storageLocation: input.storageLocation,
        }),
      );
      return result.ok
        ? { ok: true, data: { id: result.data.containerId } }
        : result;
    },
    // Never `refresh` here: success is a redirect the action performs, and a
    // failure is rendered by the caller above the primary (§10.3).
    confirmIntake: () => confirmIntake({ sessionId }),
  };
}
