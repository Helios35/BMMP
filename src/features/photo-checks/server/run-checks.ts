import "server-only";

import { data } from "@/data";
import type {
  PhotoCheckRecording,
  RequestContext,
  StorageWriteAttribution,
} from "@/data/contracts";
import { PLATFORM_BUCKET } from "@/data/contracts/object-store";
import { labelLookSubject } from "@/domain/photo-checks/label-look";
import type { PhotoCheckOutcome } from "@/domain/taxonomy/photo-check-outcome";
import {
  isVisionProviderError,
  parseDamageProposalResult,
  parseLabelLookResult,
  parseLookFingerprint,
  visionProvider,
  type PhotoCheckUsage,
  type PhotoImage,
} from "@/lib/vision";
import type { CatalogEntry } from "@/types/catalog";
import type { IsoTimestamp } from "@/types/common";
import type { IntakePhoto } from "@/types/intake";
import type { CatalogReferencePhoto, PhotoCheck } from "@/types/photo-check";

/**
 * Running the photo checks — Rules 2.36, 2.37, 6.25, 6.26; D-75 #5, #6.
 *
 * **A failed or missing check never blocks and never reads as a pass**
 * (D-75 #6). Every runner here catches the provider's failure and records it
 * as a `failed` run with the provider's error code — never its message — and
 * if even the recording fails, it logs with the correlation id and returns
 * `null` rather than throw into the act that set it running. An upload, a
 * read or a pick never waits on a check's success.
 *
 * **No number and no model-written words leave the seam** (D-75 #5): every
 * answer passes its strict schema (`src/lib/vision/schema.ts`) before it is
 * read, and what is recorded is the closed outcome, the findings or photos it
 * names, and the call's metering. The raw response is not kept.
 *
 * The provider is called inline. A real vendor can be slow; unit 19 may move
 * the damage proposal behind the response (D-74 #9's pattern for the recall
 * check) — the run row and the screens read the same either way.
 */

const BUCKET = "intake-photos" as const;

/** Photo types the model is asked about (Rule 6.25). */
const PROPOSAL_PHOTO_TYPES: readonly string[] = ["whole_pack", "damage"];

const UNEXPECTED = "unexpected";

function errorCodeOf(error: unknown): string {
  return isVisionProviderError(error) ? error.code : UNEXPECTED;
}

function costOf(usage: PhotoCheckUsage | null | undefined): string | null {
  return usage?.costUsd === undefined ? null : String(usage.costUsd);
}

function imageOf(
  photo: Pick<IntakePhoto, "mimeType" | "widthPx" | "heightPx">,
  bytes: Uint8Array,
  fileName: string | null,
): PhotoImage {
  return {
    bytes,
    mimeType: photo.mimeType,
    width: photo.widthPx,
    height: photo.heightPx,
    fileName,
  };
}

/** One run recorded, or `null` — logged, never thrown — where even that failed. */
async function recordRun(
  ctx: RequestContext,
  recording: PhotoCheckRecording,
): Promise<PhotoCheck | null> {
  try {
    return await data.photoChecks.record(ctx, recording);
  } catch (error) {
    console.error(
      `[photo-checks] a ${recording.checkKind} run could not be recorded (correlationId=${ctx.correlationId})`,
      error,
    );
    return null;
  }
}

function blank(
  input: Pick<
    PhotoCheckRecording,
    "intakePhotoId" | "checkKind" | "outcome" | "at" | "attribution"
  >,
): PhotoCheckRecording {
  return {
    proposedFindings: [],
    catalogEntryId: null,
    catalogReferencePhotoId: null,
    matchedPhotoIds: [],
    matchedBatteryRecordIds: [],
    errorCode: null,
    provider: null,
    modelIdentifier: null,
    promptVersion: null,
    costUsd: null,
    latencyMs: null,
    configurationVersion: null,
    ...input,
  };
}

// --- damage proposals (Rules 6.25, 6.26) -------------------------------------------------------

