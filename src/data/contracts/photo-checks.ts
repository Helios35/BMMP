import type { ProposableFindingType } from "@/domain/photo-checks/damage-proposals";
import type { PhotoCheckKind } from "@/domain/taxonomy/photo-check-kind";
import type { PhotoCheckOutcome } from "@/domain/taxonomy/photo-check-outcome";
import type { Decimal, IsoTimestamp, Uuid } from "@/types/common";
import type { CatalogReferencePhoto, PhotoCheck } from "@/types/photo-check";

import type { RequestContext } from "./context";
import type { Page, PageRequest } from "./repository";
import type { StorageWriteAttribution } from "./storage";

/**
 * The photo checks — `photo_check` and `catalog_reference_photo`, argued for
 * unit 17 (`BUILD_NOTES_b2-10-photo-checks.md` §3); Rules 2.36, 2.37, 6.25,
 * 6.26, 7.25; T-43, T-65, T-66; D-75.
 *
 * **The model is asked outside this seam.** A check calls the vision provider
 * (`src/lib/vision`) and the domain (`src/domain/photo-checks`) reads the
 * answer; these repositories write what they concluded. Neither ever calls a
 * provider, so the Supabase twins are writers and nothing more.
 */

export interface PhotoCheckQuery extends PageRequest {
  readonly intakeSessionId?: Uuid;
  readonly intakePhotoId?: Uuid;
  readonly batteryRecordId?: Uuid;
  readonly checkKind?: PhotoCheckKind;
}

/** One run, as the check concluded it. */
export interface PhotoCheckRecording {
  readonly intakePhotoId: Uuid;
  readonly checkKind: PhotoCheckKind;
  /** T-66, one of the kind's own (`PHOTO_CHECK_OUTCOMES_BY_KIND`); anything else is refused. */
  readonly outcome: PhotoCheckOutcome;
  /** Damage: what was proposed. Must be empty for any other kind. */
  readonly proposedFindings: readonly ProposableFindingType[];
  readonly catalogEntryId: Uuid | null;
  readonly catalogReferencePhotoId: Uuid | null;
  readonly matchedPhotoIds: readonly Uuid[];
  readonly matchedBatteryRecordIds: readonly Uuid[];
  /** Required on `failed`, refused on anything else. */
  readonly errorCode: string | null;
  readonly provider: string | null;
  readonly modelIdentifier: string | null;
  readonly promptVersion: string | null;
  readonly costUsd: Decimal | null;
  readonly latencyMs: number | null;
  readonly configurationVersion: string | null;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface PhotoCheckRepository {
  list(ctx: RequestContext, query: PhotoCheckQuery): Promise<Page<PhotoCheck>>;

  /**
   * Append one run and its T-43 row — `photo_check.completed`, or
   * `photo_check.failed` with the reason code (Rule 6.26) — together, or
   * neither. The row is the system step's, never a person's (Rule 12.5); the
   * session and record are read from the photo, never taken from the caller.
   * P5 is refused, as on every write.
   */
  record(ctx: RequestContext, input: PhotoCheckRecording): Promise<PhotoCheck>;
}

export interface CatalogReferencePhotoQuery extends PageRequest {
  readonly catalogEntryId: Uuid;
}

/**
 * A reference label photo, as P6 sets it. The bytes have already had EXIF
 * stripped (Rule 7.21) and their dimensions read from them, by the route that
 * received them.
 */
export interface CatalogReferencePhotoSetting {
  readonly catalogEntryId: Uuid;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly fileName: string | null;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

/**
 * Reference label photos — platform rows, read by every member, set only by
 * P6 (Rule 2.36; D-75 #1, #2).
 */
export interface CatalogReferencePhotoRepository {
  /** The entry's current reference, or `null` when none is on file. */
  current(
    ctx: RequestContext,
    catalogEntryId: Uuid,
  ): Promise<CatalogReferencePhoto | null>;

  get(ctx: RequestContext, id: Uuid): Promise<CatalogReferencePhoto | null>;

  /** The entry's history, newest first — replaced ones included (Rule 2.36). */
  list(
    ctx: RequestContext,
    query: CatalogReferencePhotoQuery,
  ): Promise<Page<CatalogReferencePhoto>>;

  /**
   * **P6 only.** Store the bytes under the platform prefix — never under an
   * organization's — append the row, stamp the one it replaces as superseded
   * (kept on the history), and write `catalog_entry.reference_photo_set` with
   * before and after: one operation, or none of it.
   */
  set(
    ctx: RequestContext,
    input: CatalogReferencePhotoSetting,
  ): Promise<CatalogReferencePhoto>;
}
