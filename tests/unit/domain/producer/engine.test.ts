import { describe, expect, it } from "vitest";

import * as FIXTURES from "@/data/mock/fixtures";
import { JURISDICTION, ORG, PRODUCER_PRODUCT } from "@/data/mock/fixtures/ids";
import { gatherProducerInputs } from "@/data/mock/producer-inputs";
import {
  COVERAGE_SCHEMA_KEY,
  deadlineAlertTier,
  deadlineAlertKey,
  deadlineOfAlertKey,
  deadlinesFor,
  deadlineStanding,
  evaluateCondition,
  evaluateProducerObligations,
  OBLIGATIONS_SCHEMA_KEY,
  parseCoveragePayload,
  parseObligationsPayload,
  placeInBand,
  planProducerRun,
  validateObligationAlertConfiguration,
  wantedDeadlineAlerts,
  type Condition,
  type CurrentDeadline,
  type CurrentObligation,
  type DeclaredProduct,
  type ObligationAlertConfiguration,
  type ProducerEvaluationInputs,
  type ProductFacts,
} from "@/domain/producer";
import type { RuleVersionCandidate } from "@/domain/rules/resolve";

/**
 * The producer engine's pure rules — Rules 8.8–8.13; D-78. "Today" is
 * pinned in every case: dates move, and the e2e suite asserts only shapes.
 */

const TODAY = "2026-11-16";

const FACTS: ProductFacts = {
  chemistry: "li_lfp",
  massKg: "2.000",
  energyWh: "200.000",
  removability: "user_removable",
  applicationClass: "consumer_electronics",
};

function source() {
  return {
    organizations: FIXTURES.organizations,
    producerProducts: FIXTURES.producerProducts,
    catalogEntries: FIXTURES.catalogEntries,
    jurisdictions: FIXTURES.jurisdictions,
    jurisdictionRules: FIXTURES.jurisdictionRules,
    ruleVersions: FIXTURES.ruleVersions,
    producerObligations: [],
    obligationDeadlines: [],
  };
}

function fixtureInputs(): ProducerEvaluationInputs {
  return gatherProducerInputs(source(), ORG.cascade).evaluation;
}

function withProducts(
  products: readonly DeclaredProduct[],
): ProducerEvaluationInputs {
  return { ...fixtureInputs(), products };
}

function declared(
  facts: ProductFacts,
  states: readonly (keyof typeof JURISDICTION)[],
  id = "00000000-0000-4000-8000-0000000000a1",
): DeclaredProduct {
  return {
    productId: id,
    catalogEntryId: id,
    label: "Test pack",
    facts,
    jurisdictionIds: states.map((state) => JURISDICTION[state]),
  };
}

function coverageFor(state: keyof typeof JURISDICTION, asOf = TODAY) {
  const inputs = fixtureInputs();
  const candidates = inputs.candidates.filter(
    (candidate) =>
      candidate.jurisdictionId === JURISDICTION[state] &&
      candidate.ruleKey === "producer.coverage" &&
      candidate.effectiveOn <= asOf &&
      (candidate.expiresOn === null || asOf < candidate.expiresOn),
  );
  const [version] = candidates;
  if (version === undefined) throw new Error(`no coverage for ${state}`);
  const parsed = parseCoveragePayload(version.payload);
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return { version, payload: parsed.payload };
}