/** Whether a stored photo is one the model is asked about. A crop never is. */
export function takesDamageProposal(photo: IntakePhoto): boolean {
  return (
    photo.parentIntakePhotoId === null &&
    PROPOSAL_PHOTO_TYPES.includes(photo.photoType)
  );
}

/**
 * Ask the model for T-29 findings on one whole-pack or damage photo, at the
 * moment it is stored — at intake, and when attached for a re-assessment
 * (Rule 6.25). `null` for any other photo, and where the run could not even
 * be recorded.
 */
export async function runDamageProposal(
  ctx: RequestContext,
  input: {
    readonly photo: IntakePhoto;
    readonly bytes: Uint8Array;
    readonly fileName: string | null;
    readonly at: IsoTimestamp;
    readonly attribution: StorageWriteAttribution;
  },
): Promise<PhotoCheck | null> {
  if (!takesDamageProposal(input.photo)) return null;
  const provider = visionProvider();
  const started = Date.now();
  try {
    const result = parseDamageProposalResult(
      await provider.proposeDamageFindings(
        imageOf(input.photo, input.bytes, input.fileName),
      ),
    );
    return recordRun(ctx, {
      ...blank({
        intakePhotoId: input.photo.id,
        checkKind: "damage_proposal",
        outcome: result.findings.length > 0 ? "proposed" : "nothing_proposed",
        at: input.at,
        attribution: input.attribution,
      }),
      proposedFindings: result.findings,
      provider: result.providerCode,
      modelIdentifier: result.modelIdentifier,
      promptVersion: result.promptVersion,
      costUsd: costOf(result.usage),
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    return recordRun(ctx, {
      ...blank({
        intakePhotoId: input.photo.id,
        checkKind: "damage_proposal",
        outcome: "failed",
        at: input.at,
        attribution: input.attribution,
      }),
      errorCode: errorCodeOf(error),
      provider: provider.code,
      latencyMs: Date.now() - started,
    });
  }
}

// --- the fingerprint (Rule 2.37) ---------------------------------------------------------------

export type FingerprintOutcome =
  | { readonly kind: "set"; readonly fingerprint: string }
  | {
      readonly kind: "failed";
      readonly errorCode: string;
      readonly provider: string;
    };

/**
 * The look-alike fingerprint for bytes about to be stored. A failure is not
 * an upload failure: the photo is stored with none — and a photo with no
 * fingerprint is never compared (Rule 2.37) — and the caller records the
 * failed copy check once the row exists.
 */
export async function fingerprintForUpload(
  image: PhotoImage,
): Promise<FingerprintOutcome> {
  const provider = visionProvider();
  try {
    return {
      kind: "set",
      fingerprint: parseLookFingerprint(await provider.fingerprintPhoto(image)),
    };
  } catch (error) {
    return {
      kind: "failed",
      errorCode: errorCodeOf(error),
      provider: provider.code,
    };
  }
}

/** Record that a stored photo could not be fingerprinted (Rule 2.37). */
export async function recordFingerprintFailure(
  ctx: RequestContext,
  input: {
    readonly photo: IntakePhoto;
    readonly failure: Extract<FingerprintOutcome, { kind: "failed" }>;
    readonly at: IsoTimestamp;
    readonly attribution: StorageWriteAttribution;
  },
): Promise<PhotoCheck | null> {
  return recordRun(ctx, {
    ...blank({
      intakePhotoId: input.photo.id,
      checkKind: "look_alike",
      outcome: "failed",
      at: input.at,
      attribution: input.attribution,
    }),
    errorCode: input.failure.errorCode,
    provider: input.failure.provider,
  });
}

// --- the label look check (Rule 2.36) ----------------------------------------------------------

export interface LabelLookFinding {
  readonly outcome: PhotoCheckOutcome;
  readonly entry: CatalogEntry;
  readonly reference: CatalogReferencePhoto | null;
  /** The photo compared — the crop, or the label photo when there is no crop. */
  readonly subject: IntakePhoto;
  readonly check: PhotoCheck | null;
}

/**
 * Compare the record's label crop — or its label photo when there is no crop
 * — with the matched entry's current reference (Rule 2.36). Runs where Rule
 * 2.35 runs: the read's exact match, and a person's pick. `null` only when
 * the session holds no label photo at all; a missing reference is recorded as
 * `no_reference` and nothing is compared.
 */
export async function runLabelLookCheck(
  ctx: RequestContext,
  input: {
    readonly entry: CatalogEntry;
    readonly labelPhoto: IntakePhoto | null;
    readonly crop: IntakePhoto | null;
    /** The label upload's file name, when the caller still has it. The fixture keys on it. */
    readonly labelFileName: string | null;
    /** The label bytes, when the caller already holds them (the crop's are the parent's in B1a). */
    readonly labelBytes: Uint8Array | null;
    readonly at: IsoTimestamp;
    readonly attribution: StorageWriteAttribution;
  },
): Promise<LabelLookFinding | null> {
  const subject = labelLookSubject(input.labelPhoto, input.crop);
  if (subject === null) return null;
  const { entry } = input;

  let reference: CatalogReferencePhoto | null = null;
  try {
    reference = await data.catalogReferencePhotos.current(ctx, entry.id);
  } catch (error) {
    console.error(
      `[photo-checks] the reference photo could not be read (correlationId=${ctx.correlationId})`,
      error,
    );
    const check = await recordRun(ctx, {
      ...blank({
        intakePhotoId: subject.id,
        checkKind: "label_look",
        outcome: "failed",
        at: input.at,
        attribution: input.attribution,
      }),
      catalogEntryId: entry.id,
      errorCode: UNEXPECTED,
    });
    return { outcome: "failed", entry, reference: null, subject, check };
  }

  if (reference === null) {
    const check = await recordRun(ctx, {
      ...blank({
        intakePhotoId: subject.id,
        checkKind: "label_look",
        outcome: "no_reference",
        at: input.at,
        attribution: input.attribution,
      }),
      catalogEntryId: entry.id,
    });
    return { outcome: "no_reference", entry, reference, subject, check };
  }

  const provider = visionProvider();
  const started = Date.now();
  try {
    const [photoBytes, referenceBytes] = await Promise.all([
      input.labelBytes ??
        data.objects.get(ctx, {
          bucket: BUCKET,
          path: subject.storageObjectPath,
        }),
      data.objects.get(ctx, {
        bucket: PLATFORM_BUCKET,
        path: reference.storageObjectPath,
      }),
    ]);
    const result = parseLabelLookResult(
      await provider.compareLabelToReference({
        photo: imageOf(subject, photoBytes, input.labelFileName),
        reference: imageOf(reference, referenceBytes, reference.fileName),
      }),
    );
    const check = await recordRun(ctx, {
      ...blank({
        intakePhotoId: subject.id,
        checkKind: "label_look",
        outcome: result.outcome,
        at: input.at,
        attribution: input.attribution,
      }),
      catalogEntryId: entry.id,
      catalogReferencePhotoId: reference.id,
      provider: result.providerCode,
      modelIdentifier: result.modelIdentifier,
      promptVersion: result.promptVersion,
      costUsd: costOf(result.usage),
      latencyMs: Date.now() - started,
    });
    return { outcome: result.outcome, entry, reference, subject, check };
  } catch (error) {
    const check = await recordRun(ctx, {
      ...blank({
        intakePhotoId: subject.id,
        checkKind: "label_look",
        outcome: "failed",
        at: input.at,
        attribution: input.attribution,
      }),
      catalogEntryId: entry.id,
      catalogReferencePhotoId: reference.id,
      errorCode: errorCodeOf(error),
      provider: provider.code,
      latencyMs: Date.now() - started,
    });
    return { outcome: "failed", entry, reference, subject, check };
  }
}
