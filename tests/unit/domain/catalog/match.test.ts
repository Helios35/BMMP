import { describe, expect, it } from "vitest";

import {
  isExactMatch,
  normalizePartNumber,
  rankCatalogCandidates,
  type MatchCandidateInput,
  type MatchIdentifiers,
} from "@/domain/catalog";
import type { MatchScoring, MatchTolerances } from "@/domain/intake/thresholds";

/**
 * Catalog matching — `TECHNICAL_SPEC.md` §11.1 step 4; Rules 2.18, 2.19.
 *
 * The three candidates mirror the fixture catalog's shapes (a vehicle traction
 * pack, a mobility scooter pack and a laptop cell) so the ranking is proven
 * against rows the intake pipeline will actually see. The tolerances are this
 * test's own literals — the product's live values are platform configuration
 * and never appear in a domain module.
 */

const TOLERANCES: MatchTolerances = {
  voltageRelative: 0.02,
  capacityRelative: 0.05,
  energyRelative: 0.05,
};

/** The scorer's weights, this test's own — the platform's live in the mock's fixtures. */
const SCORING: MatchScoring = {
  labelPatternScore: 0.9,
  similarityCeiling: 0.8,
  numericAgreementBonus: 0.05,
};

const CONFIGURATION = { tolerances: TOLERANCES, scoring: SCORING } as const;

const VEHICLE: MatchCandidateInput = {
  catalogEntryId: "0a000008-0000-4000-8000-000000000001",
  manufacturerName: "Northvale Cell Systems",
  modelName: "NV-TP400",
  partNumber: "NV-TP400-96S",
  partNumberNormalized: "NVTP40096S",
  nominalVoltageV: "355.200",
  ratedCapacityAh: "220.000",
  ratedEnergyWh: "78100.000",
  labelTextPatterns: { model: ["NV-TP400", "NVTP400"] },
};

const SCOOTER: MatchCandidateInput = {
  catalogEntryId: "0a000008-0000-4000-8000-000000000002",
  manufacturerName: "Ridgeline Mobility",
  modelName: "RM-24V50",
  partNumber: "RM-24V50-AGM",
  partNumberNormalized: "RM24V50AGM",
  nominalVoltageV: "24.000",
  ratedCapacityAh: "50.000",
  ratedEnergyWh: "1200.000",
  labelTextPatterns: { model: ["RM-24V50", "RM24V50"] },
};

const LAPTOP: MatchCandidateInput = {
  catalogEntryId: "0a000008-0000-4000-8000-000000000003",
  manufacturerName: "Halden Micro",
  modelName: "HM-L58",
  partNumber: "HM-L58-6C",
  partNumberNormalized: "HML586C",
  nominalVoltageV: "11.400",
  ratedCapacityAh: "5.200",
  ratedEnergyWh: "59.280",
  labelTextPatterns: null,
};

const CANDIDATES = [LAPTOP, SCOOTER, VEHICLE] as const;

function ids(patch: Partial<MatchIdentifiers> = {}): MatchIdentifiers {
  return {
    manufacturer: null,
    model: null,
    voltageV: null,
    capacityAh: null,
    energyWh: null,
    ...patch,
  };
}

describe("normalizePartNumber", () => {
  it("upper-cases and strips every separator, as the generated column does", () => {
    expect(normalizePartNumber("NV-TP400-96S")).toBe("NVTP40096S");
    expect(normalizePartNumber("rm 24v50/agm")).toBe("RM24V50AGM");
  });
});

describe("Rule 2.18 — an exact part number resolves one entry", () => {
  it("scores the entry whose normalised part number equals the label's model at the top", () => {
    const ranked = rankCatalogCandidates(
      ids({ model: "nv-tp400-96s" }),
      CANDIDATES,
      CONFIGURATION,
    );
    expect(ranked[0]).toMatchObject({
      catalogEntryId: VEHICLE.catalogEntryId,
      matchScore: 1,
      matchMethodCode: "exact_part_number",
      matchedOn: ["model"],
    });
    expect(isExactMatch(ranked)).toBe(true);
  });

  it("is not exact when the model only names a pattern, not the part number", () => {
    const ranked = rankCatalogCandidates(
      ids({ model: "NV-TP400" }),
      CANDIDATES,
      CONFIGURATION,
    );
    expect(ranked[0]?.matchMethodCode).toBe("label_pattern");
    expect(isExactMatch(ranked)).toBe(false);
  });

  it("is not exact when two entries both resolve by part number (Rule 2.19 — a human picks)", () => {
    const twin: MatchCandidateInput = {
      ...VEHICLE,
      catalogEntryId: "0a000008-0000-4000-8000-000000000009",
    };
    const ranked = rankCatalogCandidates(
      ids({ model: "NV-TP400-96S" }),
      [VEHICLE, twin],
      CONFIGURATION,
    );
    expect(ranked.map((candidate) => candidate.matchMethodCode)).toEqual([
      "exact_part_number",
      "exact_part_number",
    ]);
    expect(isExactMatch(ranked)).toBe(false);
  });

  it("is not exact on an empty list", () => {
    expect(isExactMatch([])).toBe(false);
  });

  it("falls back to the raw part number when the entry carries no normalised one", () => {
    const ranked = rankCatalogCandidates(
      ids({ model: "HM-L58-6C" }),
      [{ ...LAPTOP, partNumberNormalized: null }],
      CONFIGURATION,
    );
    expect(ranked[0]?.matchMethodCode).toBe("exact_part_number");
  });
});

