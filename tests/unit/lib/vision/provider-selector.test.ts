import { describe, expect, it } from "vitest";
import {
  activeVisionProviderCode,
  resolveVisionProvider,
  visionProvider,
} from "@/lib/vision";

/**
 * GATE — the label reader selector fails closed.
 *
 * The continuous proof of D-25's operational half. A default to the fixture
 * means an unset or misspelled variable silently reads every real label with
 * canned answers, and a battery record filled from a test script's idea of a
 * label is the wrong-document failure `CLAUDE.md` opens with. The cases mirror
 * `tests/unit/adapter-selector.test.ts` on purpose: one guard, two variables.
 */
describe("resolveVisionProvider", () => {
  it("throws when VISION_PROVIDER is unset", () => {
    expect(() => resolveVisionProvider({})).toThrow(/VISION_PROVIDER must be/);
  });

  it("throws when VISION_PROVIDER is empty", () => {
    expect(() => resolveVisionProvider({ VISION_PROVIDER: "" })).toThrow(
      /VISION_PROVIDER must be/,
    );
  });

  it("throws when VISION_PROVIDER is whitespace", () => {
    expect(() => resolveVisionProvider({ VISION_PROVIDER: "   " })).toThrow(
      /VISION_PROVIDER must be/,
    );
  });

  it("throws when VISION_PROVIDER is unknown, and names the value it got", () => {
    expect(() => resolveVisionProvider({ VISION_PROVIDER: "fixtrue" })).toThrow(
      /VISION_PROVIDER must be 'fixture'; got "fixtrue"/,
    );
  });

  it("throws rather than falling back — no value selects a provider by default", () => {
    for (const value of [
      "Fixture",
      "FIXTURE",
      "mock",
      "true",
      "0",
      "default",
    ]) {
      expect(() => resolveVisionProvider({ VISION_PROVIDER: value })).toThrow();
    }
  });

  it("tolerates surrounding whitespace on an otherwise valid value", () => {
    expect(resolveVisionProvider({ VISION_PROVIDER: " fixture " }).code).toBe(
      "fixture",
    );
  });

  it("resolves the fixture provider, whose code matches the selector's", () => {
    const { code, provider } = resolveVisionProvider({
      VISION_PROVIDER: "fixture",
    });
    expect(code).toBe("fixture");
    expect(provider.code).toBe("fixture");
  });

  it("refuses the fixture in production — a canned read on a real record is a wrong document", () => {
    expect(() =>
      resolveVisionProvider({
        VISION_PROVIDER: "fixture",
        VERCEL_ENV: "production",
      }),
    ).toThrow(/refused in production/);
  });

  it("allows the fixture everywhere that is not production", () => {
    for (const env of ["preview", "development", undefined]) {
      expect(
        resolveVisionProvider({ VISION_PROVIDER: "fixture", VERCEL_ENV: env })
          .code,
      ).toBe("fixture");
    }
  });
});

describe("visionProvider (module load)", () => {
  it("is the fixture under the test environment and is the same instance every call", () => {
    expect(activeVisionProviderCode).toBe("fixture");
    expect(visionProvider().code).toBe("fixture");
    expect(visionProvider()).toBe(visionProvider());
  });
});
