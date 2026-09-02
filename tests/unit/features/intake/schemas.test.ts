import { describe, expect, it } from "vitest";

import { INTAKE_PHOTO_TYPES } from "@/domain/taxonomy/intake-photo-type";
import { LABEL_FIELD_CODES } from "@/domain/taxonomy/label-field-code";
import {
  advanceToStepSchema,
  CAPTURED_PHOTO_TYPES,
  confirmFieldSchema,
  cropGeometrySchema,
  enterChemistrySchema,
  enterManufacturedOnSchema,
  firstIssue,
  intakePhotoUploadSchema,
  proposeCatalogEntrySchema,
  setConditionSchema,
  setSourceDeviceSchema,
  setStateOfChargeSchema,
  startIntakeSessionSchema,
  voidIntakeSessionSchema,
} from "@/features/intake/schemas";

/**
 * The intake input schemas — `TECHNICAL_SPEC.md` §7.1 step 3.
 *
 * Every enumerated field is checked against its taxonomy module and refuses
 * anything else; every quantity is a decimal string, never a number; and
 * the two values the reducers refuse — `unknown` as an entered chemistry and
 * `label_crop` as an uploaded photo type — are refused here first.
 */

const SESSION = "0a00000a-0000-4000-8000-000000000003";
const ENTRY = "0a000008-0000-4000-8000-000000000001";

describe("ids and sessions", () => {
  it("accepts a uuid session id and refuses anything else", () => {
    expect(
      advanceToStepSchema.safeParse({ sessionId: SESSION, step: "capture" })
        .success,
    ).toBe(true);
    expect(
      advanceToStepSchema.safeParse({ sessionId: "session-1", step: "capture" })
        .success,
    ).toBe(false);
  });

  it("lets a session start beside a container, or beside none", () => {
    expect(startIntakeSessionSchema.safeParse({}).success).toBe(true);
    expect(
      startIntakeSessionSchema.safeParse({ containerId: null }).success,
    ).toBe(true);
    expect(
      startIntakeSessionSchema.safeParse({ containerId: ENTRY }).success,
    ).toBe(true);
    expect(
      startIntakeSessionSchema.safeParse({ containerId: "drum" }).success,
    ).toBe(false);
  });

  it("only knows the three flow steps — `complete` is a terminal state, not a request", () => {
    for (const step of ["capture", "extraction_review", "confirm_and_place"]) {
      expect(
        advanceToStepSchema.safeParse({ sessionId: SESSION, step }).success,
      ).toBe(true);
    }
    expect(
      advanceToStepSchema.safeParse({ sessionId: SESSION, step: "complete" })
        .success,
    ).toBe(false);
  });
});

