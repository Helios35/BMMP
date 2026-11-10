import type { ProposableFindingType } from "@/domain/photo-checks/damage-proposals";
import type { LabelLookModelOutcome } from "@/domain/photo-checks/label-look";
import {
  HARD_GATED_LABEL_FIELD_CODES,
  LABEL_FIELD_CODES,
  type LabelFieldCode,
} from "@/domain/taxonomy/label-field-code";

/**
 * The label reader's contract — `TECHNICAL_SPEC.md` §11.1 step 3, §12.2.
 *
 * **The model is asked to read characters, not to conclude anything.** For each
 * requested field the provider returns the value as printed, a confidence and
 * the raw text it read. Unread is a correct answer for an illegible field
 * (Rule 2.11); a guessed one is the documented failure mode this interface is
 * shaped to refuse. Every value passes shape validation before a person sees it
 * (Rule 2.12), and the raw score is kept for audit and never displayed to a
 * person — a band is what they see (T-10).
 *
 * **No vendor name appears anywhere except `src/lib/vision/providers/`** (D-25).
 * This file names no vendor, imports no SDK and knows no model identifier —
 * a provider carries its own `modelIdentifier` and the pipeline stores it on
 * `label_extraction` without reading it. Adding a second provider is one new
 * file under `providers/` and one entry in the selector; nothing else changes
 * (RN-1).
 *
 * `chemistry_code` is the chemistry designation **printed on the label**, read
 * as characters. It feeds catalog resolution and by itself sets nothing.
 * Chemistry on a record comes from a matched catalog entry or from a person
 * (Rules 2.9, 2.10), never from a provider.
 */

/**
 * The closed vocabulary is `TAXONOMY.md` T-09. A new extracted field is a
 * taxonomy addition, never a new free-text key — which is why this is an alias
 * of the taxonomy module's type and not a second list that could drift.
 */
export type LabelFieldKey = LabelFieldCode;

/** Every key, in T-09's display order. The provider answers for all of them. */
export const LABEL_FIELD_KEYS: readonly LabelFieldKey[] = LABEL_FIELD_CODES;

/**
 * T-09's hard-gated fields. No confidence band auto-commits these (Rule 2.15).
 * Re-exported from the taxonomy module so the gate and the reader read one list.
 */
export const HARD_GATED_FIELDS = HARD_GATED_LABEL_FIELD_CODES;

/** The version of the shape every provider's answer is validated against. */
export const LABEL_EXTRACTION_SCHEMA_VERSION = "label-extraction.v1";

export interface LabelFieldResult<T> {
  /** null = not extracted (Rule 2.11). */
  readonly value: T | null;
  /**
   * 0..1, per field, required — mapped to a T-10 band before storage; the raw
   * score is kept for audit and never displayed.
   */
  readonly confidence: number;
  readonly evidence?: {
    readonly boundingBox?: readonly [number, number, number, number];
    /** The characters actually read. */
    readonly rawText?: string;
  };
}

/** Tokens and cost, when the provider reports them (§12.2: recorded per call). */
export interface ExtractionUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd?: number;
}

export interface LabelExtractionResult {
  readonly schemaVersion: string;
  readonly fields: { readonly [K in LabelFieldKey]: LabelFieldResult<unknown> };
  readonly providerCode: string;
  readonly modelIdentifier: string;
  readonly promptVersion: string;
  /** Stored verbatim for audit. */
  readonly rawResponse: unknown;
  /** Absent or null when the provider measured nothing (the fixture never does). */
  readonly usage?: ExtractionUsage | null;
}

/** A region of an image in pixel coordinates of the image it was detected in. */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What `detectLabelRegion` proposes; `null` means "ask a person to draw it". */
export interface RegionDetection {
  readonly box: BoundingBox;
  readonly confidence: number;
}

/**
 * The bytes go to the provider as-is. **EXIF has already been stripped** by the
 * upload route before anything reaches here (Rule 7.21) — a provider never sees
 * GPS or a device identifier.
 */
export interface RegionRequest {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  /** The upload's file name, when the caller has one. The fixture keys on it. */
  readonly fileName: string | null;
}

export interface ExtractionRequest {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly fileName: string | null;
  /**
   * The fields the caller asked for. A provider answers for every T-09 key, but
   * a non-null value for a key that was not requested is a fabrication and the
   * schema refuses it (EC-7).
   */
  readonly requestedFields: readonly LabelFieldKey[];
}