describe("a condition test answers true, false or can't-tell (Rule 8.8)", () => {
  const cases: readonly {
    readonly name: string;
    readonly condition: Condition;
    readonly yes: ProductFacts;
    readonly no: ProductFacts;
    readonly unknown: ProductFacts;
    readonly missing: string;
  }[] = [
    {
      name: "mass, in the statute's unit",
      condition: { mass: { op: "lte", value: "11", unit: "lb" } },
      yes: { ...FACTS, massKg: "4.000" },
      no: { ...FACTS, massKg: "6.000" },
      unknown: { ...FACTS, massKg: null },
      missing: "mass",
    },
    {
      name: "energy",
      condition: { energy: { op: "lte", value: "300", unit: "Wh" } },
      yes: FACTS,
      no: { ...FACTS, energyWh: "301.000" },
      unknown: { ...FACTS, energyWh: null },
      missing: "energy",
    },
    {
      name: "chemistry",
      condition: { chemistryIn: ["li_lfp", "nimh"] },
      yes: FACTS,
      no: { ...FACTS, chemistry: "alkaline" },
      unknown: { ...FACTS, chemistry: "other" },
      missing: "chemistry_other",
    },
    {
      name: "removability",
      condition: { removabilityIn: ["user_removable"] },
      yes: FACTS,
      no: { ...FACTS, removability: "non_removable" },
      unknown: { ...FACTS, removability: "unknown" },
      missing: "removability",
    },
    {
      name: "application",
      condition: { applicationIn: ["consumer_electronics"] },
      yes: FACTS,
      no: { ...FACTS, applicationClass: "vehicle" },
      unknown: { ...FACTS, applicationClass: "unknown" },
      missing: "application",
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(evaluateCondition(testCase.condition, testCase.yes).truth).toBe(
        "true",
      );
      expect(evaluateCondition(testCase.condition, testCase.no).truth).toBe(
        "false",
      );
      const open = evaluateCondition(testCase.condition, testCase.unknown);
      expect(open.truth).toBe("cant_tell");
      expect(open.missing).toEqual([testCase.missing]);
    });
  }

  it("band, for an obligation", () => {
    const condition: Condition = { bandIn: ["portable"] };
    expect(
      evaluateCondition(condition, FACTS, { band: "portable", missing: [] })
        .truth,
    ).toBe("true");
    expect(
      evaluateCondition(condition, FACTS, { band: "not_covered", missing: [] })
        .truth,
    ).toBe("false");
    expect(
      evaluateCondition(condition, FACTS, {
        band: "undetermined",
        missing: ["energy"],
      }),
    ).toEqual({ truth: "cant_tell", missing: ["energy"] });
  });

  it("an unconfirmed chemistry is can't-tell, never false", () => {
    expect(
      evaluateCondition(
        { chemistryIn: ["alkaline"] },
        { ...FACTS, chemistry: "unknown" },
      ),
    ).toEqual({ truth: "cant_tell", missing: ["chemistry_unconfirmed"] });
  });

  it("all: one false settles it; otherwise a can't-tell leaves it open", () => {
    const condition: Condition = {
      all: [
        { mass: { op: "lte", value: "11", unit: "lb" } },
        { energy: { op: "lte", value: "300", unit: "Wh" } },
      ],
    };
    expect(
      evaluateCondition(condition, { ...FACTS, massKg: null, energyWh: "999" })
        .truth,
    ).toBe("false");
    expect(evaluateCondition(condition, { ...FACTS, massKg: null })).toEqual({
      truth: "cant_tell",
      missing: ["mass"],
    });
  });

  it("any: one true settles it; otherwise a can't-tell leaves it open", () => {
    const condition: Condition = {
      any: [
        { mass: { op: "gt", value: "11", unit: "lb" } },
        { energy: { op: "gt", value: "300", unit: "Wh" } },
      ],
    };
    expect(
      evaluateCondition(condition, { ...FACTS, massKg: null, energyWh: "500" })
        .truth,
    ).toBe("true");
    expect(evaluateCondition(condition, { ...FACTS, massKg: null })).toEqual({
      truth: "cant_tell",
      missing: ["mass"],
    });
  });

  it("lt and lte differ at the limit — DC's 'less than 11 pounds'", () => {
    // 11 lb exactly, as kg: 11 × 0.45359237.
    const elevenPounds = { ...FACTS, massKg: "4.98951607" };
    expect(
      evaluateCondition(
        { mass: { op: "lt", value: "11", unit: "lb" } },
        elevenPounds,
      ).truth,
    ).toBe("false");
    expect(
      evaluateCondition(
        { mass: { op: "lte", value: "11", unit: "lb" } },
        elevenPounds,
      ).truth,
    ).toBe("true");
  });
});

