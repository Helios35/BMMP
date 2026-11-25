import { describe, expect, it } from "vitest";

import {
  buildFilingPacketContent,
  buildFilingPacketPayload,
  gapLineText,
  totalLineText,
  type FilingLine,
  type FilingPacketContent,
  type FilingPacketInputs,
  type FilingProduct,
} from "@/domain/documents/build-filing-packet-payload";
import { documentIdentity } from "@/domain/documents/document-identity";
import {
  NOT_HELD_HERE,
  NOT_THE_FILING,
  resolvePeriod,
  type FilingDefinition,
  type ResolvedPeriod,
} from "@/domain/producer";

/**
 * One builder for both packet types — `TECHNICAL_SPEC.md` §8.5; Rules
 * 8.19–8.21. Synthetic inputs, so every case is the rule it names; the
 * fixtures' packets are covered by the integration suite.
 */

const VERSION = {
  jurisdictionRuleId: "rule-filings",
  ruleVersionId: "version-filings",
  ruleKey: "producer.filings",
  versionLabel: "2024-07-01",
  effectiveOn: "2024-07-01",
  citation: "Test Act § 1",
  citationUrl: null,
};

function product(overrides: Partial<FilingProduct> = {}): FilingProduct {
  return {
    productId: "p-aa",
    catalogEntryId: "c-aa",
    label: "Tidewater TW-AA4",
    manufacturerName: "Tidewater Cell Co.",
    brandName: "Tidewater",
    modelName: "TW-AA4",
    partNumber: "TW-AA4-LR6",
    gtin: "00012345678905",
    chemistry: "alkaline",
    massKg: "0.023",
    truth: "true",
    missing: [],
    ...overrides,
  };
}

function filing(overrides: Partial<FilingDefinition> = {}): FilingDefinition {
  return {
    obligationKey: "annual_report",
    documentType: "annual_report",
    title: "Annual report (§ 1)",
    sendTo: "the Secretary",
    period: { kind: "calendar_years_before_due", count: 3 },
    items: [
      { source: "producer_identity", label: "Producer", citation: "§ 1(a)" },
      { source: "weight", label: "Sales by weight", citation: "§ 1(a)(3)" },
      {
        source: "not_held",
        label: "Collection figures",
        citation: "§ 1(a)(1)",
      },
    ],
    citation: "§ 1",
    citationUrl: null,
    ...overrides,
  };
}

function periodOf(
  rule: FilingDefinition["period"],
  dueOn: string,
): ResolvedPeriod {
  const resolution = resolvePeriod(rule, dueOn, null);
  if (!resolution.ok) throw new Error("expected a period");
  return resolution.period;
}

function inputs(
  overrides: Partial<FilingPacketInputs> = {},
): FilingPacketInputs {
  const definition = overrides.filing ?? filing();
  return {
    filing: definition,
    filingsVersion: VERSION,
    obligation: {
      id: "obligation-1",
      key: definition?.obligationKey ?? "annual_report",
      duty: "Annual report to the Agency.",
      citation: "Act § 4(d)",
      status: "applies",
      missing: [],
      version: {
        ...VERSION,
        ruleKey: "producer.obligations",
        ruleVersionId: "version-obligations",
      },
    },
    state: { jurisdictionId: "j-vt", code: "US-VT", name: "Vermont" },
    deadline: { id: "deadline-1", dueOn: "2027-03-01" },
    // A picked year comes in as an override; it is never defaulted here.
    period:
      overrides.period ??
      periodOf(definition?.period ?? { kind: "none" }, "2027-03-01"),
    organization: {
      id: "org-1",
      name: "Cascade Auto Recyclers",
      legalName: "Cascade Auto Recyclers LLC",
      primaryAddress: {
        line1: "1420 Industrial Way SW",
        line2: null,
        city: "Tumwater",
        region: "WA",
        postalCode: "98512",
        country: "US",
      },
      mailingAddress: null,
    },
    contact: {
      userId: "u-priya",
      name: "Priya Narang",
      email: "priya@example.test",
    },
    products: [product()],
    sales: [
      {
        id: "s-2024",
        productId: "p-aa",
        year: 2024,
        units: 4_350,
        basisNote: "2024 report",
      },
      {
        id: "s-2025",
        productId: "p-aa",
        year: 2025,
        units: 4_800,
        basisNote: "2025 report",
      },
    ],
    ...overrides,
  };
}

function content(input: FilingPacketInputs): FilingPacketContent {
  const build = buildFilingPacketContent(input);
  if (!build.ok) throw new Error(build.words);
  return build.outcome.result;
}

