import { describe, expect, it } from "vitest";

import * as FIXTURES from "@/data/mock/fixtures";
import { ORG } from "@/data/mock/fixtures/ids";
import { PLATFORM_HAZARD_RANKING_SCHEME } from "@/data/mock/fixtures/platform-configuration";
import { gatherHazardRankingInputs } from "@/data/mock/hazard-ranking-inputs";
import {
  bandFor,
  certificationMarksRead,
  compareRankable,
  computeHazardRanking,
  damageEvidenceValue,
  groupReadings,
  hazardRankingStanding,
  levelFor,
  NOT_RECORDED_LEVEL,
  ordinal,
  positionText,
  rankItems,
  schemeFactor,
  validateHazardRankingScheme,
  wholeYearsBetween,
  type FactorReading,
  type GroupMember,
  type HazardRankingScheme,
  type RankableItem,
} from "@/domain/hazard";
import type { HazardFactorCode } from "@/domain/taxonomy/hazard-factor-code";
import { STATE_OF_CHARGE_BAND_LABELS } from "@/domain/taxonomy/state-of-charge-band";

/**
 * The hazard ranking's pure rules — Rules 10.19–10.23; D-77.
 *
 * Exact orders are asserted here and never in e2e, which shares one store
 * across parallel specs (brief, landmines).
 */

function scheme(): HazardRankingScheme {
  const validation = validateHazardRankingScheme(
    PLATFORM_HAZARD_RANKING_SCHEME,
  );
  if (!validation.ok) throw new Error(validation.issues.join("; "));
  return validation.scheme;
}

const CUTS = [0.25, 0.5, 0.75] as const;

const CODES: readonly HazardFactorCode[] = [
  "damage_indicators",
  "recall_status",
  "chemistry",
];

/** An item whose factors sit at the given rank indexes, highest first = 0. */
function item(label: string, ranks: readonly number[]): RankableItem {
  return {
    id: `id-${label}`,
    label,
    readings: ranks.map((rank, index) => ({
      code: CODES[index] ?? "chemistry",
      level: `level_${rank}`,
      label: `Level ${rank}`,
      rankIndex: rank,
      basis: "a test basis",
      inputRef: `${label}-${index}`,
    })),
  };
}

describe("the ranking scheme (Rule 10.21; D-40)", () => {
  it("validates the platform's v1 scheme", () => {
    expect(validateHazardRankingScheme(PLATFORM_HAZARD_RANKING_SCHEME).ok).toBe(
      true,
    );
  });

  it("uses Rule 10.20's order, with aggregation after chemistry for containers and lots", () => {
    const { factorOrder } = scheme();
    expect(factorOrder.battery_record).toEqual([
      "damage_indicators",
      "recall_status",
      "chemistry",
      "state_of_charge_at_intake",
      "age_from_date_code",
      "certification_marks",
    ]);
    for (const order of [factorOrder.container, factorOrder.lot]) {
      expect(order.indexOf("storage_aggregation")).toBe(
        order.indexOf("chemistry") + 1,
      );
    }
  });

  it("shows the T-21 label for the charge levels, never a reading (Rule 10.20)", () => {
    const charge = schemeFactor(scheme(), "state_of_charge_at_intake");
    expect(charge.levels.map((level) => level.label)).toEqual([
      STATE_OF_CHARGE_BAND_LABELS.above_storage_limit,
      STATE_OF_CHARGE_BAND_LABELS.at_or_below_storage_limit,
    ]);
  });

  it("refuses aggregation on a battery, a missing factor, bad cut points and a prohibited label", () => {
    const base = PLATFORM_HAZARD_RANKING_SCHEME;
    const refused = [
      {
        ...base,
        factorOrder: {
          ...base.factorOrder,
          battery_record: [
            ...base.factorOrder.battery_record,
            "storage_aggregation",
          ],
        },
      },
      { ...base, factors: base.factors.filter((f) => f.code !== "chemistry") },
      { ...base, bandCutPoints: [0.5, 0.25, 0.75] },
      { ...base, bandCutPoints: [0.25, 0.5] },
      {
        ...base,
        factors: base.factors.map((f) =>
          f.code === "chemistry"
            ? { ...f, notRecordedLabel: "Unknown risk" }
            : f,
        ),
      },
      {
        ...base,
        factors: base.factors.map((f) =>
          f.code === "age_from_date_code"
            ? { ...f, levels: f.levels.slice(0, 2) }
            : f,
        ),
      },
    ];
    for (const value of refused) {
      expect(validateHazardRankingScheme(value).ok).toBe(false);
    }
    expect(validateHazardRankingScheme(null).ok).toBe(false);
  });
});

