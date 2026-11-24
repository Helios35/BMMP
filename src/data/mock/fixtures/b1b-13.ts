import type { JsonObject } from "@/types/common";
import type { ProducerSalesRecord } from "@/types/producer";
import type { JurisdictionRule, RuleVersion } from "@/types/rules-as-data";

import * as ID from "./ids";

/**
 * The rows `b1b-13-filings` adds — **added, never edited** (STATE §7.1).
 *
 * **The filings are rule data**, standing in for the reference-data
 * migrations unit 17 writes (`ERD.md` §4). Every title, "send to", period,
 * item label, citation and statement below is transcribed from
 * `SPEC_filings_2026-11-24.md` Appendix B, read 24 Nov 2026 from the sources
 * named there; a value Appendix B marks ⚑ is checked against the official
 * text again in unit 20, and each version says which in its
 * `sourceDocumentRef`. **No code reads a filing from anywhere but these rows**
 * (Rule 1.23).
 *
 * - One `producer.filings` rule (T-41 `producer_obligation`) and one version
 *   for each of VT, CT, ME, CA, CO and NJ, effective on the date of that
 *   state's obligations version.
 * - Where Appendix B names no section for an item, the item carries its
 *   filing's citation; no section is invented.
 * - Priya's sales for 2025, for every product and state she declared, and
 *   Vermont's 2024; **2023 is left out on purpose** (spec §6). One
 *   correction: Tidewater in Illinois, 2025.
 * - California's notice for the 2026-07-01 deadline, issued by Priya and
 *   linked as the evidence when the deadline was marked done — the render and
 *   the completion are computed in `../producer-seed.ts` from these values.
 */

const SPEC_READ = "2026-11-24T00:00:00.000Z";

// --- the filings ----------------------------------------------------------------------------

interface StateFilings {
  readonly jurisdiction: keyof typeof ID.JURISDICTION;
  readonly rule: keyof typeof ID.JURISDICTION_RULE;
  readonly version: keyof typeof ID.RULE_VERSION;
  /** The state's obligations version date — "effective dates match" (Appendix B). */
  readonly versionDate: string;
  readonly law: string;
  readonly sourceUrl: string;
  readonly sources: string;
  readonly toCheck: string | null;
  readonly filings: readonly JsonObject[];
}

const item = (
  source: string,
  label: string,
  citation: string,
  text?: string,
): JsonObject =>
  text === undefined
    ? { source, label, citation }
    : { source, label, citation, text };

const NONE: JsonObject = { kind: "none" };
const yearsBefore = (count: number): JsonObject => ({
  kind: "calendar_years_before_due",
  count,
});
const CHOSEN_YEAR: JsonObject = { kind: "chosen_year" };

const VT_URL = "https://legislature.vermont.gov";
const CT_URL = "https://cga.ct.gov";
const ME_URL = "https://legislature.maine.gov";
const CA_URL = "https://calrecycle.ca.gov";
const CO_URL = "https://leg.colorado.gov";
const NJ_URL = "https://pub.njleg.gov";

const CT_FILING = "Public Act 25-34 § 1(b)";
const CO_FILING = "SB 26-003";
const NJ_REGISTER = "§ 11 (C.13:1E-99.81k)";
const NJ_REPORT = "§ 12 (C.13:1E-99.81l)";

