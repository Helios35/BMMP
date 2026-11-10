import { describe, expect, it } from "vitest";

import * as FIXTURES from "@/data/mock/fixtures";
import * as ID from "@/data/mock/fixtures/ids";
import { PLATFORM_LOOK_ALIKE_CONFIGURATION } from "@/data/mock/fixtures/platform-configuration";
import {
  fingerprintsLookAlike,
  validateLookAlikeConfiguration,
} from "@/domain/photo-checks/look-alike";
import {
  DAMAGE_PROPOSAL_SCHEMA_VERSION,
  isVisionProviderError,
  LABEL_LOOK_SCHEMA_VERSION,
  parseDamageProposalResult,
  parseLabelLookResult,
  parseLookFingerprint,
  type PhotoImage,
} from "@/lib/vision";
import {
  FIXTURE_COPY_TARGET_FINGERPRINT,
  FIXTURE_RESAVED_FINGERPRINT,
  fixtureFingerprint,
  fixtureProvider,
} from "@/lib/vision/providers/fixture";

/**
 * The three photo-check methods on the vision seam — `TECHNICAL_SPEC.md`
 * §12.2; Rules 2.36, 2.37, 6.25; D-75 #5. **No number and no model-written
 * words survive the schema**, and the fixture keys proposals and the look
 * check on the file name, the fingerprint on the bytes.
 */

function image(fileName: string | null, bytes = [1, 2, 3, 4]): PhotoImage {
  return {
    bytes: Uint8Array.from(bytes),
    mimeType: "image/png",
    width: 640,
    height: 480,
    fileName,
  };
}

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: DAMAGE_PROPOSAL_SCHEMA_VERSION,
    findings: ["swelling"],
    providerCode: "fixture",
    modelIdentifier: "m",
    promptVersion: "p",
    usage: null,
    ...overrides,
  };
}

function look(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: LABEL_LOOK_SCHEMA_VERSION,
    outcome: "looks_different",
    providerCode: "fixture",
    modelIdentifier: "m",
    promptVersion: "p",
    usage: null,
    ...overrides,
  };
}

function refusedAsMalformed(read: () => unknown): void {
  try {
    read();
  } catch (error) {
    expect(isVisionProviderError(error)).toBe(true);
    if (isVisionProviderError(error)) expect(error.code).toBe("malformed");
    return;
  }
  throw new Error("expected a malformed refusal");
}

describe("the damage-proposal schema (Rule 6.25)", () => {
  it("lets T-29 findings through, once each", () => {
    expect(
      parseDamageProposalResult(
        proposal({ findings: ["dent", "dent", "leakage"] }),
      ).findings,
    ).toEqual(["dent", "leakage"]);
  });

  it.each([
    ["none_observed — never a model's", { findings: ["none_observed"] }],
    ["a DDR flag", { findings: ["damaged"] }],
    ["defective", { findings: ["defective"] }],
    ["a number", { findings: [0.93] }],
    [
      "a severity beside the finding",
      { findings: [{ finding: "swelling", severity: 0.8 }] },
    ],
    ["free text", { notes: "the pack looks puffy on one side" }],
    ["a confidence", { confidence: 0.91 }],
    ["another schema version", { schemaVersion: "damage-proposal.v0" }],
  ])("refuses %s as malformed", (_label, overrides) => {
    refusedAsMalformed(() => parseDamageProposalResult(proposal(overrides)));
  });
});

describe("the label-look schema (Rule 2.36)", () => {
  it.each(["looks_consistent", "looks_different", "cannot_compare"])(
    "lets %s through",
    (outcome) => {
      expect(parseLabelLookResult(look({ outcome })).outcome).toBe(outcome);
    },
  );

  it.each([
    ["a similarity number", { similarity: 0.42 }],
    ["a number for the outcome", { outcome: 0.42 }],
    [
      "no_reference — the caller's, never the model's",
      { outcome: "no_reference" },
    ],
    ["an explanation", { reason: "the font is different" }],
  ])("refuses %s as malformed", (_label, overrides) => {
    refusedAsMalformed(() => parseLabelLookResult(look(overrides)));
  });
});