describe("how items are ordered (Rule 10.21)", () => {
  it("decides on the first factor that differs, whatever the factors after it", () => {
    const a = item("A", [0, 2, 0]);
    const b = item("B", [0, 1, 3]);
    // B is higher on the second factor; A's better third factor never counts.
    expect(compareRankable(b, a)).toBeLessThan(0);
    expect(rankItems([a, b], CUTS).map((ranked) => ranked.item.label)).toEqual([
      "B",
      "A",
    ]);
  });

  it("adds nothing up: a lower first factor is never outweighed", () => {
    const top = item("TOP", [0, 2, 2]);
    const rest = item("REST", [1, 0, 0]);
    expect(compareRankable(top, rest)).toBeLessThan(0);
  });

  it("gives level items one position and one band, and names who they are level with", () => {
    const ranked = rankItems(
      [
        item("A", [0, 0, 0]),
        item("B", [1, 0, 0]),
        item("C", [1, 0, 0]),
        item("D", [2, 0, 0]),
        item("E", [3, 0, 0]),
      ],
      CUTS,
    );
    const b = ranked.find((row) => row.item.label === "B");
    const c = ranked.find((row) => row.item.label === "C");
    expect(b?.position).toBe(2);
    expect(c?.position).toBe(2);
    expect(b?.band).toBe(c?.band);
    expect(b?.levelWithCount).toBe(1);
    expect(b?.why.levelWithLabels).toEqual(["C"]);
    expect(ranked.find((row) => row.item.label === "D")?.position).toBe(4);
    expect(positionText({ position: 2, setSize: 5, levelWithCount: 1 })).toBe(
      "2nd of 5, level with 1 other",
    );
  });

  it("explains a place against the item just above and just below", () => {
    const ranked = rankItems(
      [item("A", [0, 0, 0]), item("B", [0, 1, 0]), item("C", [0, 1, 2])],
      CUTS,
    );
    const b = ranked.find((row) => row.item.label === "B");
    expect(b?.why.above).toMatchObject({
      otherLabel: "A",
      factorCode: "recall_status",
      ownLevelLabel: "Level 1",
      otherLevelLabel: "Level 0",
    });
    expect(b?.why.below).toMatchObject({
      otherLabel: "C",
      factorCode: "chemistry",
    });
    expect(ranked[0]?.why.above).toBeNull();
    expect(ranked[2]?.why.below).toBeNull();
  });
});

describe("the band (Rule 10.23)", () => {
  it("places the share against each cut point exactly", () => {
    // A set of five, each item alone: shares 0, 0.25, 0.5, 0.75 and 1.
    const bands = [0, 1, 2, 3, 4].map((rankedAbove) =>
      bandFor({ rankedAbove, groupSize: 1, setSize: 5, cutPoints: CUTS }),
    );
    // Below 0.25 is Band 1; up to 0.5 is Band 2; up to 0.75 is Band 3; the rest Band 4.
    expect(bands).toEqual(["band_1", "band_2", "band_2", "band_3", "band_4"]);
  });

  it("places a level group by its middle", () => {
    // Set of three, the top two level: (0 + (2 − 1) ÷ 2) ÷ 2 = 0.25 → Band 2.
    expect(
      bandFor({ rankedAbove: 0, groupSize: 2, setSize: 3, cutPoints: CUTS }),
    ).toBe("band_2");
    // The one below them: (2 + 0) ÷ 2 = 1 → Band 4.
    expect(
      bandFor({ rankedAbove: 2, groupSize: 1, setSize: 3, cutPoints: CUTS }),
    ).toBe("band_4");
  });

  it("does not round a share that lands on a cut point it cannot be written exactly in binary", () => {
    // 3 ÷ 10 = 0.3 exactly, against a cut point of 0.3: not below it.
    expect(
      bandFor({
        rankedAbove: 3,
        groupSize: 1,
        setSize: 11,
        cutPoints: [0.3, 0.6, 0.9],
      }),
    ).toBe("band_2");
  });

  it("is `not_ranked` for a one-item set and for a set where every item is level", () => {
    expect(rankItems([item("ONLY", [1, 1, 1])], CUTS)[0]).toMatchObject({
      band: "not_ranked",
      position: 1,
      setSize: 1,
    });
    const level = rankItems(
      [item("A", [1, 0, 2]), item("B", [1, 0, 2]), item("C", [1, 0, 2])],
      CUTS,
    );
    expect(level.map((row) => row.band)).toEqual([
      "not_ranked",
      "not_ranked",
      "not_ranked",
    ]);
    expect(level.every((row) => row.position === 1)).toBe(true);
    expect(level[0]?.levelWithCount).toBe(2);
  });
});