function lines(
  packet: FilingPacketContent,
  source: string,
): readonly FilingLine[] {
  return packet.items.find((item) => item.source === source)?.lines ?? [];
}

describe("VT's three years: a total with a gap says how many entries are missing (Rule 8.20)", () => {
  const packet = content(inputs());

  it("reads the three calendar years before the deadline's year", () => {
    expect(packet.period.years).toEqual([2024, 2025, 2026]);
  });

  it("weighs units × the catalog's mass, and names the missing year as Not on file", () => {
    const weight = lines(packet, "weight");
    expect(weight).toContainEqual({
      kind: "value",
      text: "Tidewater TW-AA4, 2024: 4,350 units × 0.023 kg = 100.05 kg",
    });
    expect(weight).toContainEqual({
      kind: "gap",
      what: "Tidewater TW-AA4, 2026: units",
      fixer:
        "A Producer Compliance Officer or an Admin can record it on the Sales tab.",
    });
    const total = weight.find((line) => line.kind === "total");
    expect(total).toEqual({
      kind: "total",
      text: "Alkaline (primary), 2024–2026: 210.45 kg",
      missing: 1,
    });
    if (total?.kind !== "total") throw new Error("expected a total");
    expect(totalLineText(total)).toBe(
      "Alkaline (primary), 2024–2026: 210.45 kg — 1 entry missing — not complete",
    );
  });

  it("records the entries it read, by id, and counts the gaps", () => {
    expect(packet.inputs.salesEntryIds).toEqual(["s-2024", "s-2025"]);
    expect(packet.gaps).toMatchObject({ notOnFile: 1, notHeld: 1 });
  });

  it("prints a not-held item by name, and says the packet is not the filing", () => {
    expect(lines(packet, "not_held")).toEqual([
      { kind: "not_held", text: NOT_HELD_HERE },
    ]);
    expect(packet.items.map((item) => item.label)).toContain(
      "Collection figures",
    );
    expect(packet.notTheFiling).toBe(NOT_THE_FILING);
    expect(packet.sendToWords).toBe("Send it to: the Secretary");
  });
});

describe("a gap is never zero (Rules 8.17, 8.20)", () => {
  const units = filing({
    obligationKey: "report",
    period: { kind: "calendar_years_before_due", count: 1 },
    items: [{ source: "units", label: "Units sold", citation: "§ 2" }],
  });

  it("a missing entry is Not on file, and a total no entry reached is Not on file — never 0", () => {
    const packet = content(
      inputs({
        filing: units,
        period: periodOf(units.period, "2027-07-01"),
        sales: [],
      }),
    );
    expect(lines(packet, "units")).toEqual([
      {
        kind: "gap",
        what: "Tidewater TW-AA4, 2026: units",
        fixer:
          "A Producer Compliance Officer or an Admin can record it on the Sales tab.",
      },
      { kind: "total", text: "Total, 2026: Not on file", missing: 1 },
    ]);
  });

  it("zero is an entry someone typed — a value, not a gap", () => {
    const packet = content(
      inputs({
        filing: units,
        period: periodOf(units.period, "2027-07-01"),
        sales: [
          {
            id: "s-0",
            productId: "p-aa",
            year: 2026,
            units: 0,
            basisNote: "none sold",
          },
        ],
      }),
    );
    expect(lines(packet, "units")).toEqual([
      { kind: "value", text: "Tidewater TW-AA4, 2026: 0 units" },
      { kind: "total", text: "Total, 2026: 0 units", missing: 0 },
    ]);
    expect(packet.gaps.notOnFile).toBe(0);
  });

  it("a catalog entry with no weight is a gap for that line, and its entries count as missing", () => {
    const packet = content(inputs({ products: [product({ massKg: null })] }));
    const weight = lines(packet, "weight");
    expect(weight).toContainEqual({
      kind: "gap",
      what: "Tidewater TW-AA4: weight",
      fixer: "An Admin can add the missing value to the catalog entry.",
    });
    expect(weight.find((line) => line.kind === "total")).toEqual({
      kind: "total",
      text: "Alkaline (primary), 2024–2026: Not on file",
      missing: 3,
    });
  });

  it("a product with no GTIN reads Not on file on its line (Maine's UPC)", () => {
    const products = filing({
      obligationKey: "embedded_info",
      documentType: "filing_packet",
      period: { kind: "none" },
      items: [
        {
          source: "products",
          label: "Each product: description, chemistry, UPC",
          citation: "§ 8(C)",
        },
      ],
    });
    const packet = content(
      inputs({
        filing: products,
        period: { kind: "none", years: [] },
        products: [product({ gtin: null })],
      }),
    );
    const gap = lines(packet, "products").find((line) => line.kind === "gap");
    expect(gap).toEqual({
      kind: "gap",
      what: "Tidewater TW-AA4: GTIN",
      fixer: "An Admin can add the missing value to the catalog entry.",
    });
    if (gap?.kind !== "gap") throw new Error("expected a gap");
    expect(gapLineText(gap)).toBe(
      "Tidewater TW-AA4: GTIN: Not on file. An Admin can add the missing value to the catalog entry.",
    );
  });
});

