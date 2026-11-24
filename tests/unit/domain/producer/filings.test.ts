import { describe, expect, it } from "vitest";

import * as FIXTURES from "@/data/mock/fixtures";
import { JURISDICTION } from "@/data/mock/fixtures/ids";
import {
  FILINGS_RULE_KEY,
  FILINGS_SCHEMA_KEY,
  OBLIGATIONS_RULE_KEY,
  parseFilingsPayload,
  parseObligationsPayload,
  periodWords,
  pickableYears,
  productPlan,
  resolvePeriod,
  unanchoredFilings,
  type FilingsPayload,
  type PlanObligation,
} from "@/domain/producer";

/**
 * Filings as rule data — Rules 8.18, 8.21, 8.23; T-71; D-81. "Today" is
 * pinned in every case: dates move, and the e2e suite asserts only shapes.
 */

const TODAY = "2026-11-24";

function filingsVersions() {
  const rules = new Map(
    FIXTURES.jurisdictionRules
      .filter((rule) => rule.ruleKey === FILINGS_RULE_KEY)
      .map((rule) => [rule.id, rule]),
  );
  return FIXTURES.ruleVersions.flatMap((version) => {
    const rule = rules.get(version.jurisdictionRuleId);
    return rule === undefined ? [] : [{ rule, version }];
  });
}

function parsed(payload: unknown): FilingsPayload {
  const result = parseFilingsPayload(payload);
  if (!result.ok) throw new Error(result.issues.join("; "));
  return result.payload;
}

/** The same state's obligations version in force on a day. */
function obligationsOn(jurisdictionId: string, day: string) {
  const rule = FIXTURES.jurisdictionRules.find(
    (row) =>
      row.ruleKey === OBLIGATIONS_RULE_KEY &&
      row.jurisdictionId === jurisdictionId,
  );
  const version = FIXTURES.ruleVersions.find(
    (row) =>
      row.jurisdictionRuleId === rule?.id &&
      row.effectiveOn <= day &&
      (row.expiresOn === null || row.expiresOn > day),
  );
  const result = parseObligationsPayload(version?.payload);
  if (!result.ok) throw new Error(result.issues.join("; "));
  return result.payload;
}

const FILING = {
  obligationKey: "annual_report",
  documentType: "annual_report",
  title: "Annual report",
  sendTo: "the Secretary",
  period: { kind: "calendar_years_before_due", count: 3 },
  items: [{ source: "weight", label: "Sales by weight", citation: "§ 1" }],
  citation: "§ 1",
  citationUrl: "https://example.test",
};

