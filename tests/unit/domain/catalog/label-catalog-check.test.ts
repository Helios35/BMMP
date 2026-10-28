import { describe, expect, it } from "vitest";

import {
  compareLabelToCatalog,
  LABEL_CATALOG_FIELDS,
  labelDisagreesWithCatalog,
  type LabelCatalogEntry,
  type LabelCatalogRead,
} from "@/domain/catalog";
import type { MatchTolerances } from "@/domain/intake/thresholds";

/**
 * The label-vs-catalog check, text half — Rule 2.35; T-52
 * `label_catalog_mismatch`; D-68.
 *
 * The tolerances are this test's own literals — the product's live values are
 * platform configuration (D-43) and never appear in a domain module.
 */

const TOLERANCES: MatchTolerances = {
  voltageRelative: 0.02,
  capacityRelative: 0.05,
  energyRelative: 0.05,
};

const ENTRY: LabelCatalogEntry = {
  catalogEntryId: "entry-traction",
  manufacturerName: "Northvolt Systems",
  brandName: "NV",
  partNumber: "NV-TP400-96S",
  partNumberNormalized: "NVTP40096S",
  nominalVoltageV: "355.200",
  ratedCapacityAh: "223.000",
  ratedEnergyWh: "79200.000",
  chemistry: "li_nmc",
};

function read(patch: Partial<LabelCatalogRead> = {}): LabelCatalogRead {
  return {
    manufacturer: "Northvolt Systems",
    model: "NV-TP400-96S",
    voltage: "355 V",
    capacityAh: "223 Ah",
    energyWh: "79.2 kWh",
    chemistry: null,
    ...patch,
  };
}

describe("compareLabelToCatalog", () => {
  it("compares only Rule 2.35's six fields, in its order", () => {
    expect(LABEL_CATALOG_FIELDS).toEqual([
      "manufacturer",
      "model",
      "voltage",
      "capacity_ah",
      "energy_wh",
      "chemistry_code",
    ]);
  });

  it("a label that agrees within tolerance disagrees with nothing", () => {
    const comparison = compareLabelToCatalog(read(), ENTRY, TOLERANCES);
    expect(comparison.compared).toEqual([
      "manufacturer",
      "model",
      "voltage",
      "capacity_ah",
      "energy_wh",
    ]);
    expect(comparison.disagreements).toEqual([]);
    expect(labelDisagreesWithCatalog(comparison)).toBe(false);
  });

  it("a voltage beyond the configured tolerance is a disagreement, with both values and the tolerance", () => {
    const comparison = compareLabelToCatalog(
      read({ voltage: "48 V" }),
      ENTRY,
      TOLERANCES,
    );
    expect(comparison.disagreements).toEqual([
      {
        fieldCode: "voltage",
        labelSays: "48 V",
        catalogSays: "355.200",
        toleranceRelative: 0.02,
      },
    ]);
    expect(labelDisagreesWithCatalog(comparison)).toBe(true);
  });

  it("the tolerance is the configuration's: widen it and the same figures agree (D-43)", () => {
    const wide = compareLabelToCatalog(read({ voltage: "340 V" }), ENTRY, {
      ...TOLERANCES,
      voltageRelative: 0.05,
    });
    const tight = compareLabelToCatalog(
      read({ voltage: "340 V" }),
      ENTRY,
      TOLERANCES,
    );
    expect(wide.disagreements).toEqual([]);
    expect(tight.disagreements.map((entry) => entry.fieldCode)).toEqual([
      "voltage",
    ]);
  });

  it("Rule 2.11 — a field the label did not read is never a disagreement", () => {
    const comparison = compareLabelToCatalog(
      read({ voltage: null, capacityAh: "", manufacturer: null }),
      ENTRY,
      TOLERANCES,
    );
    expect(comparison.compared).toEqual(["model", "energy_wh"]);
    expect(comparison.disagreements).toEqual([]);
  });

  it("a field the entry does not carry is not compared", () => {
    const comparison = compareLabelToCatalog(
      read({ energyWh: "1 Wh" }),
      { ...ENTRY, ratedEnergyWh: null },
      TOLERANCES,
    );
    expect(comparison.compared).not.toContain("energy_wh");
    expect(comparison.disagreements).toEqual([]);
  });

  it("the manufacturer agrees with the brand name where the entry has one, normalised like a part number", () => {
    expect(
      compareLabelToCatalog(read({ manufacturer: "n.v." }), ENTRY, TOLERANCES)
        .disagreements,
    ).toEqual([]);
    const other = compareLabelToCatalog(
      read({ manufacturer: "Rascal Mobility" }),
      ENTRY,
      TOLERANCES,
    );
    expect(other.disagreements).toEqual([
      {
        fieldCode: "manufacturer",
        labelSays: "Rascal Mobility",
        catalogSays: "Northvolt Systems / NV",
        toleranceRelative: null,
      },
    ]);
  });

  it("the model is compared on the normalised part number", () => {
    expect(
      compareLabelToCatalog(read({ model: "nv tp400 96s" }), ENTRY, TOLERANCES)
        .disagreements,
    ).toEqual([]);
    expect(
      compareLabelToCatalog(read({ model: "NV-TP400-84S" }), ENTRY, TOLERANCES)
        .disagreements[0]?.fieldCode,
    ).toBe("model");
  });

  it("a printed figure that is not a quantity is not compared", () => {
    const comparison = compareLabelToCatalog(
      read({ voltage: "see manual" }),
      ENTRY,
      TOLERANCES,
    );
    expect(comparison.compared).not.toContain("voltage");
    expect(comparison.disagreements).toEqual([]);
  });

  it("chemistry is compared only where the printed code resolved to a T-01 value", () => {
    expect(
      compareLabelToCatalog(read({ chemistry: null }), ENTRY, TOLERANCES)
        .compared,
    ).not.toContain("chemistry_code");
    const resolved = compareLabelToCatalog(
      read({ chemistry: "li_lfp" }),
      ENTRY,
      TOLERANCES,
    );
    expect(resolved.disagreements).toEqual([
      {
        fieldCode: "chemistry_code",
        labelSays: "li_lfp",
        catalogSays: "li_nmc",
        toleranceRelative: null,
      },
    ]);
  });

  it("Rules 1.25, 2.35 — the result carries fields and values, never a score", () => {
    const comparison = compareLabelToCatalog(
      read({ voltage: "48 V", model: "X-1" }),
      ENTRY,
      TOLERANCES,
    );
    expect(Object.keys(comparison).sort()).toEqual([
      "catalogEntryId",
      "compared",
      "disagreements",
    ]);
    expect(JSON.stringify(comparison)).not.toMatch(
      /score|probab|likel|percent|chance|strength/i,
    );
  });

  it("no comparison at all is no disagreement", () => {
    expect(labelDisagreesWithCatalog(null)).toBe(false);
  });
});