describe("placing a product in a band (Rule 8.8)", () => {
  it("takes the first class that holds", () => {
    const placement = placeInBand(
      { ...FACTS, chemistry: "alkaline", massKg: "0.023" },
      coverageFor("washington"),
    );
    expect(placement.result.band).toBe("portable");
    expect(placement.result.classLabel).toBe("Portable battery");
    expect(placement.ruleVersionsApplied).toHaveLength(1);
  });

  it("a can't-tell before the class that holds gives undetermined, naming the input", () => {
    // No weight: the portable class fails on energy alone, but medium cannot
    // be told — so the large class, which might also hold, is never taken.
    const placement = placeInBand(
      { ...FACTS, massKg: null, energyWh: "1280.000" },
      coverageFor("washington"),
    ).result;
    expect(placement.band).toBe("undetermined");
    expect(placement.missing).toEqual(["mass"]);
    expect(placement.band).not.toBe("not_covered");
  });

  it("is not_covered when no class holds", () => {
    expect(
      placeInBand(
        { ...FACTS, chemistry: "lead_acid_flooded" },
        coverageFor("washington"),
      ).result.band,
    ).toBe("not_covered");
  });

  it("carries the exclusions it can't test as Not checked, without changing the band", () => {
    const placement = placeInBand(FACTS, coverageFor("washington")).result;
    expect(placement.band).toBe("portable");
    expect(placement.notChecked).toEqual(["medical devices"]);
  });

  it("puts one product in a different band in WA, CT and DC", () => {
    const kestrel = fixtureInputs().products.find(
      (product) => product.productId === PRODUCER_PRODUCT.kestrelScrubberLfp,
    );
    expect(kestrel).toBeDefined();
    if (kestrel === undefined) return;
    expect(
      placeInBand(kestrel.facts, coverageFor("washington")).result.band,
    ).toBe("large_format");
    expect(
      placeInBand(kestrel.facts, coverageFor("connecticut")).result.band,
    ).toBe("medium_format");
    expect(
      placeInBand(kestrel.facts, coverageFor("districtOfColumbia")).result.band,
    ).toBe("not_covered");
  });

  it("reads Connecticut's 4 lb 6 oz primary limit as 4.375 lb", () => {
    const primary = { ...FACTS, chemistry: "alkaline" as const };
    // 4.4 lb: portable in Washington, medium in Connecticut.
    const fourPointFour = { ...primary, massKg: "1.995806428" };
    expect(
      placeInBand(fourPointFour, coverageFor("washington")).result.band,
    ).toBe("portable");
    expect(
      placeInBand(fourPointFour, coverageFor("connecticut")).result.band,
    ).toBe("medium_format");
  });

  it("picks California's coverage version by date and keeps both", () => {
    const facts = { ...FACTS, energyWh: "500.000", massKg: "3.000" };
    expect(
      placeInBand(facts, coverageFor("california", "2026-12-31")).result
        .classLabel,
    ).toBe("Covered battery (PRC § 42420.1(d))");
    expect(
      placeInBand(facts, coverageFor("california", "2027-01-01")).result
        .classLabel,
    ).toBe("Medium format battery");
  });
});

describe("when an obligation applies (Rule 8.9)", () => {
  function obligation(
    products: readonly DeclaredProduct[],
    state: keyof typeof JURISDICTION,
    key: string,
  ) {
    const evaluation = evaluateProducerObligations(
      withProducts(products),
      TODAY,
    );
    const found = evaluation.states
      .find((row) => row.jurisdiction.id === JURISDICTION[state])
      ?.obligations.find((row) => row.key === key);
    if (found === undefined) throw new Error(`no ${key} in ${state}`);
    return found;
  }

  const alkaline = {
    ...FACTS,
    chemistry: "alkaline" as const,
    massKg: "0.023",
  };

  it("applies when one product sold there meets it", () => {
    expect(
      obligation(
        [
          declared(alkaline, ["illinois"]),
          declared(
            { ...FACTS, chemistry: "other" },
            ["illinois"],
            "00000000-0000-4000-8000-0000000000a2",
          ),
        ],
        "illinois",
        "participate",
      ).status,
    ).toBe("applies");
  });

  it("is not_applicable only when every product sold there definitely doesn't meet it", () => {
    expect(
      obligation(
        [declared(alkaline, ["minnesota"])],
        "minnesota",
        "participate",
      ).status,
    ).toBe("not_applicable");
  });

  it("is undetermined otherwise, and names the product and the missing input", () => {
    const result = obligation(
      [declared({ ...FACTS, massKg: null, energyWh: "1280.000" }, ["oregon"])],
      "oregon",
      "participate",
    );
    expect(result.status).toBe("undetermined");
    expect(result.reasoning).toContain("Test pack");
    expect(result.reasoning).toContain("weight not recorded");
    // A gap keeps its deadlines: it is never treated as "doesn't apply".
    expect(result.deadlines.length).toBeGreaterThan(0);
  });

  it("says a state with no rules has none on file, and never that none apply", () => {
    const evaluation = evaluateProducerObligations(
      withProducts([declared(alkaline, ["florida"])]),
      TODAY,
    );
    const florida = evaluation.states[0];
    expect(florida?.onFile).toBe(false);
    expect(florida?.obligations).toEqual([]);
  });

  it("shows a version that takes effect later, with its date (Rule 8.14)", () => {
    const evaluation = evaluateProducerObligations(
      withProducts([declared(FACTS, ["california"])]),
      TODAY,
    );
    expect(
      evaluation.states[0]?.laterVersions.map((v) => v.effectiveOn),
    ).toEqual(["2027-01-01"]);
  });
});

