import { describe, expect, it } from "vitest";

import {
  activeRecallProviderCode,
  isRecallProviderError,
  recallProvider,
  resolveRecallProvider,
} from "@/lib/recalls";
import { FIXTURE_RECALLS } from "@/lib/recalls/providers/fixture";

/**
 * The recall source selector fails closed — `TECHNICAL_SPEC.md` §12.3; D-73 #6.
 *
 * The same guard as `VISION_PROVIDER`, with the one difference §12.3 states:
 * `fixture` is the default under `DATA_ADAPTER=mock`, where the fixture
 * recalls are the only recalls there are. Anywhere else an unset value fails,
 * a misspelled value always fails, and the fixture is refused in production —
 * a real battery checked against a test script's recalls would read "No
 * match" when nothing was asked.
 */
describe("resolveRecallProvider", () => {
  it("defaults to the fixture under DATA_ADAPTER=mock", () => {
    expect(resolveRecallProvider({ DATA_ADAPTER: "mock" }).code).toBe(
      "fixture",
    );
  });

  it("throws when RECALL_PROVIDER is unset and the data is not the mock", () => {
    expect(() => resolveRecallProvider({ DATA_ADAPTER: "supabase" })).toThrow(
      /RECALL_PROVIDER must be/,
    );
    expect(() => resolveRecallProvider({})).toThrow(/RECALL_PROVIDER must be/);
  });

  it("throws on an unrecognized value, even on the mock, and names it", () => {
    expect(() =>
      resolveRecallProvider({
        RECALL_PROVIDER: "fixtrue",
        DATA_ADAPTER: "mock",
      }),
    ).toThrow(/RECALL_PROVIDER must be 'fixture'; got "fixtrue"/);
  });

  it("refuses the fixture in production", () => {
    expect(() =>
      resolveRecallProvider({
        RECALL_PROVIDER: "fixture",
        VERCEL_ENV: "production",
      }),
    ).toThrow(/refused in production/);
    expect(() =>
      resolveRecallProvider({ DATA_ADAPTER: "mock", VERCEL_ENV: "production" }),
    ).toThrow(/refused in production/);
  });

  it("selected the fixture for this test process", () => {
    expect(activeRecallProviderCode).toBe("fixture");
  });
});

describe("the fixture recall source", () => {
  it("answers a maker by its recalls, leaving candidacy to the domain", async () => {
    const hits = await recallProvider().search({
      source: "consumer_product_agency",
      makers: ["Ridgeline Mobility"],
      models: ["RM-24V50-AGM"],
    });
    // 26-041 names the model; 26-087 and 26-112 only share the maker.
    expect(hits.map((hit) => hit.recallNumber).sort()).toEqual([
      "26-041",
      "26-087",
      "26-112",
    ]);
  });

  it("answers a vehicle with every component, the seat belts included", async () => {
    const hits = await recallProvider().search({
      source: "vehicle_safety_agency",
      make: "Corvane",
      model: "Ion LX",
      modelYear: 2022,
    });
    expect(hits.map((hit) => hit.recallNumber).sort()).toEqual([
      "26V-118",
      "26V-131",
    ]);
  });

  it("always answers the Kestrel key with source unavailable", async () => {
    const failure = await recallProvider()
      .search({
        source: "vehicle_safety_agency",
        make: "Kestrel",
        model: "Volt 8",
        modelYear: 2021,
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(isRecallProviderError(failure)).toBe(true);
    expect(isRecallProviderError(failure) ? failure.code : null).toBe(
      "source_unavailable",
    );
  });

  it("carries no chance of anything in any title or summary (Rule 10.3)", () => {
    for (const hit of FIXTURE_RECALLS) {
      expect(`${hit.title ?? ""} ${hit.summary ?? ""}`).not.toMatch(
        /risk of fire|probab|likelihood|chance of|%/iu,
      );
    }
  });
});
