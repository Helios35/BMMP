import { describe, expect, it } from "vitest";

import {
  findLookAlikePhotos,
  fingerprintsLookAlike,
  isLookFingerprint,
  lookAlikeRecordIds,
  validateLookAlikeConfiguration,
  type LookAlikeConfiguration,
  type LookAlikePhoto,
} from "@/domain/photo-checks/look-alike";

/**
 * Rule 2.37; D-63 #5, D-75 #7, #8 — a re-saved or edited copy is a reason to
 * look; closeness is configuration; the exact check's exclusions hold; an
 * exact copy is the exact check's alone; no number leaves.
 */

const CONFIGURATION: LookAlikeConfiguration = {
  configurationVersion: "look-alike-test",
  fingerprintScheme: "fixture64",
  maxDifferingBits: 6,
};

function photo(
  patch: Partial<LookAlikePhoto> & Pick<LookAlikePhoto, "photoId">,
): LookAlikePhoto {
  return {
    intakeSessionId: "session-subject",
    batteryRecordId: "record-subject",
    contentHash: `hash-${patch.photoId}`,
    lookFingerprint: "fixture64:0000000000000000",
    isCrop: false,
    ...patch,
  };
}

const SUBJECT = {
  intakeSessionId: "session-subject",
  batteryRecordId: "record-subject",
  photos: [photo({ photoId: "subject-photo" })],
} as const;

function candidate(patch: Partial<LookAlikePhoto> = {}): LookAlikePhoto {
  return photo({
    photoId: "other-photo",
    intakeSessionId: "session-other",
    batteryRecordId: "record-other",
    // Two bits away from the subject's.
    lookFingerprint: "fixture64:0000000000000003",
    ...patch,
  });
}

describe("closeness is configuration (D-40), and only a boolean leaves", () => {
  it("looks alike within the configured bits, of the configured scheme", () => {
    expect(
      fingerprintsLookAlike(
        "fixture64:0000000000000000",
        "fixture64:0000000000000003",
        CONFIGURATION,
      ),
    ).toBe(true);
    expect(
      fingerprintsLookAlike(
        "fixture64:0000000000000000",
        "fixture64:00000000000000ff",
        CONFIGURATION,
      ),
    ).toBe(false);
    expect(
      fingerprintsLookAlike(
        "fixture64:0000000000000000",
        "fixture64:00000000000000ff",
        {
          ...CONFIGURATION,
          maxDifferingBits: 8,
        },
      ),
    ).toBe(true);
  });

  it("never compares another scheme, another length, or something that is not a fingerprint", () => {
    expect(
      fingerprintsLookAlike(
        "other64:0000000000000000",
        "other64:0000000000000000",
        CONFIGURATION,
      ),
    ).toBe(false);
    expect(
      fingerprintsLookAlike(
        "fixture64:00000000",
        "fixture64:0000000000000000",
        CONFIGURATION,
      ),
    ).toBe(false);
    expect(isLookFingerprint("not a fingerprint")).toBe(false);
    expect(isLookFingerprint("fixture64:9e3c5a1f7b2d4c80")).toBe(true);
  });

  it("refuses a malformed configuration rather than defaulting", () => {
    expect(validateLookAlikeConfiguration(null).ok).toBe(false);
    expect(
      validateLookAlikeConfiguration({ ...CONFIGURATION, maxDifferingBits: -1 })
        .ok,
    ).toBe(false);
    expect(
      validateLookAlikeConfiguration({
        ...CONFIGURATION,
        maxDifferingBits: 1.5,
      }).ok,
    ).toBe(false);
    expect(
      validateLookAlikeConfiguration({
        ...CONFIGURATION,
        fingerprintScheme: "",
      }).ok,
    ).toBe(false);
    expect(validateLookAlikeConfiguration(CONFIGURATION)).toEqual({
      ok: true,
      configuration: CONFIGURATION,
    });
  });
});

describe("findLookAlikePhotos (Rule 2.37)", () => {
  it("names the other record a close photo is on", () => {
    const matches = findLookAlikePhotos(SUBJECT, [candidate()], CONFIGURATION);
    expect(matches).toEqual([
      {
        photoId: "subject-photo",
        matchedPhotoIds: ["other-photo"],
        batteryRecordIds: ["record-other"],
      },
    ]);
    expect(lookAlikeRecordIds(matches)).toEqual(["record-other"]);
  });

  it("reports an exact copy once, as the exact check's — never also a look-alike", () => {
    const exact = candidate({ contentHash: "hash-subject-photo" });
    expect(findLookAlikePhotos(SUBJECT, [exact], CONFIGURATION)).toEqual([]);
  });

  it.each([
    ["the same session", { intakeSessionId: "session-subject" }],
    ["a crop", { isCrop: true }],
    ["a session with no record", { batteryRecordId: null }],
    ["the subject's own record", { batteryRecordId: "record-subject" }],
    ["a photo with no fingerprint", { lookFingerprint: null }],
  ] as const)("excludes %s (D-63 #5)", (_label, patch) => {
    expect(
      findLookAlikePhotos(SUBJECT, [candidate(patch)], CONFIGURATION),
    ).toEqual([]);
  });

  it("never compares a subject photo with no fingerprint, or a subject crop", () => {
    const subject = {
      ...SUBJECT,
      photos: [
        photo({ photoId: "no-fingerprint", lookFingerprint: null }),
        photo({ photoId: "a-crop", isCrop: true }),
      ],
    };
    expect(findLookAlikePhotos(subject, [candidate()], CONFIGURATION)).toEqual(
      [],
    );
  });

  it("returns photos and records, and no number of any kind", () => {
    const [match] = findLookAlikePhotos(SUBJECT, [candidate()], CONFIGURATION);
    expect(JSON.stringify(match)).not.toMatch(
      /\d+\.\d+|"distance"|"score"|"similarity"/,
    );
  });
});
