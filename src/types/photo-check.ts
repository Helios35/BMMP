import type { ProposableFindingType } from "@/domain/photo-checks/damage-proposals";
import type { PhotoCheckKind } from "@/domain/taxonomy/photo-check-kind";
import type { PhotoCheckOutcome } from "@/domain/taxonomy/photo-check-outcome";
import type {
  Created,
  Decimal,
  IsoTimestamp,
  Sha256,
  TenantScoped,
  Uuid,
} from "@/types/common";

/**
 * The photo checks — Rules 2.36, 2.37, 6.25, 6.26, 7.25; T-65, T-66; D-75.
 *
 * **`photo_check` and `catalog_reference_photo` are argued, not migrated.**
 * Neither is in `docs/ERD.md`; both are on `_ANCHORS.md` §3 from `b2-10`, and
 * the shapes below are the prototype's argument for unit 17's migration
 * (`BUILD_NOTES_b2-10-photo-checks.md` §3). Planning edits the ERD.
 */

/**
 * One photo check run — **APPEND-ONLY**. One row per run, with its T-43 audit
 * row (`photo_check.completed` or `photo_check.failed`).
 *
 * **No score, similarity, distance or probability is stored on a run** (Rules
 * 1.25, 2.36, 2.37; D-75 #5). The outcome is one T-66 value; a damage run names
 * the findings it proposed; a copy check names the photos it found; a label
 * look names the reference it compared against. Cost and latency are the
 * call's metering (`TECHNICAL_SPEC.md` §12.2), never a judgment about the
 * photo. **The raw response is not stored.**
 */
export interface PhotoCheck extends TenantScoped, Created {
  readonly id: Uuid;
  readonly intakePhotoId: Uuid;
  readonly intakeSessionId: Uuid;
  /** The session's record when the run was made; null on a record-less session. */
  readonly batteryRecordId: Uuid | null;
  /** T-65. */
  readonly checkKind: PhotoCheckKind;
  /** T-66. `failed` carries `errorCode` and is never shown as another outcome. */
  readonly outcome: PhotoCheckOutcome;
  /** Damage: the T-29 findings proposed (never `none_observed`). Empty otherwise. */
  readonly proposedFindings: readonly ProposableFindingType[];
  /** Label look: the catalog entry and the reference photo compared against. */
  readonly catalogEntryId: Uuid | null;
  readonly catalogReferencePhotoId: Uuid | null;
  /** Copy check: the other records' photos this photo looks like. */
  readonly matchedPhotoIds: readonly Uuid[];
  /** Copy check: the records those photos are on. */
  readonly matchedBatteryRecordIds: readonly Uuid[];
  /** Set only on `failed` — the provider's error code, never its message. */
  readonly errorCode: string | null;
  /** Which `VisionProvider`, by code. **No vendor name outside `src/lib/vision/providers/`** (D-25). */
  readonly provider: string | null;
  readonly modelIdentifier: string | null;
  readonly promptVersion: string | null;
  readonly costUsd: Decimal | null;
  readonly latencyMs: number | null;
  /** Copy check: the look-alike configuration applied (D-40, Rule 12.15). */
  readonly configurationVersion: string | null;
  readonly ranAt: IsoTimestamp;
  /** The person whose act ran it — an upload, a pick, a re-read. */
  readonly ranBy: Uuid | null;
}

/**
 * A catalog entry's reference label photo — **APPEND-ONLY**, platform-scoped.
 *
 * **A platform photo** — the maker's image, a spec sheet, or one the platform
 * took — **never copied from any organization's records** (Rule 2.36; D-75
 * #1): the catalog is shared, so a customer's photo would reach every other
 * tenant. It carries no `organization_id`, and its object lives under the
 * platform prefix, never under `org/{id}/`. EXIF is stripped like an intake
 * photo (Rule 7.21).
 *
 * One current per entry. Replacing it stamps `supersededAt` on the old row,
 * which stays on the entry's history (Rule 2.36) — the one permitted update.
 */
export interface CatalogReferencePhoto extends Created {
  readonly id: Uuid;
  readonly catalogEntryId: Uuid;
  readonly storageObjectPath: string;
  readonly contentHash: Sha256;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly widthPx: number;
  readonly heightPx: number;
  /** The upload's file name, kept for the reviewer and for the fixture provider. */
  readonly fileName: string | null;
  readonly isExifStripped: boolean;
  /** P6 (Rule 2.36). */
  readonly setBy: Uuid;
  readonly setAt: IsoTimestamp;
  /** Null while current. */
  readonly supersededAt: IsoTimestamp | null;
  readonly supersedesCatalogReferencePhotoId: Uuid | null;
}
