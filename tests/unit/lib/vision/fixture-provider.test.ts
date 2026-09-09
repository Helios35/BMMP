import { describe, expect, it } from "vitest";
import {
  LABEL_FIELD_KEYS,
  VisionProviderError,
  isVisionProviderError,
  parseLabelExtractionResult,
  type ExtractionRequest,
  type LabelFieldKey,
  type RegionRequest,
} from "@/lib/vision";
import {
  FIXTURE_SCENARIOS,
  fixtureProvider,
  scaleReferenceBox,
  scenarioForFileName,
} from "@/lib/vision/providers/fixture";
import { HARD_GATED_LABEL_FIELD_CODES } from "@/domain/taxonomy/label-field-code";

const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function region(
  fileName: string | null,
  width = 640,
  height = 480,
): RegionRequest {
  return { bytes: BYTES, mimeType: "image/png", width, height, fileName };
}

function extraction(
  fileName: string | null,
  requestedFields: readonly LabelFieldKey[] = LABEL_FIELD_KEYS,
): ExtractionRequest {
  return {
    bytes: BYTES,
    mimeType: "image/png",
    width: 640,
    height: 480,
    fileName,
    requestedFields,
  };
}

describe("scenarioForFileName", () => {
  it.each([
    ["label-clean.png", "clean"],
    ["label-low.png", "low"],
    ["label-nomatch.png", "nomatch"],
    ["label-unreadable.png", "unreadable"],
    ["label-fail.png", "fail"],
    ["label-manualcrop.png", "manualcrop"],
    ["label-scooter.png", "scooter"],
  ])("%s → %s", (fileName, scenario) => {
    expect(scenarioForFileName(fileName)).toBe(scenario);
  });

  it("keys on the last hyphen-separated token of the stem, case-insensitively", () => {
    expect(scenarioForFileName("IMG-2026-09-01-LOW.JPG")).toBe("low");
    expect(scenarioForFileName("a-b-c-Scooter.webp")).toBe("scooter");
  });

  it("ignores any directory in the name", () => {
    expect(scenarioForFileName("uploads/2026/label-fail.png")).toBe("fail");
    expect(scenarioForFileName("C:\\photos\\label-nomatch.png")).toBe(
      "nomatch",
    );
  });

  it("defaults to clean for no name, no scenario token, or a token it does not know", () => {
    expect(scenarioForFileName(null)).toBe("clean");
    expect(scenarioForFileName("whole-pack.png")).toBe("clean");
    expect(scenarioForFileName("damage.png")).toBe("clean");
    expect(scenarioForFileName("photo.jpg")).toBe("clean");
    expect(scenarioForFileName("label-.png")).toBe("clean");
    expect(scenarioForFileName("")).toBe("clean");
  });
});

describe("fixtureProvider.detectLabelRegion", () => {
  it("returns a box scaled to the request's own dimensions", async () => {
    const at640 = await fixtureProvider.detectLabelRegion(
      region("label-clean.png"),
    );
    const at2048 = await fixtureProvider.detectLabelRegion(
      region("label-clean.png", 2048, 1536),
    );
    expect(at2048?.box).toEqual({ x: 604, y: 512, width: 812, height: 384 });
    expect(at640?.box).toEqual(scaleReferenceBox(640, 480));
    expect(at640?.box).toEqual({ x: 189, y: 160, width: 254, height: 120 });
    expect(at640?.confidence).toBe(0.94);
  });

  it("keeps the box inside the image whatever the size", async () => {
    for (const [width, height] of [
      [640, 480],
      [1024, 768],
      [3000, 2000],
      [200, 900],
    ] as const) {
      const detected = await fixtureProvider.detectLabelRegion(
        region("label-clean.png", width, height),
      );
      expect(detected).not.toBeNull();
      const box = detected!.box;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(Number.isInteger(box.x) && Number.isInteger(box.width)).toBe(true);
    }
  });

  it("returns null for the manual-crop scenario, so a person draws the box", async () => {
    expect(
      await fixtureProvider.detectLabelRegion(region("label-manualcrop.png")),
    ).toBeNull();
  });

  it("still detects a region for the scenario whose extraction fails", async () => {
    expect(
      await fixtureProvider.detectLabelRegion(region("label-fail.png")),
    ).not.toBeNull();
  });
});