const STATES: readonly StateFilings[] = [
  {
    jurisdiction: "vermont",
    rule: "vtProducerFilings",
    version: "vtProducerFilings",
    versionDate: "2024-07-01",
    law: "10 V.S.A. ch. 168, applied to producers of rechargeable batteries by Act 152 (2024) Sec. 4",
    sourceUrl: VT_URL,
    sources:
      "legislature.vermont.gov, 10 V.S.A. ch. 168 and Act 152 as enacted; dec.vermont.gov, stewardship registration form.",
    toCheck:
      "register's send-to (§ 7583) and its contact item (§ 7583(c)(1)). §§ 7583 and 7585 are written for stewardship organizations and applied to producers by Act 152 Sec. 4(b) and (d); kept as Appendix A has them.",
    filings: [
      {
        obligationKey: "register",
        documentType: "filing_packet",
        title: "Registration with the Agency of Natural Resources",
        sendTo: "the Secretary, on the Agency's registration form (§ 7583)",
        period: NONE,
        items: [
          item("producer_identity", "Producer", "§ 7583"),
          item("contact", "Person responsible for compliance", "§ 7583(c)(1)"),
          item("brands", "Brands", "§ 7582(a)(3)"),
          item(
            "not_held",
            "The battery stewardship organization you participate in",
            "§ 7582(a)(1)",
          ),
        ],
        citation: "§ 7583",
        citationUrl: VT_URL,
      },
      {
        obligationKey: "annual_report",
        documentType: "annual_report",
        title: "Annual report (10 V.S.A. § 7585)",
        sendTo:
          "the Secretary; a producer or its battery stewardship organization may file it (§ 7585(a))",
        period: yearsBefore(3),
        items: [
          item("producer_identity", "Producer", "§ 7585(a)"),
          item(
            "weight",
            "Estimated sales by weight, previous three calendar years",
            "§ 7585(a)(3)",
          ),
          item(
            "not_held",
            "Batteries collected by chemistry, collection rate, collection points, education, management, plan changes and costs: your stewardship organization's figures",
            "§ 7585(a)(1)–(8)",
          ),
        ],
        citation: "10 V.S.A. § 7585",
        citationUrl: VT_URL,
      },
    ],
  },
  {
    jurisdiction: "connecticut",
    rule: "ctProducerFilings",
    version: "ctProducerFilings",
    versionDate: "2025-10-01",
    law: CT_FILING,
    sourceUrl: CT_URL,
    sources: "cga.ct.gov, OLR summary of PA 25-34.",
    toCheck: "notify_deep's send-to (the form DEEP prescribes).",
    filings: [
      {
        obligationKey: "notify_deep",
        documentType: "filing_packet",
        title: "Notice to DEEP: joining a plan jointly or individually",
        sendTo: "the DEEP Commissioner, on the form DEEP prescribes",
        period: NONE,
        items: [
          item("producer_identity", "Producer", CT_FILING),
          item("contact", "Contact", CT_FILING),
          item("brands", "Brands", CT_FILING),
          item("products", "Covered portable batteries", CT_FILING),
          item(
            "not_held",
            "Whether you will join jointly or individually",
            CT_FILING,
          ),
        ],
        citation: CT_FILING,
        citationUrl: CT_URL,
      },
    ],
  },
  {
    jurisdiction: "maine",
    rule: "meProducerFilings",
    version: "meProducerFilings",
    versionDate: "2026-04-03",
    law: "38 M.R.S. § 1617",
    sourceUrl: ME_URL,
    sources: "legislature.maine.gov, 38 M.R.S. § 1617.",
    toCheck:
      "the products item (§ 1617(8)(C)); GTIN stands for UPC. embedded_info is yearly from 2027-03-01 under § 1617(2)(B); Appendix A has it as one date.",
    filings: [
      {
        obligationKey: "embedded_info",
        documentType: "filing_packet",
        title: "Embedded battery information for your stewardship program",
        sendTo:
          "the operator of your battery stewardship program, for its annual report to the Department (§ 1617(2)(B))",
        period: NONE,
        items: [
          item("producer_identity", "Producer", "§ 1617(2)(B)"),
          item(
            "products",
            "Each product with an embedded battery: description, battery chemistry and type, UPC",
            "§ 1617(8)(C)",
          ),
        ],
        citation: "§ 1617(2)(B)",
        citationUrl: ME_URL,
      },
    ],
  },
  {
    jurisdiction: "california",
    rule: "caProducerFilings",
    version: "caProducerFilings",
    versionDate: "2023-01-01",
    law: "PRC §§ 42463, 42466.2, 42467 (SB 1215)",
    sourceUrl: CA_URL,
    sources:
      "california.public.law, PRC § 42467; calrecycle.ca.gov, manufacturer notice guidance and SB 1215 pages.",
    toCheck:
      'the fee statement\'s text. The notice and the report cite §§ 42466.2 and 42467 here; Appendix A cites "SB 1215" (D-80 #3).',
    filings: [
      {
        obligationKey: "sb1215_notice",
        documentType: "filing_packet",
        title: "Notice to retailers and CalRecycle",
        sendTo:
          "every retailer selling these products in California, with a copy to CalRecycle (§ 42466.2)",
        period: NONE,
        items: [
          item("producer_identity", "Manufacturer", "§ 42466.2"),
          item(
            "products",
            "Covered battery-embedded products, by brand and model number",
            "§ 42466.2",
          ),
          item(
            "products_outside",
            "Products you make that are exempt",
            "§ 42466.2",
          ),
          item(
            "statement",
            "Fee statement",
            "§ 42466.2, § 42464(b)",
            "The covered battery-embedded products in this notice are subject to the covered battery-embedded waste recycling fee under Public Resources Code section 42464(b).",
          ),
        ],
        citation: "§ 42466.2",
        citationUrl: CA_URL,
      },
      {
        obligationKey: "sb1215_report",
        documentType: "annual_report",
        title: "Manufacturer report to CalRecycle",
        sendTo: "CalRecycle (§ 42467(a))",
        period: yearsBefore(1),
        items: [
          item("producer_identity", "Manufacturer", "§ 42467(a)"),
          item(
            "units",
            "Estimated number sold in California in the previous year",
            "§ 42467(a)(1)(A)",
          ),
          item("chemistries", "Battery chemistry", "§ 42467(a)(1)(B)"),
          item(
            "not_held",
            "Recycled-materials baseline, and the increase from the previous year",
            "§ 42467(a)(1)(C)",
          ),
          item(
            "not_held",
            "Retailers notified in the prior 12 months",
            "§ 42467(a)(1)(D)",
          ),
        ],
        citation: "§ 42467(a)",
        citationUrl: CA_URL,
      },
    ],
  },
  {
    jurisdiction: "colorado",
    rule: "coProducerFilings",
    version: "coProducerFilings",
    versionDate: "2026-06-03",
    law: CO_FILING,
    sourceUrl: CO_URL,
    sources: "leg.colorado.gov, SB 26-003 fiscal note; CDPHE webinar slides.",
    toCheck:
      "the whole entry: read from the bill's fiscal note and CDPHE's webinar, not yet the enrolled text; and the version date.",
    filings: [
      {
        obligationKey: "ev_register",
        documentType: "filing_packet",
        title: "Registration with CDPHE as a propulsion battery provider",
        sendTo: "CDPHE",
        period: NONE,
        items: [
          item("producer_identity", "Propulsion battery provider", CO_FILING),
          item("contact", "Contact", CO_FILING),
          item("products", "Propulsion batteries", CO_FILING),
        ],
        citation: CO_FILING,
        citationUrl: CO_URL,
      },
      {
        obligationKey: "ev_annual_report",
        documentType: "annual_report",
        title: "Annual report to CDPHE",
        sendTo: "CDPHE",
        period: yearsBefore(1),
        items: [
          item("producer_identity", "Propulsion battery provider", CO_FILING),
          item(
            "not_held",
            "Propulsion batteries collected, how they were managed, and where they went",
            CO_FILING,
          ),
        ],
        citation: CO_FILING,
        citationUrl: CO_URL,
      },
    ],
  },
  {
    jurisdiction: "newJersey",
    rule: "njProducerFilings",
    version: "njProducerFilings",
    versionDate: "2024-01-08",
    law: "Electric and Hybrid Vehicle Battery Management Act, P.L. 2023, c. 222",
    sourceUrl: NJ_URL,
    sources:
      "pub.njleg.gov, P.L. 2023, c. 222 §§ 11–12; nj.gov/dep, Producer Registration Form v1.1.",
    toCheck: null,
    filings: [
      {
        obligationKey: "ev_register",
        documentType: "filing_packet",
        title: "Producer registration with NJDEP",
        sendTo: "NJDEP, on its Producer Registration Form (v1.1, 31 Jul 2024)",
        period: NONE,
        items: [
          item(
            "producer_identity",
            "Section A: producer name and website",
            NJ_REGISTER,
          ),
          item("not_held", "Section A: federal tax ID", NJ_REGISTER),
          item("contact", "Section B: contact", NJ_REGISTER),
          item(
            "not_held",
            "Section C: which kind of producer you are",
            NJ_REGISTER,
          ),
          item(
            "products",
            "Section D (optional): your propulsion batteries",
            NJ_REGISTER,
          ),
          item(
            "not_held",
            "Section E: certification signed by your designated representative",
            NJ_REGISTER,
          ),
        ],
        citation: NJ_REGISTER,
        citationUrl: NJ_URL,
      },
      {
        obligationKey: "ev_annual_report",
        documentType: "annual_report",
        title: "Annual report to NJDEP",
        sendTo: "NJDEP, in the form it prescribes",
        // The law says "each year" and states no period (Rule 8.21).
        period: CHOSEN_YEAR,
        items: [
          item("producer_identity", "Producer", NJ_REPORT),
          item(
            "units",
            "Propulsion batteries sold, offered for sale or distributed in or into New Jersey",
            NJ_REPORT,
          ),
        ],
        citation: NJ_REPORT,
        citationUrl: NJ_URL,
      },
    ],
  },
];

