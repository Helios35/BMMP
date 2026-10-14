/**
 * The duplicate-photo check — D-56 level 1, D-63 #5; T-52 `duplicate_photo`;
 * Rules 2.14, 1.25.
 *
 * **Exact content-hash match, inside the organization, against a photo on any
 * other battery record.** A photo already used on another record is a reason
 * for a person to look before confirming — **never a verdict**: it blocks
 * nothing on its own, carries no score and no probability, and the person
 * decides (D-56 "Never"). The whole record routes to review (Rule 2.14).
 *
 * What is **not** a match, by D-63 #5:
 *
 * - **the same session** — a person re-sending their own photo is not a
 *   second battery;
 * - **a crop** — a label crop copies its parent's hash (the parent is the
 *   photo; the crop is a view of it), on either side of the comparison;
 * - **a session with no record** — nothing to send the reviewer to;
 * - the subject's own record, however it was reached.
 *
 * Re-saved or edited copies are not caught: the hash is of the stored bytes.
 * That is D-56 level 2, later. **There is no input that turns the check off** —
 * no flag, no role, no setting.
 *
 * Pure. The caller reads the photos and their sessions through `src/data` and
 * hands them in.
 */

export interface PhotoFingerprint {
  readonly photoId: string;
  readonly intakeSessionId: string;
  /** The session's battery record. `null` for a session that never had one. */
  readonly batteryRecordId: string | null;
  readonly contentHash: string;
  /** Non-null `parentIntakePhotoId`. */
  readonly isCrop: boolean;
}

export interface DuplicatePhotoSubject {
  readonly intakeSessionId: string;
  readonly batteryRecordId: string | null;
  /** The session's own photos. Crops among them are ignored. */
  readonly photos: readonly PhotoFingerprint[];
}

export interface DuplicatePhotoMatch {
  /** The subject's photo that is already on another record. */
  readonly photoId: string;
  /** Every other record carrying the same bytes, in a stable order. */
  readonly batteryRecordIds: readonly string[];
}

/**
 * The subject's photos that already sit on another battery record, each with
 * the records they sit on. Empty means no duplicate.
 *
 * `candidates` is every photo in the organization sharing a hash with one of
 * the subject's; the subject's own rows may be among them and are excluded
 * here, not by the caller.
 */
export function findDuplicatePhotos(
  subject: DuplicatePhotoSubject,
  candidates: readonly PhotoFingerprint[],
): readonly DuplicatePhotoMatch[] {
  const matches: DuplicatePhotoMatch[] = [];
  for (const photo of subject.photos) {
    if (photo.isCrop) continue;
    const records = new Set<string>();
    for (const candidate of candidates) {
      if (candidate.isCrop) continue;
      if (candidate.contentHash !== photo.contentHash) continue;
      if (candidate.intakeSessionId === subject.intakeSessionId) continue;
      if (candidate.batteryRecordId === null) continue;
      if (candidate.batteryRecordId === subject.batteryRecordId) continue;
      records.add(candidate.batteryRecordId);
    }
    if (records.size > 0) {
      matches.push({
        photoId: photo.photoId,
        batteryRecordIds: [...records].sort(),
      });
    }
  }
  return matches;
}

/** Every distinct record the matches point at, in a stable order. */
export function duplicateRecordIds(
  matches: readonly DuplicatePhotoMatch[],
): readonly string[] {
  return [
    ...new Set(matches.flatMap((match) => match.batteryRecordIds)),
  ].sort();
}