describe("deadlines (Rule 8.10)", () => {
  it("a date in law is one deadline", () => {
    expect(
      deadlinesFor(
        "participate",
        { kind: "statutory_date", on: "2027-01-01" },
        TODAY,
      ),
    ).toEqual([
      {
        deadlineKey: "participate:2027-01-01",
        dueOn: "2027-01-01",
        dueBasis: "statutory_date",
      },
    ]);
  });

  it("a yearly date runs from the first through the next one on or after today", () => {
    const due = {
      kind: "annual",
      month: 7,
      day: 1,
      firstOn: "2025-07-01",
    } as const;
    expect(deadlinesFor("notice", due, TODAY).map((row) => row.dueOn)).toEqual([
      "2025-07-01",
      "2026-07-01",
      "2027-07-01",
    ]);
    // On the day itself, today's is the next one.
    expect(
      deadlinesFor("notice", due, "2026-07-01").map((row) => row.dueOn),
    ).toEqual(["2025-07-01", "2026-07-01"]);
    // A first date still ahead is the only one.
    expect(
      deadlinesFor(
        "report",
        { kind: "annual", month: 6, day: 1, firstOn: "2030-06-01" },
        TODAY,
      ).map((row) => row.dueOn),
    ).toEqual(["2030-06-01"]);
  });

  it("'No date yet' writes no deadline — no date is ever estimated", () => {
    expect(
      deadlinesFor(
        "participate",
        { kind: "no_date", event: "180 days after the first plan is approved" },
        TODAY,
      ),
    ).toEqual([]);
  });

  it("overdue is read from the date, never stored", () => {
    expect(
      deadlineStanding({ status: "open", dueOn: "2026-01-01" }, TODAY),
    ).toBe("overdue");
    expect(deadlineStanding({ status: "open", dueOn: TODAY }, TODAY)).toBe(
      "open",
    );
    expect(
      deadlineStanding({ status: "completed", dueOn: "2026-01-01" }, TODAY),
    ).toBe("completed");
  });
});