export const jurisdictionRules: readonly JurisdictionRule[] = STATES.map(
  (state) => ({
    id: ID.JURISDICTION_RULE[state.rule],
    jurisdictionId: ID.JURISDICTION[state.jurisdiction],
    ruleKey: "producer.filings",
    domain: "producer_obligation",
    title: "Producer law — filings",
    description:
      "What each filing the state's producer law asks for must contain, item by item, each with its citation (Rule 8.18).",
    isActive: true,
    appliesToApplicationClasses: null,
    createdAt: SPEC_READ,
    updatedAt: SPEC_READ,
    createdBy: ID.USER.platformAdmin,
    updatedBy: ID.USER.platformAdmin,
  }),
);

function sourceRef(state: StateFilings): string {
  const read = `Read 24 Nov 2026 from: ${state.sources}`;
  return state.toCheck === null
    ? read
    : `${read} ⚑ To check against the official text in unit 20: ${state.toCheck}`;
}

export const ruleVersions: readonly RuleVersion[] = STATES.map((state) => ({
  id: ID.RULE_VERSION[state.version],
  jurisdictionRuleId: ID.JURISDICTION_RULE[state.rule],
  versionLabel: state.versionDate,
  effectiveOn: state.versionDate,
  expiresOn: null,
  citation: state.law,
  citationUrl: state.sourceUrl,
  sourceDocumentRef: sourceRef(state),
  payload: { filings: [...state.filings] },
  payloadSchemaKey: "producer.filings.v1",
  supersedesRuleVersionId: null,
  status: "active",
  publishedAt: SPEC_READ,
  publishedBy: ID.USER.platformAdmin,
  createdAt: SPEC_READ,
  createdBy: ID.USER.platformAdmin,
}));

