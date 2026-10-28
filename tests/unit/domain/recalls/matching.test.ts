import { describe, expect, it } from "vitest";

import {
  candidateFor,
  candidatesFor,
  matchedOnWords,
  normalizeMakerName,
  recallIdentities,
  type RecallHit,
  type RecallIdentityInput,
  type RecallMatchConfiguration,
} from "@/domain/recalls";

/**
 * Rules 10.11–10.13 — what is matched, what counts as a candidate, and how
 * the match is said. No number appears in any output.
 */

const CONFIGURATION: RecallMatchConfiguration = {
  configurationVersion: "test-1",
  makerWordsIgnored: ["Inc", "LLC", "Co"],
  tractionBatteryComponentTerms: ["traction battery", "propulsion battery"],
};

const BATTERY: RecallIdentityInput = {
  hasConfirmedCatalogEntry: true,
  manufacturerName: "Ridgeline Mobility",
  brandName: "Ridgeline",
  modelName: "RM-24V50",
  partNumber: "RM-24V50-AGM",
  provenanceSourceType: "unknown_provenance",
  sourceDeviceMake: null,
  sourceDeviceModel: null,
  sourceDeviceModelYear: null,
};

function consumerHit(overrides: Partial<RecallHit> = {}): RecallHit {
  return {
    source: "consumer_product_agency",
    providerRecordId: "c-1",
    recallNumber: "24-123",
    title: null,
    url: null,
    publishedOn: null,
    remedy: null,
    summary: null,
    makers: ["Ridgeline Mobility, LLC"],
    models: ["RM-24V50-AGM"],
    modelYear: null,
    component: null,
    ...overrides,
  };
}

function vehicleHit(overrides: Partial<RecallHit> = {}): RecallHit {
  return {
    source: "vehicle_safety_agency",
    providerRecordId: "v-1",
    recallNumber: "26V-118",
    title: null,
    url: null,
    publishedOn: null,
    remedy: null,
    summary: null,
    makers: ["CORVANE"],
    models: ["ION LX"],
    modelYear: 2022,
    component: "ELECTRICAL SYSTEM: PROPULSION SYSTEM: TRACTION BATTERY",
    ...overrides,
  };
}

describe("Rule 10.11 — what a record can be checked on", () => {
  it("checks the battery itself whenever a catalog entry is confirmed", () => {
    expect(recallIdentities(BATTERY).map((identity) => identity.kind)).toEqual([
      "battery",
    ]);
  });

  it("does not check the battery without a confirmed catalog entry", () => {
    expect(
      recallIdentities({ ...BATTERY, hasConfirmedCatalogEntry: false }),
    ).toEqual([]);
  });

  it("checks a vehicle on make, model and model year against the vehicle source", () => {
    const identities = recallIdentities({
      ...BATTERY,
      provenanceSourceType: "vehicle_vin",
      sourceDeviceMake: "Corvane",
      sourceDeviceModel: "Ion LX",
      sourceDeviceModelYear: 2022,
    });
    expect(identities.map((identity) => identity.kind)).toEqual([
      "battery",
      "source_vehicle",
    ]);
    expect(identities[1]?.source).toBe("vehicle_safety_agency");
  });

  it("has no vehicle identity without a model year — never a check that can only say no match", () => {
    expect(
      recallIdentities({
        ...BATTERY,
        provenanceSourceType: "vehicle_vin",
        sourceDeviceMake: "Corvane",
        sourceDeviceModel: "Ion LX",
        sourceDeviceModelYear: null,
      }).map((identity) => identity.kind),
    ).toEqual(["battery"]);
  });

  it("checks a device on make and model against the consumer source", () => {
    const identities = recallIdentities({
      ...BATTERY,
      provenanceSourceType: "device_serial",
      sourceDeviceMake: "Ridgeline",
      sourceDeviceModel: "Rover 6",
    });
    expect(identities.map((identity) => identity.kind)).toEqual([
      "battery",
      "source_device",
    ]);
    expect(identities[1]?.source).toBe("consumer_product_agency");
  });

  it("lets unknown provenance and bulk consignment stop only the second check (T-11)", () => {
    for (const provenanceSourceType of [
      "unknown_provenance",
      "bulk_consignment",
    ] as const) {
      expect(
        recallIdentities({
          ...BATTERY,
          provenanceSourceType,
          sourceDeviceMake: "Corvane",
          sourceDeviceModel: "Ion LX",
          sourceDeviceModelYear: 2022,
        }).map((identity) => identity.kind),
      ).toEqual(["battery"]);
    }
  });
});