describe('evidence and "Not recorded" (Rule 10.20)', () => {
  it('ranks "Not recorded" level with the factor\'s highest level — never low, never safe', () => {
    const damage = schemeFactor(scheme(), "damage_indicators");
    const gap = levelFor(damage, { value: null, basis: "none", inputRef: "x" });
    const top = levelFor(damage, {
      value: "damaged_or_defective",
      basis: "an assessment",
      inputRef: "y",
    });
    expect(gap.level).toBe(NOT_RECORDED_LEVEL);
    expect(gap.label).toBe("Not recorded");
    expect(gap.rankIndex).toBe(top.rankIndex);
    expect(gap.rankIndex).toBe(0);
  });

  it('reads T-01 `other`, T-21 `not_captured`, `not_checked` and an unknown value as "Not recorded"', () => {
    const s = scheme();
    const cases: readonly [HazardFactorCode, string][] = [
      ["chemistry", "other"],
      ["chemistry", "unobtainium"],
      ["state_of_charge_at_intake", "not_captured"],
      ["recall_status", "not_checked"],
    ];
    for (const [code, value] of cases) {
      expect(
        levelFor(schemeFactor(s, code), { value, basis: "b", inputRef: "r" })
          .level,
        `${code}=${value}`,
      ).toBe(NOT_RECORDED_LEVEL);
    }
  });

  it("splits damage two ways from T-29 and reads a flag over the findings", () => {
    const assessment = (findingTypes: readonly string[]) => ({
      id: "a",
      batteryRecordId: "r",
      status: "assessed_sound",
      findingTypes,
      assessedAt: "2026-11-01T00:00:00.000Z",
      assessedBy: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      supersedesDamageAssessmentId: null,
    });
    expect(damageEvidenceValue(assessment(["dent"]), [])).toBe(
      "damaged_or_defective",
    );
    expect(
      damageEvidenceValue(assessment(["corrosion", "surface_marking"]), []),
    ).toBe("cosmetic_only");
    expect(damageEvidenceValue(assessment(["none_observed"]), [])).toBe(
      "none_observed",
    );
    expect(
      damageEvidenceValue(assessment(["none_observed"]), ["defective"]),
    ).toBe("damaged_or_defective");
    expect(damageEvidenceValue(null, [])).toBeNull();
  });

  it("tells marks never captured from a label read with none on it", () => {
    expect(certificationMarksRead(null)).toBeNull();
    expect(certificationMarksRead([])).toEqual([]);
    expect(certificationMarksRead(["UN38.3", "CE"])).toEqual(["UN38.3", "CE"]);
    expect(certificationMarksRead({ unexpected: true })).toBeNull();
  });

  it("counts whole years, and refuses a manufacture date after the as-of date", () => {
    expect(wholeYearsBetween("2021-11-01", "2026-11-12")).toBe(5);
    expect(wholeYearsBetween("2021-11-13", "2026-11-12")).toBe(4);
    expect(wholeYearsBetween("2030-01-01", "2026-11-12")).toBeNull();
  });
});