describe("a run (Rules 8.11, 8.12)", () => {
  const STATE = JURISDICTION.districtOfColumbia;
  const alkaline = {
    ...FACTS,
    chemistry: "alkaline" as const,
    massKg: "0.023",
  };

  function firstRun(products: readonly DeclaredProduct[]) {
    const plan = planProducerRun(
      evaluateProducerObligations(withProducts(products), TODAY),
      { obligations: [], deadlines: [] },
      "check_now",
    );
    // Give each new row an id, as the adapter would.
    const obligations: CurrentObligation[] = plan.inserts.map(
      (draft, index) => ({
        ...draft,
        id: `00000000-0000-4000-8000-00000000b${String(index).padStart(3, "0")}`,
      }),
    );
    const byRef = new Map(
      plan.inserts.map((draft, index) => [
        draft.ref,
        obligations[index]?.id ?? "",
      ]),
    );
    const deadlines: CurrentDeadline[] = plan.deadlineChanges.flatMap(
      (change, index) =>
        change.kind === "insert" && change.target.kind === "new"
          ? [
              {
                id: `00000000-0000-4000-8000-00000000c${String(index).padStart(3, "0")}`,
                producerObligationId: byRef.get(change.target.ref) ?? "",
                deadlineKey: change.deadlineKey,
                status: "open",
                governingRuleVersionId: change.governingRuleVersionId,
                citation: change.citation,
              },
            ]
          : [],
    );
    return { plan, obligations, deadlines };
  }

  it("writes nothing when nothing changed", () => {
    const products = [declared(alkaline, ["districtOfColumbia"])];
    const { obligations, deadlines } = firstRun(products);
    const again = planProducerRun(
      evaluateProducerObligations(withProducts(products), TODAY),
      { obligations, deadlines },
      "check_now",
    );
    expect(again.inserts).toEqual([]);
    expect(again.retire).toEqual([]);
    expect(again.deadlineChanges).toEqual([]);
    expect(again.counts.unchanged).toBe(1);
  });

  it("keeps a completion when the result changes and the deadline is carried", () => {
    const products = [declared(alkaline, ["districtOfColumbia"])];
    const { obligations, deadlines } = firstRun(products);
    const done = deadlines.map((row) => ({
      ...row,
      status: "completed" as const,
    }));
    // A second product changes the obligation's result, so a new row is written.
    const more = [
      ...products,
      declared(
        { ...FACTS, massKg: "1.000" },
        ["districtOfColumbia"],
        "00000000-0000-4000-8000-0000000000a3",
      ),
    ];
    const plan = planProducerRun(
      evaluateProducerObligations(withProducts(more), TODAY),
      { obligations, deadlines: done },
      "product_added",
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.retire).toEqual([obligations[0]?.id]);
    expect(plan.deadlineChanges).toEqual([
      expect.objectContaining({ kind: "update", status: "completed" }),
    ]);
  });

  it("withdraws only the open deadlines of an obligation that stops applying; done ones stay done", () => {
    const products = [declared(alkaline, ["districtOfColumbia", "illinois"])];
    const { obligations, deadlines } = firstRun(products);
    const dc = obligations.find((row) => row.jurisdictionId === STATE);
    const marked = deadlines.map((row) =>
      row.producerObligationId === dc?.id
        ? { ...row, status: "completed" as const }
        : row,
    );
    // Sold in neither state any more: both obligations stop applying.
    const plan = planProducerRun(
      evaluateProducerObligations(
        withProducts([declared(alkaline, ["washington"])]),
        TODAY,
      ),
      { obligations, deadlines: marked },
      "product_changed",
    );
    const statuses = plan.deadlineChanges.flatMap((change) =>
      change.kind === "update" ? [[change.id, change.status] as const] : [],
    );
    for (const [id, status] of statuses) {
      const before = marked.find((row) => row.id === id);
      expect(status).toBe(
        before?.status === "completed" ? "completed" : "withdrawn",
      );
    }
    expect(plan.counts.withdrawn).toBeGreaterThan(0);
    expect(
      plan.inserts.filter((draft) => draft.status === "not_applicable").length,
    ).toBeGreaterThan(0);
  });
});

describe("every Appendix A version parses (Rule 8.7)", () => {
  const producerVersions = FIXTURES.ruleVersions.filter(
    (version) =>
      version.payloadSchemaKey === COVERAGE_SCHEMA_KEY ||
      version.payloadSchemaKey === OBLIGATIONS_SCHEMA_KEY,
  );

  it("has fifteen jurisdictions, two rules each, and California's coverage twice", () => {
    expect(producerVersions).toHaveLength(31);
    expect(
      new Set(
        FIXTURES.jurisdictionRules
          .filter((rule) => rule.ruleKey.startsWith("producer."))
          .map((rule) => rule.jurisdictionId),
      ).size,
    ).toBe(15);
  });

  for (const version of producerVersions) {
    it(`${version.citation.slice(0, 40)} · ${version.payloadSchemaKey}`, () => {
      const parsed =
        version.payloadSchemaKey === COVERAGE_SCHEMA_KEY
          ? parseCoveragePayload(version.payload)
          : parseObligationsPayload(version.payload);
      expect(parsed.ok ? [] : parsed.issues).toEqual([]);
    });
  }

  it("refuses a misspelled test rather than ignoring it", () => {
    const parsed = parseCoveragePayload({
      classes: [
        {
          key: "x",
          label: "X",
          band: "portable",
          citation: "x",
          when: { masss: { op: "lte", value: "1", unit: "lb" } },
        },
      ],
      notChecked: [],
    });
    expect(parsed.ok).toBe(false);
  });

  it("refuses a band test in a coverage class", () => {
    expect(
      parseCoveragePayload({
        classes: [
          {
            key: "x",
            label: "X",
            band: "portable",
            citation: "x",
            when: { bandIn: ["portable"] },
          },
        ],
        notChecked: [],
      }).ok,
    ).toBe(false);
  });

  it("has jurisdiction rows for all 50 states and DC", () => {
    expect(
      FIXTURES.jurisdictions.filter((row) => row.level === "state"),
    ).toHaveLength(51);
  });
});