// --- the photo checks (b2-10; Rules 2.36, 2.37, 6.25) ------------------------------

/** The versions of the shapes the photo checks' answers are validated against. */
export const DAMAGE_PROPOSAL_SCHEMA_VERSION = "damage-proposal.v1";
export const LABEL_LOOK_SCHEMA_VERSION = "label-look.v1";

/**
 * One stored image, as a photo check sends it. **EXIF has already been
 * stripped** by the upload route (Rule 7.21). `fileName` is a hint the fixture
 * keys on; a real provider reads the bytes.
 */
export interface PhotoImage {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly fileName: string | null;
}

/**
 * The call's metering, when the provider reports it — tokens and cost, so cost
 * and latency are recorded per call on `photo_check` (`TECHNICAL_SPEC.md`
 * §12.2). **Never a judgment about the photo**: no score, similarity or
 * distance has anywhere to go in these shapes.
 */
export type PhotoCheckUsage = ExtractionUsage;

/**
 * What the model proposed on one whole-pack or damage photo (Rule 6.25): T-29
 * findings minus `none_observed`, and nothing else — **no number and no
 * words**. The photo each was seen on is the request's own photo; the caller
 * attaches it. An empty list is "nothing proposed", which is never "none
 * observed".
 */
export interface DamageProposalResult {
  readonly schemaVersion: string;
  readonly findings: readonly ProposableFindingType[];
  readonly providerCode: string;
  readonly modelIdentifier: string;
  readonly promptVersion: string;
  readonly usage?: PhotoCheckUsage | null;
}

export interface LabelLookRequest {
  /** The record's label crop, or its label photo when there is no crop. */
  readonly photo: PhotoImage;
  /** The matched catalog entry's current reference label photo. */
  readonly reference: PhotoImage;
}

/** One closed outcome and no words (Rule 2.36). */
export interface LabelLookResult {
  readonly schemaVersion: string;
  readonly outcome: LabelLookModelOutcome;
  readonly providerCode: string;
  readonly modelIdentifier: string;
  readonly promptVersion: string;
  readonly usage?: PhotoCheckUsage | null;
}

export interface VisionProvider {
  readonly code: string;
  detectLabelRegion(req: RegionRequest): Promise<RegionDetection | null>;
  extractLabelFields(req: ExtractionRequest): Promise<LabelExtractionResult>;
  /**
   * Rule 6.25 — T-29 findings (minus `none_observed`) seen on one whole-pack
   * or damage photo. Anything outside that closed set is `malformed`.
   */
  proposeDamageFindings(image: PhotoImage): Promise<DamageProposalResult>;
  /**
   * Rule 2.36 — `looks_consistent` · `looks_different` · `cannot_compare`.
   * A vendor's similarity number is turned into one of these inside the
   * provider and never leaves it.
   */
  compareLabelToReference(req: LabelLookRequest): Promise<LabelLookResult>;
  /**
   * Rule 2.37 — a look-alike fingerprint, `<scheme>:<hex>`. **Deterministic**:
   * the same image always gives the same fingerprint.
   */
  fingerprintPhoto(image: PhotoImage): Promise<string>;
}

export const VISION_PROVIDER_ERROR_CODES = [
  "timeout",
  "rate_limited",
  "unavailable",
  "malformed",
] as const;

export type VisionProviderErrorCode =
  (typeof VISION_PROVIDER_ERROR_CODES)[number];

/**
 * Which failures a caller may retry. §12.2: retry with jitter on rate limiting
 * and on the service being down, never on a response the schema refused — a
 * malformed answer retried is the same malformed answer, and the pipeline's
 * job is to route the session to review with a stated reason, never to
 * fabricate a field.
 */
const RETRYABLE_BY_CODE: Readonly<Record<VisionProviderErrorCode, boolean>> = {
  timeout: true,
  rate_limited: true,
  unavailable: true,
  malformed: false,
};

/**
 * The one error a provider throws. The pipeline maps it to an `IntegrationError`
 * at the seam and records the code on the session; nothing below the seam
 * names a vendor in a message either.
 */
export class VisionProviderError extends Error {
  readonly code: VisionProviderErrorCode;
  readonly retryable: boolean;

  constructor(
    code: VisionProviderErrorCode,
    message: string,
    options: { readonly retryable?: boolean; readonly cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.retryable = options.retryable ?? RETRYABLE_BY_CODE[code];
  }
}

export function isVisionProviderError(
  value: unknown,
): value is VisionProviderError {
  return value instanceof VisionProviderError;
}