describe("containers and lots (Rule 10.22)", () => {
  function reading(
    code: HazardFactorCode,
    level: string,
    rankIndex: number,
    label = level,
  ): FactorReading {
    return {
      code,
      level,
      label,
      rankIndex,
      basis: `${level} basis`,
      inputRef: level,
    };
  }
  function member(
    label: string,
    energy: string | null,
    readings: readonly FactorReading[],
  ): GroupMember {
    return {
      id: `id-${label}`,
      label,
      ratedEnergyWh: energy,
      readings: new Map(readings.map((r) => [r.code, r])),
    };
  }

  it("takes each factor at its batteries' highest level, and names the battery it came from", () => {
    const s = scheme();
    const readings = groupReadings(
      [
        member("BR-1", "500.000", [
          reading("damage_indicators", "none_observed", 2),
          reading("chemistry", "lithium_ion", 1),
        ]),
        member("BR-2", "700.000", [
          reading("damage_indicators", "cosmetic_only", 1),
          reading("chemistry", "alkaline", 3),
        ]),
      ],
      ["damage_indicators", "chemistry", "storage_aggregation"],
      s,
    );
    expect(readings[0]).toMatchObject({ level: "cosmetic_only", rankIndex: 1 });
    expect(readings[0]?.basis).toContain("BR-2");
    expect(readings[1]).toMatchObject({ level: "lithium_ion", rankIndex: 1 });
    // 1,200 Wh held together: the 1 kWh band.
    expect(readings[2]?.level).toBe("energy_band_moderate");
  });

  it('reads aggregation "Not fully recorded", level with the highest band, when any energy is unknown', () => {
    const readings = groupReadings(
      [member("BR-1", "100.000", []), member("BR-2", null, [])],
      ["storage_aggregation"],
      scheme(),
    );
    expect(readings[0]).toMatchObject({
      level: NOT_RECORDED_LEVEL,
      label: "Not fully recorded",
      rankIndex: 0,
    });
    expect(readings[0]?.basis).toContain("BR-2");
  });
});

describe('what "Changed since" and "Not ranked yet" mean (Rule 10.24)', () => {
  const held = { isHeld: true, isEmpty: false, inputsSignature: "sig" };
  const row = { schemeVersion: "v1", inputsSignature: "sig" };

  it("reads each standing", () => {
    expect(
      hazardRankingStanding({ row, current: held, schemeVersion: "v1" }),
    ).toBe("ranked");
    expect(
      hazardRankingStanding({
        row,
        current: { ...held, inputsSignature: "other" },
        schemeVersion: "v1",
      }),
    ).toBe("changed_since");
    expect(
      hazardRankingStanding({ row, current: held, schemeVersion: "v2" }),
    ).toBe("changed_since");
    expect(
      hazardRankingStanding({
        row,
        current: { ...held, isHeld: false },
        schemeVersion: "v1",
      }),
    ).toBe("changed_since");
    expect(
      hazardRankingStanding({ row: null, current: held, schemeVersion: "v1" }),
    ).toBe("not_ranked_yet");
    expect(
      hazardRankingStanding({
        row: null,
        current: { isHeld: true, isEmpty: true, inputsSignature: null },
        schemeVersion: "v1",
      }),
    ).toBe("empty");
    expect(
      hazardRankingStanding({
        row: null,
        current: undefined,
        schemeVersion: "v1",
      }),
    ).toBe("not_held");
  });
});

