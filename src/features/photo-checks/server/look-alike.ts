import "server-only";

import { data } from "@/data";
import type { RequestContext, StorageWriteAttribution } from "@/data/contracts";
import {
  findLookAlikePhotos,
  lookAlikeRecordIds,
  type LookAlikeConfiguration,
  type LookAlikeMatch,
  type LookAlikePhoto,
} from "@/domain/photo-checks/look-alike";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { IntakePhoto, IntakeSession } from "@/types/intake";
import type { PhotoCheck } from "@/types/photo-check";

/**
 * The copy check, read and recorded — Rule 2.37; D-56 level 2, D-63 #5; T-52
 * `photo_looks_reused`.
 *
 * **It runs beside the exact check** (`intake/server/duplicate-photos.ts`),
 * on every path that routes a record — the read's gate, a failed read, the
 * manual path — with the exact check's exclusions, which `findLookAlikePhotos`
 * owns. Candidates are every fingerprinted original in the organization
 * (`intakePhotos.list({ hasLookFingerprint })`, tenant-scoped, so another
 * tenant's photo is never compared — unit 17's definer function). **There is
 * no flag that skips it.**
 *
 * Reading never writes; the gate's paths record one `look_alike` run per
 * fingerprinted original on the session, through {@link recordLookAlikeRuns}.
 */

const SESSION_PHOTO_LIMIT = 100;
/** Well beyond the organization's fingerprinted photos in the prototype. */
const CANDIDATE_LIMIT = 2_000;

export interface LookAlikeRecord {
  readonly id: Uuid;
  readonly recordNumber: string;
}

export interface LookAlikeFinding {
  readonly matches: readonly LookAlikeMatch[];
  /** The records the matches name, readable by the caller. */
  readonly records: readonly LookAlikeRecord[];
  /** The photos on this session the check could compare — originals with a fingerprint. */
  readonly compared: readonly IntakePhoto[];
  /** The other records' photos the matches name, for the reviewer to see beside these. */
  readonly matchedPhotos: readonly IntakePhoto[];
  readonly configurationVersion: string;
}

function lookAlikePhoto(
  photo: IntakePhoto,
  batteryRecordId: Uuid | null,
): LookAlikePhoto {
  return {
    photoId: photo.id,
    intakeSessionId: photo.intakeSessionId,
    batteryRecordId,
    contentHash: photo.contentHash,
    lookFingerprint: photo.lookFingerprint ?? null,
    isCrop: photo.parentIntakePhotoId !== null,
  };
}

export async function readLookAlikePhotos(
  ctx: RequestContext,
  session: IntakeSession,
  sessionPhotos?: readonly IntakePhoto[],
  configuration?: LookAlikeConfiguration,
): Promise<LookAlikeFinding> {
  const applied =
    configuration ??
    (await data.platformConfiguration.readLookAlikeConfiguration(ctx));
  const photos =
    sessionPhotos ??
    (
      await data.intakePhotos.list(ctx, {
        intakeSessionId: session.id,
        limit: SESSION_PHOTO_LIMIT,
      })
    ).items;
  const compared = photos.filter(
    (photo) =>
      photo.parentIntakePhotoId === null &&
      photo.lookFingerprint !== undefined &&
      photo.lookFingerprint !== null,
  );
  if (compared.length === 0) {
    return {
      matches: [],
      records: [],
      compared,
      matchedPhotos: [],
      configurationVersion: applied.configurationVersion,
    };
  }

  const candidates = (
    await data.intakePhotos.list(ctx, {
      hasLookFingerprint: true,
      isCrop: false,
      limit: CANDIDATE_LIMIT,
    })
  ).items;

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

  const matches = findLookAlikePhotos(
    {
      intakeSessionId: session.id,
      batteryRecordId: session.batteryRecordId,
      photos: compared.map((photo) =>
        lookAlikePhoto(photo, session.batteryRecordId),
      ),
    },
    candidates.map((candidate) =>
      lookAlikePhoto(
        candidate,
        recordOfSession.get(candidate.intakeSessionId) ?? null,
      ),
    ),
    applied,
  );

  const records: LookAlikeRecord[] = [];
  for (const id of lookAlikeRecordIds(matches)) {
    const record = await data.batteryRecords.get(ctx, id);
    if (record !== null) {
      records.push({ id: record.id, recordNumber: record.recordNumber });
    }
  }
  const matchedIds = new Set(matches.flatMap((match) => match.matchedPhotoIds));
  return {
    matches,
    records,
    compared,
    matchedPhotos: candidates.filter((candidate) =>
      matchedIds.has(candidate.id),
    ),
    configurationVersion: applied.configurationVersion,
  };
}

/**
 * One `look_alike` run per photo the check compared: `copy_found` naming the
 * photos and records it looks like, or `no_copy_found`. Never throws into the
 * gate — a run that cannot be recorded is logged and skipped.
 */
export async function recordLookAlikeRuns(
  ctx: RequestContext,
  finding: LookAlikeFinding,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<readonly PhotoCheck[]> {
  const recorded: PhotoCheck[] = [];
  for (const photo of finding.compared) {
    const match = finding.matches.find((row) => row.photoId === photo.id);
    try {
      recorded.push(
        await data.photoChecks.record(ctx, {
          intakePhotoId: photo.id,
          checkKind: "look_alike",
          outcome: match === undefined ? "no_copy_found" : "copy_found",
          proposedFindings: [],
          catalogEntryId: null,
          catalogReferencePhotoId: null,
          matchedPhotoIds: match?.matchedPhotoIds ?? [],
          matchedBatteryRecordIds: match?.batteryRecordIds ?? [],
          errorCode: null,
          // A fixed function of the image, not a model call (D-75 #8).
          provider: null,
          modelIdentifier: null,
          promptVersion: null,
          costUsd: null,
          latencyMs: null,
          configurationVersion: finding.configurationVersion,
          at,
          attribution,
        }),
      );
    } catch (error) {
      console.error(
        `[photo-checks] a copy check run could not be recorded (correlationId=${ctx.correlationId})`,
        error,
      );
    }
  }
  return recorded;
}

/** Read the copy check and record its runs — the gate's paths. Never throws. */
export async function checkLookAlikes(
  ctx: RequestContext,
  session: IntakeSession,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<LookAlikeFinding> {
  try {
    const finding = await readLookAlikePhotos(ctx, session);
    await recordLookAlikeRuns(ctx, finding, at, attribution);
    return finding;
  } catch (error) {
    // The configuration could not be read, or a read failed: the check did
    // not run, and that is never a pass dressed as one — nothing routes on
    // it, and the error is logged with the correlation id.
    console.error(
      `[photo-checks] the copy check did not run (correlationId=${ctx.correlationId})`,
      error,
    );
    return {
      matches: [],
      records: [],
      compared: [],
      matchedPhotos: [],
      configurationVersion: "",
    };
  }
}
