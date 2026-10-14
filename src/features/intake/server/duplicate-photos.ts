import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  duplicateRecordIds,
  findDuplicatePhotos,
  type DuplicatePhotoMatch,
  type PhotoFingerprint,
} from "@/domain/intake/duplicate-photo";
import type { Uuid } from "@/types/common";
import type { IntakePhoto, IntakeSession } from "@/types/intake";

/**
 * The duplicate-photo check, read — D-56 level 1, D-63 #5; T-52
 * `duplicate_photo`.
 *
 * Reads the session's photos and, for each distinct fingerprint, every photo
 * in the organization with the same one (`intakePhotos.list({ contentHash })`
 * — tenant-scoped, so another tenant's photo is never a candidate), maps each
 * candidate to its session's record, and hands the lot to
 * `findDuplicatePhotos`, which owns what counts as a match.
 *
 * **Called on every path that routes a record**: the pipeline's gate (a read,
 * a failed read) and the manual-entry path, and again by the step view so the
 * card can link the records it names. There is no flag that skips it.
 */

/** Well beyond anything one session or one fingerprint holds in B1a. */
const SESSION_PHOTO_LIMIT = 100;
const MATCHES_PER_FINGERPRINT = 200;

export interface DuplicatePhotoRecord {
  readonly id: Uuid;
  readonly recordNumber: string;
}

export interface DuplicatePhotoFinding {
  readonly matches: readonly DuplicatePhotoMatch[];
  /** The records the matches name, readable by the caller. */
  readonly records: readonly DuplicatePhotoRecord[];
}

function fingerprint(
  photo: IntakePhoto,
  batteryRecordId: Uuid | null,
): PhotoFingerprint {
  return {
    photoId: photo.id,
    intakeSessionId: photo.intakeSessionId,
    batteryRecordId,
    contentHash: photo.contentHash,
    isCrop: photo.parentIntakePhotoId !== null,
  };
}

export async function readDuplicatePhotos(
  ctx: RequestContext,
  session: IntakeSession,
  sessionPhotos?: readonly IntakePhoto[],
): Promise<DuplicatePhotoFinding> {
  const photos =
    sessionPhotos ??
    (
      await data.intakePhotos.list(ctx, {
        intakeSessionId: session.id,
        limit: SESSION_PHOTO_LIMIT,
      })
    ).items;
  const originals = photos.filter(
    (photo) => photo.parentIntakePhotoId === null,
  );
  const hashes = [...new Set(originals.map((photo) => photo.contentHash))];

  const candidates: IntakePhoto[] = [];
  for (const contentHash of hashes) {
    const page = await data.intakePhotos.list(ctx, {
      contentHash,
      isCrop: false,
      limit: MATCHES_PER_FINGERPRINT,
    });
    candidates.push(...page.items);
  }

  // Each candidate session's record, read once.
  const recordOfSession = new Map<Uuid, Uuid | null>([
    [session.id, session.batteryRecordId],
  ]);
  for (const candidate of candidates) {
    if (recordOfSession.has(candidate.intakeSessionId)) continue;
    const other = await data.intakeSessions.get(ctx, candidate.intakeSessionId);
    recordOfSession.set(
      candidate.intakeSessionId,
      other?.batteryRecordId ?? null,
    );
  }

  const matches = findDuplicatePhotos(
    {
      intakeSessionId: session.id,
      batteryRecordId: session.batteryRecordId,
      photos: originals.map((photo) =>
        fingerprint(photo, session.batteryRecordId),
      ),
    },
    candidates.map((candidate) =>
      fingerprint(
        candidate,
        recordOfSession.get(candidate.intakeSessionId) ?? null,
      ),
    ),
  );

  const records: DuplicatePhotoRecord[] = [];
  for (const id of duplicateRecordIds(matches)) {
    const record = await data.batteryRecords.get(ctx, id);
    if (record !== null) {
      records.push({ id: record.id, recordNumber: record.recordNumber });
    }
  }
  return { matches, records };
}