describe("the fingerprint (Rule 2.37)", () => {
  it("is <scheme>:<hex>, or malformed", () => {
    expect(parseLookFingerprint("fixture64:9e3c5a1f7b2d4c80")).toBe(
      "fixture64:9e3c5a1f7b2d4c80",
    );
    refusedAsMalformed(() => parseLookFingerprint(0.5));
    refusedAsMalformed(() => parseLookFingerprint("similar"));
  });
});

describe("the fixture's answers", () => {
  it("proposes two findings on damage-swelling.png, and nothing on every older image", async () => {
    expect(
      (
        await fixtureProvider.proposeDamageFindings(
          image("damage-swelling.png"),
        )
      ).findings,
    ).toEqual(["swelling", "surface_marking"]);
    for (const name of [
      "damage.png",
      "whole-pack.png",
      "label-clean.png",
      null,
    ]) {
      expect(
        (await fixtureProvider.proposeDamageFindings(image(name))).findings,
      ).toEqual([]);
    }
  });

  it("is unavailable for damage-unavailable.png (Rule 6.26)", async () => {
    await expect(
      fixtureProvider.proposeDamageFindings(image("damage-unavailable.png")),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("looks different only for label-different.png; every older image looks like the reference", async () => {
    const reference = image("reference.png");
    const outcome = async (name: string | null) =>
      (
        await fixtureProvider.compareLabelToReference({
          photo: image(name),
          reference,
        })
      ).outcome;
    expect(await outcome("label-different.png")).toBe("looks_different");
    expect(await outcome("label-uncomparable.png")).toBe("cannot_compare");
    for (const name of [
      "label-clean.png",
      "label-mismatch.png",
      "label-scooter.png",
      null,
    ]) {
      expect(await outcome(name)).toBe("looks_consistent");
    }
    await expect(
      fixtureProvider.compareLabelToReference({
        photo: image("label-lookfail.png"),
        reference,
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("fingerprints from the bytes, never the name — so byte-unique uploads of one image never collide", () => {
    const a = fixtureFingerprint(image("label-clean.png", [1, 2, 3, 4]));
    const sameBytesOtherName = fixtureFingerprint(
      image("label-low.png", [1, 2, 3, 4]),
    );
    const otherBytes = fixtureFingerprint(
      image("label-clean.png", [1, 2, 3, 5]),
    );
    expect(a).toBe(sameBytesOtherName);
    expect(a).not.toBe(otherBytes);
    expect(parseLookFingerprint(a)).toBe(a);
  });

  it("gives label-resaved.png a fingerprint close to the seeded copy target's, under the platform's closeness", () => {
    const validation = validateLookAlikeConfiguration(
      PLATFORM_LOOK_ALIKE_CONFIGURATION,
    );
    if (!validation.ok) throw new Error("the platform row must validate");
    expect(fixtureFingerprint(image("label-resaved.png"))).toBe(
      FIXTURE_RESAVED_FINGERPRINT,
    );
    expect(FIXTURE_RESAVED_FINGERPRINT).not.toBe(
      FIXTURE_COPY_TARGET_FINGERPRINT,
    );
    expect(
      fingerprintsLookAlike(
        FIXTURE_RESAVED_FINGERPRINT,
        FIXTURE_COPY_TARGET_FINGERPRINT,
        validation.configuration,
      ),
    ).toBe(true);
    // …and the seeded copy target carries exactly that fingerprint.
    const target = FIXTURES.intakePhotos.find(
      (photo) => photo.id === ID.PHOTO.copyTargetOriginal,
    );
    expect(target?.lookFingerprint).toBe(FIXTURE_COPY_TARGET_FINGERPRINT);
  });
});