describe("deadline alerts (Rule 8.13)", () => {
  const configuration = (): ObligationAlertConfiguration => {
    const validation = validateObligationAlertConfiguration({
      configurationVersion: "test",
      daysBefore: [90, 30, 7],
      overdue: true,
    });
    if (!validation.ok) throw new Error(validation.issues.join("; "));
    return validation.configuration;
  };

  it("names one tier at a time: the nearest notice opened, or overdue", () => {
    expect(deadlineAlertTier("2027-03-01", TODAY, configuration())).toBeNull();
    expect(deadlineAlertTier("2027-01-01", TODAY, configuration())).toBe(90);
    expect(deadlineAlertTier("2026-12-01", TODAY, configuration())).toBe(30);
    expect(deadlineAlertTier("2026-11-20", TODAY, configuration())).toBe(7);
    expect(deadlineAlertTier(TODAY, TODAY, configuration())).toBe(7);
    expect(deadlineAlertTier("2026-11-15", TODAY, configuration())).toBe(
      "overdue",
    );
  });

  it("wants no alert for a done deadline or an obligation that doesn't apply", () => {
    const subject = {
      deadlineId: "00000000-0000-4000-8000-0000000000d1",
      dueOn: "2026-01-01",
      deadlineStatus: "open" as const,
      obligationStatus: "applies" as const,
      stateName: "Illinois",
      jurisdictionCode: "US-IL",
      duty: "Join an approved battery stewardship plan.",
      citation: "415 ILCS 205/15",
      cantTellNote: null,
    };
    const [overdue] = wantedDeadlineAlerts([subject], configuration(), TODAY);
    expect(overdue?.severity).toBe("critical");
    expect(overdue?.dedupeKey).toBe(
      deadlineAlertKey(subject.deadlineId, "overdue"),
    );
    expect(deadlineOfAlertKey(overdue?.dedupeKey ?? "")).toBe(
      subject.deadlineId,
    );
    expect(
      wantedDeadlineAlerts(
        [{ ...subject, deadlineStatus: "completed" }],
        configuration(),
        TODAY,
      ),
    ).toEqual([]);
    expect(
      wantedDeadlineAlerts(
        [{ ...subject, obligationStatus: "not_applicable" }],
        configuration(),
        TODAY,
      ),
    ).toEqual([]);
  });

  it("refuses a configuration that would quietly stop every reminder", () => {
    expect(
      validateObligationAlertConfiguration({
        configurationVersion: "x",
        daysBefore: [],
        overdue: true,
      }).ok,
    ).toBe(false);
    expect(
      validateObligationAlertConfiguration({
        configurationVersion: "x",
        daysBefore: [7, 30],
        overdue: true,
      }).ok,
    ).toBe(false);
  });
});

describe("the seeded run (spec §6)", () => {
  it("shows every T-06 band and every T-68 status", () => {
    const evaluation = evaluateProducerObligations(fixtureInputs(), TODAY);
    const bands = new Set(
      evaluation.states.flatMap((state) =>
        state.onFile ? state.products.map((product) => product.band) : [],
      ),
    );
    expect([...bands].sort()).toEqual(
      [
        "large_format",
        "medium_format",
        "not_covered",
        "portable",
        "undetermined",
      ].sort(),
    );
    const statuses = new Set(
      evaluation.states.flatMap((state) =>
        state.obligations.map((row) => row.status),
      ),
    );
    expect([...statuses].sort()).toEqual(
      ["applies", "not_applicable", "undetermined"].sort(),
    );
  });

  it("reads every candidate as published, with its version", () => {
    const candidates: readonly RuleVersionCandidate[] =
      fixtureInputs().candidates;
    expect(
      candidates.every((candidate) => candidate.publishedAt !== null),
    ).toBe(true);
  });
});