// --- Priya's sales --------------------------------------------------------------------------

/** When Priya recorded the year's numbers, and when she corrected Illinois. */
export const SALES_RECORDED_AT = "2026-11-18T17:00:00.000Z";
export const SALES_CORRECTED_AT = "2026-11-20T16:30:00.000Z";

function entry(input: {
  readonly n: number;
  readonly product: keyof typeof ID.PRODUCER_PRODUCT;
  readonly state: keyof typeof ID.JURISDICTION;
  readonly year: number;
  readonly units: number;
  readonly basisNote: string;
  readonly at?: string;
  readonly supersededBy?: number;
}): ProducerSalesRecord {
  const at = input.at ?? SALES_RECORDED_AT;
  return {
    id: ID.producerSalesRecordId(input.n),
    organizationId: ID.ORG.cascade,
    producerProductId: ID.PRODUCER_PRODUCT[input.product],
    jurisdictionId: ID.JURISDICTION[input.state],
    year: input.year,
    units: input.units,
    basisNote: input.basisNote,
    recordedAt: at,
    recordedBy: ID.USER.priyaProducer,
    supersededById:
      input.supersededBy === undefined
        ? null
        : ID.producerSalesRecordId(input.supersededBy),
    supersededAt: input.supersededBy === undefined ? null : SALES_CORRECTED_AT,
    createdAt: at,
  };
}

const DISTRIBUTOR_2025 = "Distributor sell-through report, calendar 2025.";
const ORDERS_2025 = "Our own shipped-order ledger, calendar 2025.";

/**
 * Every product and state Priya declared, for 2025 — Brightline's Illinois
 * entry is **zero, typed** (no 2025 sales), which is an entry and never a gap
 * (Rule 8.17). Vermont also has 2024; **2023 is not recorded**. Tidewater in
 * Illinois was recorded and then corrected: the first entry is kept, marked
 * replaced.
 */