describe("fixtureProvider.extractLabelFields", () => {
  it("is deterministic: two reads of the same file are equal", async () => {
    const a = await fixtureProvider.extractLabelFields(
      extraction("label-low.png"),
    );
    const b = await fixtureProvider.extractLabelFields(
      extraction("label-low.png"),
    );
    expect(a).toEqual(b);
  });

  it("answers every T-09 key, and the schema accepts every scenario that returns", async () => {
    for (const scenario of FIXTURE_SCENARIOS) {
      if (scenario === "fail") continue;
      const result = await fixtureProvider.extractLabelFields(
        extraction(`label-${scenario}.png`),
      );
      expect(Object.keys(result.fields).sort()).toEqual(
        [...LABEL_FIELD_KEYS].sort(),
      );
      expect(() =>
        parseLabelExtractionResult(result, LABEL_FIELD_KEYS),
      ).not.toThrow();
      expect(result.schemaVersion).toBe("label-extraction.v1");
      expect(result.providerCode).toBe("fixture");
      expect(result.modelIdentifier).toBe("fixture-label-reader");
      expect(result.promptVersion).toBe("2026-08-01");
      expect(result.usage).toBeNull();
      expect(result.rawResponse).toBe(result.fields);
    }
  });

  it("clean mirrors the mock database's completed vehicle intake", async () => {
    const { fields } = await fixtureProvider.extractLabelFields(
      extraction("label-clean.png"),
    );
    expect(fields.manufacturer.value).toBe("Northvale Cell Systems");
    expect(fields.model.value).toBe("NV-TP400-96S");
    expect(fields.chemistry_code.value).toBe("Li-ion NMC");
    expect(fields.voltage.value).toBe("355.2 V");
    expect(fields.capacity_ah.value).toBe("220 Ah");
    expect(fields.energy_wh.value).toBe("78100 Wh");
    expect(fields.date_code.value).toBe("2144");
    expect(fields.serial_number.value).toBe("NVTP4000000091447");
    expect(fields.certification_marks.value).toBe("UN38.3, CE");
    expect(fields.transport_test_marking.value).toBe("present");
    expect(fields.manufacturer.evidence?.rawText).toBe(
      "NORTHVALE CELL SYSTEMS",
    );
    expect(fields.voltage.evidence?.rawText).toBe("355.2V");
  });

  it("clean and the default read the same; whole-pack and damage read as clean", async () => {
    const clean = await fixtureProvider.extractLabelFields(
      extraction("label-clean.png"),
    );
    for (const name of [null, "whole-pack.png", "damage.png", "IMG_0001.jpg"]) {
      const other = await fixtureProvider.extractLabelFields(extraction(name));
      expect(other.fields).toEqual(clean.fields);
    }
  });

  it("low: the model line reads through a scuff with a low score, the serial too", async () => {
    const { fields } = await fixtureProvider.extractLabelFields(
      extraction("label-low.png"),
    );
    expect(fields.model.value).toBe("NV-TP4OO-96S");
    expect(fields.model.confidence).toBe(0.52);
    expect(fields.serial_number.confidence).toBe(0.61);
    expect(fields.manufacturer.value).toBe("Northvale Cell Systems");
  });

  it("nomatch: a pack no catalog entry describes, read cleanly", async () => {
    const { fields } = await fixtureProvider.extractLabelFields(
      extraction("label-nomatch.png"),
    );
    expect(fields.manufacturer.value).toBe("Kestrel Power");
    expect(fields.model.value).toBe("KP-48V30-LFP");
    expect(fields.chemistry_code.value).toBe("LiFePO4");
    expect(fields.voltage.value).toBe("48 V");
    expect(fields.capacity_ah.value).toBe("30 Ah");
    expect(fields.energy_wh.value).toBe("1440 Wh");
  });

  it("scooter: the mobility-device pack the fixtures carry", async () => {
    const { fields } = await fixtureProvider.extractLabelFields(
      extraction("label-scooter.png"),
    );
    expect(fields.model.value).toBe("RM-24V50-AGM");
    expect(fields.chemistry_code.value).toBe("Sealed lead-acid");
    expect(fields.voltage.value).toBe("24 V");
    expect(fields.capacity_ah.value).toBe("50 Ah");
    expect(fields.energy_wh.value).toBe("1200 Wh");
    expect(fields.date_code.value).toBe("0322");
  });

  it("unreadable: every field null, the reported characters kept on the model line", async () => {
    const { fields } = await fixtureProvider.extractLabelFields(
      extraction("label-unreadable.png"),
    );
    for (const key of LABEL_FIELD_KEYS) {
      expect(fields[key].value, key).toBeNull();
      expect(fields[key].confidence, key).toBe(0);
    }
    expect(fields.model.evidence?.rawText).toBe("▮▮▮");
  });

  it("never proposes assessed_condition — a person sets it", async () => {
    for (const scenario of FIXTURE_SCENARIOS) {
      if (scenario === "fail") continue;
      const { fields } = await fixtureProvider.extractLabelFields(
        extraction(`label-${scenario}.png`),
      );
      expect(fields.assessed_condition.value, scenario).toBeNull();
      expect(fields.assessed_condition.confidence, scenario).toBe(0);
    }
    expect(HARD_GATED_LABEL_FIELD_CODES).toContain("assessed_condition");
  });

  it("answers only what was requested: an unrequested key comes back unread", async () => {
    const requested: readonly LabelFieldKey[] = ["manufacturer", "model"];
    const result = await fixtureProvider.extractLabelFields(
      extraction("label-clean.png", requested),
    );
    expect(result.fields.manufacturer.value).toBe("Northvale Cell Systems");
    expect(result.fields.model.value).toBe("NV-TP400-96S");
    for (const key of LABEL_FIELD_KEYS) {
      if (requested.includes(key)) continue;
      expect(result.fields[key].value, key).toBeNull();
    }
    expect(() => parseLabelExtractionResult(result, requested)).not.toThrow();
  });

  it("fail: throws an unavailable VisionProviderError, marked retryable", async () => {
    const attempt = fixtureProvider.extractLabelFields(
      extraction("label-fail.png"),
    );
    await expect(attempt).rejects.toBeInstanceOf(VisionProviderError);
    await attempt.catch((error: unknown) => {
      expect(isVisionProviderError(error)).toBe(true);
      if (isVisionProviderError(error)) {
        expect(error.code).toBe("unavailable");
        expect(error.retryable).toBe(true);
        expect(error.name).toBe("VisionProviderError");
      }
    });
  });

  it("manualcrop: extraction reads clean once a person has drawn the box", async () => {
    const clean = await fixtureProvider.extractLabelFields(
      extraction("label-clean.png"),
    );
    const manual = await fixtureProvider.extractLabelFields(
      extraction("label-manualcrop.png"),
    );
    expect(manual.fields).toEqual(clean.fields);
  });
});

describe("VisionProviderError", () => {
  it("derives retryable from the code and lets a caller override it", () => {
    expect(new VisionProviderError("timeout", "t").retryable).toBe(true);
    expect(new VisionProviderError("rate_limited", "r").retryable).toBe(true);
    expect(new VisionProviderError("unavailable", "u").retryable).toBe(true);
    expect(new VisionProviderError("malformed", "m").retryable).toBe(false);
    expect(
      new VisionProviderError("unavailable", "u", { retryable: false })
        .retryable,
    ).toBe(false);
  });
});