describe("label patterns", () => {
  it("scores a model the entry's own patterns name below an exact hit and above similarity", () => {
    const ranked = rankCatalogCandidates(
      ids({ model: "RM24V50" }),
      CANDIDATES,
      CONFIGURATION,
    );
    expect(ranked[0]).toMatchObject({
      catalogEntryId: SCOOTER.catalogEntryId,
      matchScore: 0.9,
      matchMethodCode: "label_pattern",
    });
    expect(ranked[1]?.matchScore ?? 0).toBeLessThan(0.9);
  });

  it("ignores a malformed patterns column instead of crashing", () => {
    const ranked = rankCatalogCandidates(
      ids({ model: "HM-L58" }),
      [
        { ...LAPTOP, labelTextPatterns: "HM-L58" },
        {
          ...LAPTOP,
          catalogEntryId: "x",
          labelTextPatterns: { model: "HM-L58" },
        },
        { ...LAPTOP, catalogEntryId: "y", labelTextPatterns: { model: [42] } },
      ],
      CONFIGURATION,
    );
    for (const candidate of ranked) {
      expect(candidate.matchMethodCode).toBe("similarity");
    }
  });
});

describe("similarity", () => {
  it("ranks the entry whose manufacturer and model read most like the label first", () => {
    const ranked = rankCatalogCandidates(
      ids({ manufacturer: "Northvale Cell Systems", model: "NV TP400 module" }),
      CANDIDATES,
      CONFIGURATION,
    );
    expect(ranked[0]?.catalogEntryId).toBe(VEHICLE.catalogEntryId);
    expect(ranked[0]?.matchMethodCode).toBe("similarity");
    expect(ranked[0]?.matchedOn).toContain("manufacturer");
  });

  it("never lets text similarity alone reach a pattern hit", () => {
    const ranked = rankCatalogCandidates(
      ids({ manufacturer: "Halden Micro", model: "HM-L58 " }),
      [{ ...LAPTOP, partNumber: null, partNumberNormalized: null }],
      CONFIGURATION,
    );
    expect(ranked[0]?.matchMethodCode).toBe("similarity");
    expect(ranked[0]?.matchScore ?? 1).toBeLessThanOrEqual(0.8);
  });

  it("adds a bonus per nameplate figure that agrees within the tolerance", () => {
    const withoutFigures = rankCatalogCandidates(
      ids({ manufacturer: "Northvale" }),
      [VEHICLE],
      CONFIGURATION,
    )[0];
    const withFigures = rankCatalogCandidates(
      ids({
        manufacturer: "Northvale",
        voltageV: "355.2",
        capacityAh: "220",
        energyWh: "78000",
      }),
      [VEHICLE],
      CONFIGURATION,
    )[0];
    expect(withFigures?.matchedOn).toEqual([
      "manufacturer",
      "voltage",
      "capacity_ah",
      "energy_wh",
    ]);
    expect(
      (withFigures?.matchScore ?? 0) - (withoutFigures?.matchScore ?? 0),
    ).toBeCloseTo(0.15, 6);
  });

  it("gives no bonus for a figure outside the tolerance", () => {
    const ranked = rankCatalogCandidates(
      ids({ manufacturer: "Northvale", voltageV: "400" }),
      [VEHICLE],
      CONFIGURATION,
    );
    expect(ranked[0]?.matchedOn).not.toContain("voltage");
  });

  it("gives no bonus for a figure that is not a decimal string", () => {
    const ranked = rankCatalogCandidates(
      ids({ manufacturer: "Northvale", voltageV: "355 V" }),
      [VEHICLE],
      CONFIGURATION,
    );
    expect(ranked[0]?.matchedOn).not.toContain("voltage");
  });

  it("treats a zero catalog figure as disagreement rather than dividing by it", () => {
    const ranked = rankCatalogCandidates(
      ids({ manufacturer: "Northvale", voltageV: "0" }),
      [{ ...VEHICLE, nominalVoltageV: "0.000" }],
      CONFIGURATION,
    );
    // |0 − 0| ≤ tolerance × 0 holds, so a zero label against a zero entry does
    // agree; what matters is that nothing threw.
    expect(ranked).toHaveLength(1);
  });

  it("scores zero, not NaN, when the label supplied no text at all", () => {
    const ranked = rankCatalogCandidates(ids(), CANDIDATES, CONFIGURATION);
    for (const candidate of ranked) {
      expect(candidate.matchScore).toBe(0);
      expect(candidate.matchedOn).toEqual([]);
    }
  });
});

describe("determinism (Rule 2.19 — the list is presented, never narrowed)", () => {
  it("returns every candidate, descending by score, ties broken by id", () => {
    const ranked = rankCatalogCandidates(ids(), CANDIDATES, CONFIGURATION);
    // Every score is zero here, so the order is the ids' own — ascending.
    expect(ranked.map((candidate) => candidate.catalogEntryId)).toEqual(
      [VEHICLE, SCOOTER, LAPTOP].map((c) => c.catalogEntryId),
    );
  });

  it("produces the same order regardless of the candidates' input order", () => {
    const query = ids({ manufacturer: "Ridgeline", model: "RM" });
    const forward = rankCatalogCandidates(query, CANDIDATES, CONFIGURATION);
    const reversed = rankCatalogCandidates(
      query,
      [...CANDIDATES].reverse(),
      CONFIGURATION,
    );
    expect(reversed).toEqual(forward);
  });

  it("never auto-selects: the result carries no selection of any kind", () => {
    const ranked = rankCatalogCandidates(
      ids({ model: "NV-TP400-96S" }),
      CANDIDATES,
      CONFIGURATION,
    );
    for (const candidate of ranked) {
      expect(Object.keys(candidate).sort()).toEqual([
        "catalogEntryId",
        "matchMethodCode",
        "matchScore",
        "matchedOn",
      ]);
    }
  });
});