describe("every Appendix B version parses and names a real obligation (Rule 8.18)", () => {
  const versions = filingsVersions();

  it("covers exactly VT, CT, ME, CA, CO and NJ, one version each", () => {
    expect(versions.map(({ rule }) => rule.jurisdictionId).sort()).toEqual(
      [
        JURISDICTION.vermont,
        JURISDICTION.connecticut,
        JURISDICTION.maine,
        JURISDICTION.california,
        JURISDICTION.colorado,
        JURISDICTION.newJersey,
      ].sort(),
    );
    for (const { rule, version } of versions) {
      expect(rule.domain).toBe("producer_obligation");
      expect(version.payloadSchemaKey).toBe(FILINGS_SCHEMA_KEY);
      expect(version.citation.trim()).not.toBe("");
    }
  });

  it("parses each, and each filing's obligation is in the state's obligations rule in force", () => {
    for (const { rule, version } of versions) {
      const filings = parsed(version.payload);
      const obligations = obligationsOn(
        rule.jurisdictionId,
        version.effectiveOn,
      );
      expect(unanchoredFilings(filings, obligations)).toEqual([]);
    }
  });

  it("is dated as its state's obligations version (Appendix B)", () => {
    for (const { rule, version } of versions) {
      const obligations = FIXTURES.ruleVersions.find(
        (row) =>
          row.effectiveOn === version.effectiveOn &&
          FIXTURES.jurisdictionRules.some(
            (candidate) =>
              candidate.id === row.jurisdictionRuleId &&
              candidate.ruleKey === OBLIGATIONS_RULE_KEY &&
              candidate.jurisdictionId === rule.jurisdictionId,
          ),
      );
      expect(obligations).toBeDefined();
    }
  });

  it("carries a citation on every item, prints not_held by name, and quotes the one statement", () => {
    const filings = versions.flatMap(
      ({ version }) => parsed(version.payload).filings,
    );
    expect(filings).toHaveLength(10);
    for (const filing of filings) {
      for (const item of filing.items) {
        expect(item.citation.trim()).not.toBe("");
        expect(item.label.trim()).not.toBe("");
      }
    }
    const statements = filings.flatMap((filing) =>
      filing.items.filter((item) => item.source === "statement"),
    );
    expect(statements).toHaveLength(1);
    expect(statements[0]?.text).toMatch(/section 42464\(b\)\.$/u);
  });

  it("names each annual report's period as the law does — VT three years, CA and CO one, NJ picked", () => {
    const periods = Object.fromEntries(
      versions.flatMap(({ rule, version }) =>
        parsed(version.payload)
          .filings.filter((filing) => filing.documentType === "annual_report")
          .map((filing) => [
            `${rule.jurisdictionId}:${filing.obligationKey}`,
            filing.period,
          ]),
      ),
    );
    expect(periods[`${JURISDICTION.vermont}:annual_report`]).toEqual({
      kind: "calendar_years_before_due",
      count: 3,
    });
    expect(periods[`${JURISDICTION.california}:sb1215_report`]).toEqual({
      kind: "calendar_years_before_due",
      count: 1,
    });
    expect(periods[`${JURISDICTION.colorado}:ev_annual_report`]).toEqual({
      kind: "calendar_years_before_due",
      count: 1,
    });
    expect(periods[`${JURISDICTION.newJersey}:ev_annual_report`]).toEqual({
      kind: "chosen_year",
    });
  });

  it("gives no packet to a plan the producer writes (NJ, CO)", () => {
    const keys = versions.flatMap(({ version }) =>
      parsed(version.payload).filings.map((filing) => filing.obligationKey),
    );
    expect(keys).not.toContain("ev_plan");
    expect(keys).not.toContain("dry_cell_plan");
    expect(keys).not.toContain("ev_outreach_plan");
  });
});

