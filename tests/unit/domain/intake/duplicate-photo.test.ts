import { describe, expect, it } from "vitest";

import {
  duplicateRecordIds,
  findDuplicatePhotos,
  type PhotoFingerprint,
} from "@/domain/intake/duplicate-photo";

/**
 * D-56 level 1, D-63 #5 — exact content-hash match against a photo on another
 * battery record in the organization. Same session, a crop, and a session
 * with no record are **not** matches.
 */

const HASH = "a".repeat(64);
const OTHER = "b".repeat(64);

function photo(patch: Partial<PhotoFingerprint>): PhotoFingerprint {
  return {
    photoId: "photo-new",
    intakeSessionId: "session-new",
    batteryRecordId: "record-new",
    contentHash: HASH,
    isCrop: false,
    ...patch,
  };
}

const SUBJECT = {
  intakeSessionId: "session-new",
  batteryRecordId: "record-new",
  photos: [photo({})],
} as const;

describe("findDuplicatePhotos", () => {
  it("matches a photo on another record, any status", () => {
    const matches = findDuplicatePhotos(SUBJECT, [
      photo({
        photoId: "photo-old",
        intakeSessionId: "session-old",
        batteryRecordId: "record-old",
      }),
    ]);
    expect(matches).toEqual([
      { photoId: "photo-new", batteryRecordIds: ["record-old"] },
    ]);
  });

  it("does not match the same session", () => {
    expect(
      findDuplicatePhotos(SUBJECT, [
        photo({ photoId: "photo-again", intakeSessionId: "session-new" }),
      ]),
    ).toEqual([]);
  });

  it("does not match a crop, on either side — a crop copies its parent's hash", () => {
    expect(
      findDuplicatePhotos(SUBJECT, [
        photo({
          photoId: "crop-old",
          intakeSessionId: "session-old",
          batteryRecordId: "record-old",
          isCrop: true,
        }),
      ]),
    ).toEqual([]);
    expect(
      findDuplicatePhotos({ ...SUBJECT, photos: [photo({ isCrop: true })] }, [
        photo({
          photoId: "photo-old",
          intakeSessionId: "session-old",
          batteryRecordId: "record-old",
        }),
      ]),
    ).toEqual([]);
  });

  it("does not match a session with no record", () => {
    expect(
      findDuplicatePhotos(SUBJECT, [
        photo({
          photoId: "photo-orphan",
          intakeSessionId: "session-orphan",
          batteryRecordId: null,
        }),
      ]),
    ).toEqual([]);
  });

  it("does not match different bytes", () => {
    expect(
      findDuplicatePhotos(SUBJECT, [
        photo({
          photoId: "photo-old",
          intakeSessionId: "session-old",
          batteryRecordId: "record-old",
          contentHash: OTHER,
        }),
      ]),
    ).toEqual([]);
  });

  it("names every other record, once each, in a stable order", () => {
    const matches = findDuplicatePhotos(SUBJECT, [
      photo({ photoId: "p2", intakeSessionId: "s2", batteryRecordId: "r-b" }),
      photo({ photoId: "p3", intakeSessionId: "s3", batteryRecordId: "r-a" }),
      photo({ photoId: "p4", intakeSessionId: "s4", batteryRecordId: "r-b" }),
    ]);
    expect(duplicateRecordIds(matches)).toEqual(["r-a", "r-b"]);
  });
});