describe("Rule 10.12 — what counts as a candidate", () => {
  const [battery] = recallIdentities(BATTERY);
  if (battery === undefined) throw new Error("no battery identity");

  it("needs the maker and a listed model or part number to agree", () => {
    const candidate = candidateFor(battery, consumerHit(), CONFIGURATION);
    expect(candidate?.fields).toEqual(["manufacturer", "part_number"]);
  });

  it("never makes a candidate of a maker agreeing on its own", () => {
    expect(
      candidateFor(
        battery,
        consumerHit({ models: ["RM-12V35-AGM"] }),
        CONFIGURATION,
      ),
    ).toBeNull();
  });

  it("never makes a candidate of a model agreeing on its own", () => {
    expect(
      candidateFor(
        battery,
        consumerHit({ makers: ["Someone Else Inc"] }),
        CONFIGURATION,
      ),
    ).toBeNull();
  });

  it("normalizes names the way part numbers are, after the configured maker words", () => {
    expect(normalizeMakerName("Ridgeline Mobility, LLC", CONFIGURATION)).toBe(
      "RIDGELINEMOBILITY",
    );
    expect(normalizeMakerName("LLC", CONFIGURATION)).toBe("");
  });

  it("takes a vehicle recall only when its component names the traction battery", () => {
    const [, vehicle] = recallIdentities({
      ...BATTERY,
      provenanceSourceType: "vehicle_vin",
      sourceDeviceMake: "Corvane",
      sourceDeviceModel: "Ion LX",
      sourceDeviceModelYear: 2022,
    });
    if (vehicle === undefined) throw new Error("no vehicle identity");
    expect(candidateFor(vehicle, vehicleHit(), CONFIGURATION)?.fields).toEqual([
      "make",
      "model",
      "model_year",
      "component",
    ]);
    expect(
      candidateFor(
        vehicle,
        vehicleHit({ component: "SEAT BELTS: FRONT: RETRACTORS" }),
        CONFIGURATION,
      ),
    ).toBeNull();
    expect(
      candidateFor(vehicle, vehicleHit({ modelYear: 2021 }), CONFIGURATION),
    ).toBeNull();
  });

  it("makes one candidate per recall, and none from the other source", () => {
    expect(
      candidatesFor(
        battery,
        [consumerHit(), consumerHit(), vehicleHit()],
        CONFIGURATION,
      ),
    ).toHaveLength(1);
  });
});

describe("Rule 10.13 — said in words, never a number", () => {
  it("names the fields that agreed", () => {
    expect(matchedOnWords("battery", ["brand", "model"], "24-123")).toBe(
      "Brand and model match recall 24-123.",
    );
    expect(matchedOnWords("source_device", ["make", "model"], "26-112")).toBe(
      "Device make and model match recall 26-112.",
    );
    expect(
      matchedOnWords(
        "source_vehicle",
        ["make", "model", "model_year", "component"],
        "26V-118",
      ),
    ).toBe(
      "Vehicle make, model and model year match recall 26V-118, and its component names the propulsion or traction battery.",
    );
  });

  it("carries no score, percentage or strength", () => {
    const words = matchedOnWords(
      "battery",
      ["manufacturer", "part_number"],
      "X",
    );
    expect(words).not.toMatch(/%|score|strength|confiden|probab|likel/iu);
  });
});