describe("producer.filings.v1 refuses what it can't read (Rule 8.18)", () => {
  it("accepts a well-formed filing", () => {
    expect(parseFilingsPayload({ filings: [FILING] }).ok).toBe(true);
  });

  it("refuses a statement with no text, and text on anything but a statement", () => {
    expect(
      parseFilingsPayload({
        filings: [
          {
            ...FILING,
            items: [{ source: "statement", label: "Fee", citation: "§ 2" }],
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      parseFilingsPayload({
        filings: [
          {
            ...FILING,
            items: [
              { source: "units", label: "Units", citation: "§ 2", text: "x" },
            ],
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it("refuses an annual report with no period, and a packet with one", () => {
    expect(
      parseFilingsPayload({
        filings: [{ ...FILING, period: { kind: "none" } }],
      }).ok,
    ).toBe(false);
    expect(
      parseFilingsPayload({
        filings: [{ ...FILING, documentType: "filing_packet" }],
      }).ok,
    ).toBe(false);
  });

  it("refuses an unknown item source, a missing citation and a repeated obligation", () => {
    expect(
      parseFilingsPayload({
        filings: [
          {
            ...FILING,
            items: [{ source: "tax_id", label: "x", citation: "§" }],
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      parseFilingsPayload({
        filings: [{ ...FILING, items: [{ source: "units", label: "Units" }] }],
      }).ok,
    ).toBe(false);
    expect(parseFilingsPayload({ filings: [FILING, FILING] }).ok).toBe(false);
  });
});

describe("the period (Rule 8.21)", () => {
  it("is the calendar years before the deadline's year, where the law says so", () => {
    const resolution = resolvePeriod(
      { kind: "calendar_years_before_due", count: 3 },
      "2027-03-01",
      null,
    );
    expect(resolution).toMatchObject({
      ok: true,
      period: { years: [2024, 2025, 2026], dueYear: 2027 },
    });
    if (!resolution.ok) return;
    expect(periodWords(resolution.period)).toBe(
      "Calendar years 2024, 2025 and 2026: the 3 calendar years before the deadline's year (2027), as the filing rule names them.",
    );
  });

  it("is never guessed where the law names none: no year picked, no period", () => {
    expect(resolvePeriod({ kind: "chosen_year" }, "2027-01-08", null)).toEqual({
      ok: false,
      reason: "year_not_chosen",
    });
  });

  it("says who picked the year, and that the law doesn't state one", () => {
    const resolution = resolvePeriod({ kind: "chosen_year" }, "2027-01-08", {
      year: 2025,
      chosenByUserId: "u-1",
      chosenByName: "Priya Narang",
    });
    if (!resolution.ok) throw new Error("expected a period");
    expect(resolution.period.years).toEqual([2025]);
    expect(periodWords(resolution.period)).toBe(
      "Calendar year 2025, picked by Priya Narang when making this packet. The law doesn't state a period.",
    );
  });

  it("offers the latest full calendar year and the four before it, and no default", () => {
    expect(pickableYears(TODAY)).toEqual([2025, 2024, 2023, 2022, 2021]);
  });
});

describe("a product's plan (Rule 8.23)", () => {
  const base = {
    citation: "§ 1",
    status: "applies",
    productTruth: "true",
    due: null,
  } as const satisfies Partial<PlanObligation>;
  const obligations: PlanObligation[] = [
    {
      ...base,
      obligationId: "o-mark",
      stateName: "Washington",
      stateCode: "US-WA",
      duty: "Mark it.",
    },
    {
      ...base,
      obligationId: "o-join",
      stateName: "Illinois",
      stateCode: "US-IL",
      duty: "Join a plan.",
    },
    {
      ...base,
      obligationId: "o-later",
      stateName: "Maine",
      stateCode: "US-ME",
      duty: "Join when a plan is approved.",
      due: { kind: "no_date", event: "180 days after the first plan" },
    },
    {
      ...base,
      obligationId: "o-other",
      stateName: "Iowa",
      stateCode: "US-IA",
      duty: "Not this product.",
      productTruth: "false",
    },
    {
      ...base,
      obligationId: "o-maybe",
      stateName: "Oregon",
      stateCode: "US-OR",
      duty: "Maybe.",
      status: "undetermined",
      productTruth: "cant_tell",
      due: { kind: "statutory_date", on: "2027-07-01" },
    },
  ];
  const plan = productPlan({
    today: TODAY,
    obligations,
    deadlines: [
      {
        deadlineId: "d-mark",
        obligationId: "o-mark",
        dueOn: "2028-01-01",
        status: "open",
      },
      {
        deadlineId: "d-join-old",
        obligationId: "o-join",
        dueOn: "2026-01-01",
        status: "completed",
      },
      {
        deadlineId: "d-join-new",
        obligationId: "o-join",
        dueOn: "2027-01-01",
        status: "open",
      },
      {
        deadlineId: "d-gone",
        obligationId: "o-join",
        dueOn: "2026-06-01",
        status: "withdrawn",
      },
    ],
  });

  it("lists every duty that applies to it, earliest date first, marking with the rest", () => {
    expect(
      plan.entries.map((entry) => entry.deadlineId ?? entry.obligationId),
    ).toEqual(["d-join-old", "d-join-new", "d-mark", "o-later"]);
    expect(plan.entries[0]).toMatchObject({
      standing: "completed",
      standingLabel: "Done",
    });
    expect(plan.entries[3]?.dateWords).toBe(
      "No date yet — 180 days after the first plan",
    );
  });

  it("drops what definitely doesn't apply, and lists what can't be told apart, by name", () => {
    expect(plan.entries.map((entry) => entry.obligationId)).not.toContain(
      "o-other",
    );
    expect(plan.cantTell.map((entry) => entry.obligationId)).toEqual([
      "o-maybe",
    ]);
    expect(plan.cantTell[0]?.dateWords).toBe("1 Jul 2027");
  });
});