describe("the review card", () => {
  it("accepts every T-09 field code and refuses a free-text key", () => {
    for (const fieldCode of LABEL_FIELD_CODES) {
      expect(
        confirmFieldSchema.safeParse({
          sessionId: SESSION,
          fieldCode,
          value: null,
        }).success,
        fieldCode,
      ).toBe(true);
    }
    expect(
      confirmFieldSchema.safeParse({
        sessionId: SESSION,
        fieldCode: "colour",
        value: "red",
      }).success,
    ).toBe(false);
  });

  it("refuses `unknown` as an entered chemistry — it is the absence of one (T-01, Rule 2.10)", () => {
    expect(
      enterChemistrySchema.safeParse({
        sessionId: SESSION,
        chemistry: "li_nmc",
      }).success,
    ).toBe(true);
    const refused = enterChemistrySchema.safeParse({
      sessionId: SESSION,
      chemistry: "unknown",
    });
    expect(refused.success).toBe(false);
    if (!refused.success) {
      expect(firstIssue(refused.error).field).toBe("chemistry");
      expect(firstIssue(refused.error).message).toMatch(/absence of one/);
    }
    expect(
      enterChemistrySchema.safeParse({
        sessionId: SESSION,
        chemistry: "plutonium",
      }).success,
    ).toBe(false);
  });

  it("requires a stated reason to void (Rule 2.23)", () => {
    expect(
      voidIntakeSessionSchema.safeParse({ sessionId: SESSION, reason: "  " })
        .success,
    ).toBe(false);
    const ok = voidIntakeSessionSchema.safeParse({
      sessionId: SESSION,
      reason: "  Duplicate of BR-0002 ",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.reason).toBe("Duplicate of BR-0002");
  });
});

describe("the crop box", () => {
  const frame = { sourceWidth: 640, sourceHeight: 480 };

  it("accepts a whole-pixel box inside the frame", () => {
    expect(
      cropGeometrySchema.safeParse({
        x: 10,
        y: 20,
        width: 300,
        height: 200,
        ...frame,
      }).success,
    ).toBe(true);
  });

  it("refuses a box that runs past the frame, a fractional pixel, or no area", () => {
    expect(
      cropGeometrySchema.safeParse({
        x: 400,
        y: 20,
        width: 300,
        height: 200,
        ...frame,
      }).success,
    ).toBe(false);
    expect(
      cropGeometrySchema.safeParse({
        x: 1.5,
        y: 20,
        width: 300,
        height: 200,
        ...frame,
      }).success,
    ).toBe(false);
    expect(
      cropGeometrySchema.safeParse({
        x: 0,
        y: 0,
        width: 0,
        height: 200,
        ...frame,
      }).success,
    ).toBe(false);
  });
});

describe("step 3", () => {
  it("takes T-29 findings only, at least one, with the defective flag stated", () => {
    expect(
      setConditionSchema.safeParse({
        sessionId: SESSION,
        findingTypes: ["none_observed"],
        isDefective: false,
      }).success,
    ).toBe(true);
    expect(
      setConditionSchema.safeParse({
        sessionId: SESSION,
        findingTypes: [],
        isDefective: false,
      }).success,
    ).toBe(false);
    expect(
      setConditionSchema.safeParse({
        sessionId: SESSION,
        findingTypes: ["rusty"],
        isDefective: false,
      }).success,
    ).toBe(false);
    expect(
      setConditionSchema.safeParse({
        sessionId: SESSION,
        findingTypes: ["swelling"],
      }).success,
    ).toBe(false);
  });

  it("carries the state-of-charge figure as a decimal string, never a number (§0.8)", () => {
    const base = {
      sessionId: SESSION,
      band: "at_or_below_storage_limit",
      source: "handheld_meter",
    };
    expect(
      setStateOfChargeSchema.safeParse({ ...base, percent: "27.5" }).success,
    ).toBe(true);
    expect(
      setStateOfChargeSchema.safeParse({ ...base, percent: null }).success,
    ).toBe(true);
    expect(
      setStateOfChargeSchema.safeParse({ ...base, percent: 27.5 }).success,
    ).toBe(false);
    expect(
      setStateOfChargeSchema.safeParse({ ...base, percent: "about a quarter" })
        .success,
    ).toBe(false);
    expect(
      setStateOfChargeSchema.safeParse({ ...base, band: "full", percent: null })
        .success,
    ).toBe(false);
  });

  it("takes a T-11 provenance type and a four-digit model year, or clears the device", () => {
    const device = {
      type: "power_wheelchair",
      identifier: "WC-1",
      make: null,
      model: null,
      modelYear: 2019,
      provenanceSourceType: "device_serial",
    };
    expect(
      setSourceDeviceSchema.safeParse({
        sessionId: SESSION,
        sourceDevice: device,
      }).success,
    ).toBe(true);
    expect(
      setSourceDeviceSchema.safeParse({
        sessionId: SESSION,
        sourceDevice: null,
      }).success,
    ).toBe(true);
    expect(
      setSourceDeviceSchema.safeParse({
        sessionId: SESSION,
        sourceDevice: { ...device, modelYear: 19 },
      }).success,
    ).toBe(false);
    expect(
      setSourceDeviceSchema.safeParse({
        sessionId: SESSION,
        sourceDevice: { ...device, provenanceSourceType: "guess" },
      }).success,
    ).toBe(false);
  });

  it("takes a manufacture date as YYYY-MM-DD or nothing (Rule 2.24)", () => {
    expect(
      enterManufacturedOnSchema.safeParse({
        sessionId: SESSION,
        manufacturedOn: "2021-11-01",
      }).success,
    ).toBe(true);
    expect(
      enterManufacturedOnSchema.safeParse({
        sessionId: SESSION,
        manufacturedOn: null,
      }).success,
    ).toBe(true);
    expect(
      enterManufacturedOnSchema.safeParse({
        sessionId: SESSION,
        manufacturedOn: "Nov 2021",
      }).success,
    ).toBe(false);
  });
});

describe("a catalog proposal", () => {
  it("needs a manufacturer and a real chemistry, and takes figures as digits", () => {
    const proposal = {
      sessionId: SESSION,
      manufacturerName: "Kestrel Power",
      modelName: "KP-48V30",
      partNumber: "KP-48V30-LFP",
      chemistry: "li_lfp",
      applicationClass: "small_mobility",
      nominalVoltageV: "48.000",
      ratedCapacityAh: "30.000",
      ratedEnergyWh: "1440.000",
    };
    expect(proposeCatalogEntrySchema.safeParse(proposal).success).toBe(true);
    expect(
      proposeCatalogEntrySchema.safeParse({
        ...proposal,
        manufacturerName: " ",
      }).success,
    ).toBe(false);
    expect(
      proposeCatalogEntrySchema.safeParse({ ...proposal, chemistry: "unknown" })
        .success,
    ).toBe(false);
    expect(
      proposeCatalogEntrySchema.safeParse({ ...proposal, nominalVoltageV: 48 })
        .success,
    ).toBe(false);
  });
});

describe("the upload", () => {
  it("accepts every captured T-50 type and refuses `label_crop`, which only the pipeline writes", () => {
    expect(CAPTURED_PHOTO_TYPES).toEqual(
      INTAKE_PHOTO_TYPES.filter((type) => type !== "label_crop"),
    );
    for (const photoType of CAPTURED_PHOTO_TYPES) {
      expect(
        intakePhotoUploadSchema.safeParse({
          intakeSessionId: SESSION,
          photoType,
        }).success,
        photoType,
      ).toBe(true);
    }
    expect(
      intakePhotoUploadSchema.safeParse({
        intakeSessionId: SESSION,
        photoType: "label_crop",
      }).success,
    ).toBe(false);
    expect(
      intakePhotoUploadSchema.safeParse({
        intakeSessionId: SESSION,
        photoType: "selfie",
      }).success,
    ).toBe(false);
  });

  it("takes an optional capture instant as an ISO timestamp with a zone", () => {
    expect(
      intakePhotoUploadSchema.safeParse({
        intakeSessionId: SESSION,
        photoType: "label",
        capturedAt: "2026-09-02T14:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      intakePhotoUploadSchema.safeParse({
        intakeSessionId: SESSION,
        photoType: "label",
        capturedAt: "yesterday",
      }).success,
    ).toBe(false);
  });
});

describe("firstIssue", () => {
  it("names the field and the message of the first issue only", () => {
    const parsed = setConditionSchema.safeParse({
      sessionId: "nope",
      findingTypes: [],
      isDefective: "yes",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = firstIssue(parsed.error);
    expect(issue.field).toBe("sessionId");
    expect(issue.message.length).toBeGreaterThan(0);
  });
});