describe("Cascade's fixtures and a real run (b2-11 fixtures)", () => {
  const inputs = gatherHazardRankingInputs(
    {
      organizations: FIXTURES.organizations,
      users: FIXTURES.users,
      batteryRecords: FIXTURES.batteryRecords,
      catalogEntries: FIXTURES.catalogEntries,
      damageAssessments: FIXTURES.damageAssessments,
      recallMatches: FIXTURES.recallMatches,
      recallCheckRuns: FIXTURES.recallCheckRuns,
      containers: FIXTURES.containers,
      lots: FIXTURES.lots,
    },
    ORG.cascade,
  );
  const run = computeHazardRanking(
    inputs,
    scheme(),
    FIXTURES.SEEDED_RANKING_AT,
  );

  it("ranks only held inventory, each kind against its own (Rule 10.19)", () => {
    const batteries = run.rows.filter(
      (row) => row.scopeType === "battery_record",
    );
    expect(batteries.map((row) => row.itemLabel)).not.toContain("BR-0004");
    expect(
      batteries.every((row) => row.rankedSetSize === batteries.length),
    ).toBe(true);
    // Empty containers and lots are not compared and get no row (Rule 10.22).
    expect(run.rows.map((row) => row.itemLabel)).not.toContain("C-0003");
    expect(run.rows.map((row) => row.itemLabel)).not.toContain("L-0002");
  });

  it('shows every level of every battery factor, and "Not recorded" for each', () => {
    const s = scheme();
    const batteries = run.rows.filter(
      (row) => row.scopeType === "battery_record",
    );
    for (const code of s.factorOrder.battery_record) {
      const seen = new Set(
        batteries.flatMap((row) =>
          row.factors
            .filter((entry) => entry.code === code)
            .map((entry) => entry.level),
        ),
      );
      const expected = [
        ...schemeFactor(s, code).levels.map((level) => level.level),
        NOT_RECORDED_LEVEL,
      ];
      expect([...seen].sort(), code).toEqual([...expected].sort());
    }
  });

  it('shows every aggregation band among the containers, and "Not fully recorded"', () => {
    const s = scheme();
    const seen = new Set(
      run.rows
        .filter((row) => row.scopeType === "container")
        .flatMap((row) =>
          row.factors
            .filter((entry) => entry.code === "storage_aggregation")
            .map((entry) => entry.level),
        ),
    );
    expect([...seen].sort()).toEqual(
      [
        ...schemeFactor(s, "storage_aggregation").levels.map((l) => l.level),
        NOT_RECORDED_LEVEL,
      ].sort(),
    );
  });

  it("holds the level pair level, at one position", () => {
    const pair = run.rows.filter((row) =>
      ["BR-0019", "BR-0020"].includes(row.itemLabel),
    );
    expect(pair).toHaveLength(2);
    expect(pair[0]?.rankPosition).toBe(pair[1]?.rankPosition);
    expect(pair[0]?.levelWithCount).toBeGreaterThanOrEqual(1);
  });

  it("ranks a damaged record above a sound one of the same chemistry", () => {
    const position = (label: string) =>
      run.rows.find((row) => row.itemLabel === label)?.rankPosition ?? 0;
    // BR-0003 is a swollen lithium-ion pack; BR-0001 lithium-ion, none observed.
    expect(position("BR-0003")).toBeLessThan(position("BR-0001"));
  });

  it("is `not_ranked` for an organization with exactly one held battery", () => {
    const rainier = computeHazardRanking(
      gatherHazardRankingInputs(
        {
          organizations: FIXTURES.organizations,
          users: FIXTURES.users,
          batteryRecords: FIXTURES.batteryRecords,
          catalogEntries: FIXTURES.catalogEntries,
          damageAssessments: FIXTURES.damageAssessments,
          recallMatches: FIXTURES.recallMatches,
          recallCheckRuns: FIXTURES.recallCheckRuns,
          containers: FIXTURES.containers,
          lots: FIXTURES.lots,
        },
        ORG.rainier,
      ),
      scheme(),
      FIXTURES.SEEDED_RANKING_AT,
    );
    expect(rainier.rows).toHaveLength(1);
    expect(rainier.rows[0]).toMatchObject({
      band: "not_ranked",
      rankPosition: 1,
      rankedSetSize: 1,
    });
    expect(rainier.rows[0]?.basisStatement).toContain("only held battery");
  });

  it("writes `order`, never a weight, on every factor", () => {
    for (const row of run.rows) {
      row.factors.forEach((entry, index) => {
        expect(entry.order).toBe(index + 1);
        expect(Object.keys(entry).sort()).toEqual([
          "basis",
          "code",
          "level",
          "order",
          "value",
        ]);
      });
    }
  });
});

describe("ordinals", () => {
  it("reads like English", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(
      [
        "1st",
        "2nd",
        "3rd",
        "4th",
        "11th",
        "12th",
        "13th",
        "21st",
        "22nd",
        "23rd",
        "101st",
        "111th",
      ],
    );
  });
});