export const producerSalesRecords: readonly ProducerSalesRecord[] = [
  entry({
    n: 1,
    product: "tidewaterAlkalineAa",
    state: "washington",
    year: 2025,
    units: 48_000,
    basisNote: DISTRIBUTOR_2025,
  }),
  entry({
    n: 2,
    product: "tidewaterAlkalineAa",
    state: "illinois",
    year: 2025,
    units: 36_500,
    basisNote: DISTRIBUTOR_2025,
    supersededBy: 19,
  }),
  entry({
    n: 3,
    product: "tidewaterAlkalineAa",
    state: "districtOfColumbia",
    year: 2025,
    units: 6_200,
    basisNote: DISTRIBUTOR_2025,
  }),
  entry({
    n: 4,
    product: "tidewaterAlkalineAa",
    state: "vermont",
    year: 2025,
    units: 4_800,
    basisNote: DISTRIBUTOR_2025,
  }),
  entry({
    n: 5,
    product: "tidewaterAlkalineAa",
    state: "minnesota",
    year: 2025,
    units: 15_300,
    basisNote: DISTRIBUTOR_2025,
  }),
  entry({
    n: 6,
    product: "tidewaterAlkalineAa",
    state: "florida",
    year: 2025,
    units: 52_000,
    basisNote: DISTRIBUTOR_2025,
  }),
  entry({
    n: 7,
    product: "tidewaterAlkalineAa",
    state: "vermont",
    year: 2024,
    units: 4_350,
    basisNote: "Distributor sell-through report, calendar 2024.",
  }),
  entry({
    n: 8,
    product: "kestrelScrubberLfp",
    state: "washington",
    year: 2025,
    units: 140,
    basisNote: ORDERS_2025,
  }),
  entry({
    n: 9,
    product: "kestrelScrubberLfp",
    state: "connecticut",
    year: 2025,
    units: 85,
    basisNote: ORDERS_2025,
  }),
  entry({
    n: 10,
    product: "kestrelScrubberLfp",
    state: "districtOfColumbia",
    year: 2025,
    units: 12,
    basisNote: ORDERS_2025,
  }),
  entry({
    n: 11,
    product: "harborTrollingLfp",
    state: "washington",
    year: 2025,
    units: 310,
    basisNote: ORDERS_2025,
  }),
  entry({
    n: 12,
    product: "harborTrollingLfp",
    state: "oregon",
    year: 2025,
    units: 190,
    basisNote: ORDERS_2025,
  }),
  entry({
    n: 13,
    product: "haldenLaptop",
    state: "california",
    year: 2025,
    units: 2_400,
    basisNote: DISTRIBUTOR_2025,
  }),
  entry({
    n: 14,
    product: "haldenLaptop",
    state: "maine",
    year: 2025,
    units: 160,
    basisNote: DISTRIBUTOR_2025,
  }),
  entry({
    n: 15,
    product: "haldenLaptop",
    state: "newYork",
    year: 2025,
    units: 1_850,
    basisNote: DISTRIBUTOR_2025,
  }),
  entry({
    n: 16,
    product: "northvaleTraction",
    state: "colorado",
    year: 2025,
    units: 22,
    basisNote: "Fleet delivery register, calendar 2025.",
  }),
  entry({
    n: 17,
    product: "northvaleTraction",
    state: "newJersey",
    year: 2025,
    units: 14,
    basisNote: "Fleet delivery register, calendar 2025.",
  }),
  entry({
    n: 18,
    product: "brightlineZincAir",
    state: "illinois",
    year: 2025,
    units: 0,
    basisNote:
      "No Illinois sales in 2025; the first order shipped in January 2026.",
  }),
  entry({
    n: 19,
    product: "tidewaterAlkalineAa",
    state: "illinois",
    year: 2025,
    units: 37_250,
    basisNote:
      "Corrected: the distributor's revised Q4 report added a late December shipment.",
    at: SALES_CORRECTED_AT,
  }),
];

// --- California's notice ----------------------------------------------------------------------

/**
 * Priya issued California's notice for its 2026-07-01 deadline, and later
 * marked that deadline done with the notice as its evidence (spec §6). The
 * render's content is built by the real domain in `../producer-seed.ts`.
 */
export const SEEDED_PACKET = {
  jurisdiction: "california",
  obligationKey: "sb1215_notice",
  dueOn: "2026-07-01",
  renderedAt: "2026-06-20T17:30:00.000Z",
  completedOn: "2026-06-25",
  /** Marked after the seeded run, as DC's was (`b1b-12`). */
  completedAt: "2026-11-16T18:45:00.000Z",
  note: "Sent the notice to our California retailers and copied CalRecycle on 25 June 2026.",
  reference: null,
} as const;
