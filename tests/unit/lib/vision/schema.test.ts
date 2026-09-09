import { describe, expect, it } from "vitest";
import {
  LABEL_FIELD_KEYS,
  VisionProviderError,
  labelExtractionResultSchema,
  parseLabelExtractionResult,
  type LabelFieldKey,
} from "@/lib/vision";

/**
 * The schema is one third of T-09's mitigation for a fabricating model, beside
 * per-field confidence and the human gate. Every refusal here is a value that
 * would otherwise have reached a reviewer looking like a read.
 */
function unread() {
  return { value: null, confidence: 0 };
}

function fields(overrides: Partial<Record<LabelFieldKey, unknown>> = {}) {
  return Object.fromEntries(
    LABEL_FIELD_KEYS.map((key) => [key, overrides[key] ?? unread()]),
  );
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "label-extraction.v1",
    fields: fields({
      manufacturer: {
        value: "Northvale Cell Systems",
        confidence: 0.97,
        evidence: { rawText: "NORTHVALE CELL SYSTEMS" },
      },
      voltage: {
        value: "355.2 V",
        confidence: 0.95,
        evidence: { boundingBox: [10, 20, 100, 30], rawText: "355.2V" },
      },
    }),
    providerCode: "fixture",
    modelIdentifier: "fixture-label-reader",
    promptVersion: "2026-08-01",
    rawResponse: { anything: true },
    ...overrides,
  };
}

describe("labelExtractionResultSchema", () => {
  it("accepts a well-formed response, with or without usage", () => {
    expect(labelExtractionResultSchema.safeParse(response()).success).toBe(
      true,
    );
    expect(
      labelExtractionResultSchema.safeParse(response({ usage: null })).success,
    ).toBe(true);
    expect(
      labelExtractionResultSchema.safeParse(
        response({
          usage: { inputTokens: 10, outputTokens: 4, costUsd: 0.001 },
        }),
      ).success,
    ).toBe(true);
  });

  it("refuses a schema version it does not know", () => {
    expect(
      labelExtractionResultSchema.safeParse(
        response({ schemaVersion: "label-extraction.v2" }),
      ).success,
    ).toBe(false);
  });

  it("refuses a confidence outside 0..1, or one that is not a number", () => {
    for (const confidence of [
      -0.01,
      1.01,
      2,
      Number.NaN,
      "0.9",
      null,
      undefined,
    ]) {
      const parsed = labelExtractionResultSchema.safeParse(
        response({ fields: fields({ model: { value: "X", confidence } }) }),
      );
      expect(parsed.success, String(confidence)).toBe(false);
    }
    for (const confidence of [0, 1, 0.5]) {
      const parsed = labelExtractionResultSchema.safeParse(
        response({ fields: fields({ model: { value: "X", confidence } }) }),
      );
      expect(parsed.success, String(confidence)).toBe(true);
    }
  });

  it("refuses a value that is not a string or null", () => {
    for (const value of [355.2, true, { text: "355.2 V" }, ["355.2 V"]]) {
      const parsed = labelExtractionResultSchema.safeParse(
        response({ fields: fields({ voltage: { value, confidence: 0.9 } }) }),
      );
      expect(parsed.success).toBe(false);
    }
  });

  it("refuses a key outside T-09 — the vocabulary is closed", () => {
    const parsed = labelExtractionResultSchema.safeParse(
      response({
        fields: { ...fields(), weight_kg: { value: "12 kg", confidence: 0.9 } },
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("refuses a missing T-09 key — every field is answered, unread or not", () => {
    const partial: Record<string, unknown> = fields();
    delete partial["serial_number"];
    expect(
      labelExtractionResultSchema.safeParse(response({ fields: partial }))
        .success,
    ).toBe(false);
  });

  it("refuses unknown keys on a field, on evidence and on the envelope", () => {
    expect(
      labelExtractionResultSchema.safeParse(
        response({
          fields: fields({
            model: { value: "X", confidence: 0.9, reason: "…" },
          }),
        }),
      ).success,
    ).toBe(false);
    expect(
      labelExtractionResultSchema.safeParse(
        response({
          fields: fields({
            model: { value: "X", confidence: 0.9, evidence: { page: 1 } },
          }),
        }),
      ).success,
    ).toBe(false);
    expect(
      labelExtractionResultSchema.safeParse(response({ vendor: "x" })).success,
    ).toBe(false);
  });

  it("requires provider, model and prompt identifiers to be non-empty", () => {
    for (const key of ["providerCode", "modelIdentifier", "promptVersion"]) {
      expect(
        labelExtractionResultSchema.safeParse(response({ [key]: "" })).success,
        key,
      ).toBe(false);
    }
  });
});

describe("parseLabelExtractionResult", () => {
  it("returns the validated result when every valued field was requested", () => {
    const result = parseLabelExtractionResult(response(), [
      "manufacturer",
      "voltage",
    ]);
    expect(result.fields.manufacturer.value).toBe("Northvale Cell Systems");
    expect(result.fields.voltage.evidence?.boundingBox).toEqual([
      10, 20, 100, 30,
    ]);
  });

  it("throws malformed, not retryable, on a shape failure, naming the path", () => {
    let caught: unknown;
    try {
      parseLabelExtractionResult(
        response({ fields: fields({ model: { value: "X", confidence: 7 } }) }),
        LABEL_FIELD_KEYS,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(VisionProviderError);
    const error = caught as VisionProviderError;
    expect(error.code).toBe("malformed");
    expect(error.retryable).toBe(false);
    expect(error.message).toMatch(/fields\.model\.confidence/);
  });

  it("refuses a value for a field that was not requested (EC-7) and names it", () => {
    expect(() =>
      parseLabelExtractionResult(response(), ["manufacturer"]),
    ).toThrow(/not requested \(EC-7\): voltage/);
  });

  it("accepts an unrequested field that came back unread", () => {
    expect(() =>
      parseLabelExtractionResult(
        response({
          fields: fields({ manufacturer: { value: "N", confidence: 0.9 } }),
        }),
        ["manufacturer"],
      ),
    ).not.toThrow();
  });
});