describe("NJ's period is picked and printed as picked (Rule 8.21)", () => {
  it("says who picked the year and that the law doesn't state one", () => {
    const chosen = filing({
      obligationKey: "ev_annual_report",
      period: { kind: "chosen_year" },
      items: [
        {
          source: "units",
          label: "Batteries sold into the state",
          citation: "§ 12",
        },
      ],
    });
    const resolution = resolvePeriod(chosen.period, "2027-01-08", {
      year: 2025,
      chosenByUserId: "u-priya",
      chosenByName: "Priya Narang",
    });
    if (!resolution.ok) throw new Error("expected a period");
    const packet = content(
      inputs({ filing: chosen, period: resolution.period }),
    );
    expect(packet.period).toMatchObject({
      kind: "chosen_year",
      years: [2025],
      chosenByUserId: "u-priya",
      chosenByName: "Priya Narang",
    });
    expect(packet.period.words).toContain(
      "picked by Priya Narang when making this packet",
    );
    expect(packet.period.words).toContain("The law doesn't state a period.");
  });
});

describe("no packet without an obligation that applies and a filing (Rule 8.19)", () => {
  it("an undetermined obligation gets none, and the words name the missing input", () => {
    const build = buildFilingPacketContent(
      inputs({
        obligation: {
          ...inputs().obligation,
          status: "undetermined",
          missing: ["Harbor TM-12 — weight not recorded"],
        },
      }),
    );
    expect(build).toEqual({
      ok: false,
      reason: "undetermined",
      words:
        "It can't be told yet whether this obligation applies (Harbor TM-12 — weight not recorded), so no packet can be made.",
    });
  });

  it("one that doesn't apply gets none, and nor does one with no filing in the rule data", () => {
    expect(
      buildFilingPacketContent(
        inputs({
          obligation: { ...inputs().obligation, status: "not_applicable" },
        }),
      ),
    ).toMatchObject({ ok: false, reason: "not_applicable" });
    expect(buildFilingPacketContent(inputs({ filing: null }))).toMatchObject({
      ok: false,
      reason: "no_filing",
    });
  });

  it("a product it can't be told about is a gap in every product item — never left out", () => {
    const packet = content(
      inputs({
        products: [
          product(),
          product({
            productId: "p-x",
            label: "Harbor TM-12",
            truth: "cant_tell",
            missing: ["weight not recorded"],
          }),
        ],
      }),
    );
    expect(lines(packet, "weight")).toContainEqual({
      kind: "gap",
      what: "Harbor TM-12: whether this obligation covers it (weight not recorded)",
      fixer: "An Admin can add the missing value to the catalog entry.",
    });
  });
});

describe("the render payload (TECHNICAL_SPEC.md §8.1)", () => {
  const build = buildFilingPacketContent(inputs());
  if (!build.ok) throw new Error(build.words);

  function identity(
    documentType: "annual_report" | "filing_packet",
    status: "issued" | "draft",
  ) {
    return documentIdentity({
      documentRenderId: "render-1",
      documentType,
      status,
      templateKey: "producer_filing",
      templateVersion: "1",
      renderedAt: "2026-11-24T18:00:00.000Z",
      timeZone: "America/Los_Angeles",
      producer: "test",
      draftNotice: "A draft is not a document.",
    });
  }

  it("stamps an issued identity of the same type, and cites both rule versions", () => {
    const payload = buildFilingPacketPayload({
      content: build.outcome,
      document: identity("annual_report", "issued"),
    });
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.outcome.result.document.documentRenderId).toBe("render-1");
    expect(
      payload.outcome.ruleVersionsApplied.map(
        (applied) => applied.ruleVersionId,
      ),
    ).toEqual(["version-filings", "version-obligations"]);
  });

  it("refuses a draft — a packet has none — and an identity of the other type", () => {
    expect(
      buildFilingPacketPayload({
        content: build.outcome,
        document: identity("annual_report", "draft"),
      }),
    ).toEqual({ ok: false, missing: ["document.issued_filing"] });
    expect(
      buildFilingPacketPayload({
        content: build.outcome,
        document: identity("filing_packet", "issued"),
      }),
    ).toEqual({ ok: false, missing: ["document.issued_filing"] });
  });
});
