import type { CatalogEntry } from "@/types/catalog";
import type { JsonObject } from "@/types/common";
import type { ProducerProduct } from "@/types/producer";
import type {
  Jurisdiction,
  JurisdictionRule,
  RuleVersion,
} from "@/types/rules-as-data";

import * as ID from "./ids";

/**
 * The rows `b1b-12-state-rules` adds — **added, never edited** (STATE §7.1).
 *
 * **This file is rule data**, standing in for the reference-data migrations
 * unit 17 writes (`ERD.md` §4: reference rows ship as numbered migrations).
 * Every limit, date, citation and label below is transcribed from
 * `SPEC_state-rules_2026-11-17.md` Appendix A, read 17 Nov 2026 from the
 * sources named there. A value Appendix A marks ⚑ is checked against the
 * official text again in unit 20; each version says which in its
 * `sourceDocumentRef`. **No code reads a state's limit from anywhere but
 * these rows** (Rule 1.23).
 *
 * - Jurisdiction rows for every other state and DC (T-40 codes) — Washington
 *   was already here.
 * - Two rules for each of the fifteen Appendix A jurisdictions:
 *   `producer.coverage` (T-41 `format_threshold`) and `producer.obligations`
 *   (T-41 `producer_obligation`), one version each, and California's coverage
 *   twice — the version in force and SB 501's, scheduled for 2027-01-01.
 * - Four catalog entries, and Priya's six declared products (spec §6).
 *
 * Kentucky (voluntary) and Florida (no in-force date verified) have no rules,
 * on purpose: Florida reads "No producer rules on file".
 */

const SPEC_READ = "2026-11-17T00:00:00.000Z";

// --- jurisdictions --------------------------------------------------------------------------

/** `[id key, T-40 code, name, ISO 3166-2 subdivision]`, in `ID.JURISDICTION` order. */
const STATES = [
  ["alabama", "US-AL", "Alabama", "AL"],
  ["alaska", "US-AK", "Alaska", "AK"],
  ["arizona", "US-AZ", "Arizona", "AZ"],
  ["arkansas", "US-AR", "Arkansas", "AR"],
  ["california", "US-CA", "California", "CA"],
  ["colorado", "US-CO", "Colorado", "CO"],
  ["connecticut", "US-CT", "Connecticut", "CT"],
  ["delaware", "US-DE", "Delaware", "DE"],
  ["districtOfColumbia", "US-DC", "District of Columbia", "DC"],
  ["florida", "US-FL", "Florida", "FL"],
  ["georgia", "US-GA", "Georgia", "GA"],
  ["hawaii", "US-HI", "Hawaii", "HI"],
  ["idaho", "US-ID", "Idaho", "ID"],
  ["illinois", "US-IL", "Illinois", "IL"],
  ["indiana", "US-IN", "Indiana", "IN"],
  ["iowa", "US-IA", "Iowa", "IA"],
  ["kansas", "US-KS", "Kansas", "KS"],
  ["kentucky", "US-KY", "Kentucky", "KY"],
  ["louisiana", "US-LA", "Louisiana", "LA"],
  ["maine", "US-ME", "Maine", "ME"],
  ["maryland", "US-MD", "Maryland", "MD"],
  ["massachusetts", "US-MA", "Massachusetts", "MA"],
  ["michigan", "US-MI", "Michigan", "MI"],
  ["minnesota", "US-MN", "Minnesota", "MN"],
  ["mississippi", "US-MS", "Mississippi", "MS"],
  ["missouri", "US-MO", "Missouri", "MO"],
  ["montana", "US-MT", "Montana", "MT"],
  ["nebraska", "US-NE", "Nebraska", "NE"],
  ["nevada", "US-NV", "Nevada", "NV"],
  ["newHampshire", "US-NH", "New Hampshire", "NH"],
  ["newJersey", "US-NJ", "New Jersey", "NJ"],
  ["newMexico", "US-NM", "New Mexico", "NM"],
  ["newYork", "US-NY", "New York", "NY"],
  ["northCarolina", "US-NC", "North Carolina", "NC"],
  ["northDakota", "US-ND", "North Dakota", "ND"],
  ["ohio", "US-OH", "Ohio", "OH"],
  ["oklahoma", "US-OK", "Oklahoma", "OK"],
  ["oregon", "US-OR", "Oregon", "OR"],
  ["pennsylvania", "US-PA", "Pennsylvania", "PA"],
  ["rhodeIsland", "US-RI", "Rhode Island", "RI"],
  ["southCarolina", "US-SC", "South Carolina", "SC"],
  ["southDakota", "US-SD", "South Dakota", "SD"],
  ["tennessee", "US-TN", "Tennessee", "TN"],
  ["texas", "US-TX", "Texas", "TX"],
  ["utah", "US-UT", "Utah", "UT"],
  ["vermont", "US-VT", "Vermont", "VT"],
  ["virginia", "US-VA", "Virginia", "VA"],
  ["westVirginia", "US-WV", "West Virginia", "WV"],
  ["wisconsin", "US-WI", "Wisconsin", "WI"],
  ["wyoming", "US-WY", "Wyoming", "WY"],
] as const satisfies readonly (readonly [
  keyof typeof ID.JURISDICTION,
  string,
  string,
  string,
])[];

export const jurisdictions: readonly Jurisdiction[] = STATES.map(
  ([key, code, name, subdivision]) => ({
    id: ID.JURISDICTION[key],
    code,
    name,
    level: "state",
    parentJurisdictionId: ID.JURISDICTION.federal,
    countryCode: "US",
    subdivisionCode: subdivision,
    effectiveOn: null,
    expiresOn: null,
    createdAt: SPEC_READ,
    updatedAt: SPEC_READ,
  }),
);

// --- condition vocabulary -------------------------------------------------------------------
// Appendix A's families, and the pieces its classes are built from. Data, not
// logic: these assemble JSON payloads exactly as P6 would author them.

/** Primary: `alkaline`, `lithium_metal`. */
const PRIMARY = ["alkaline", "lithium_metal"];
/** Rechargeable: every `li_*`, `nimh`, `nicd`, `lead_acid_sealed`, `sodium_ion`. */
const RECHARGEABLE = [
  "li_nmc",
  "li_nca",
  "li_lfp",
  "li_lco",
  "li_lmo",
  "li_lto",
  "li_ion_unspecified",
  "nimh",
  "nicd",
  "lead_acid_sealed",
  "sodium_ion",
];
/** Rechargeable without sealed lead-acid ("no lead-acid", "not lead-acid"). */
const RECHARGEABLE_NO_LEAD = RECHARGEABLE.filter(
  (chemistry) => chemistry !== "lead_acid_sealed",
);
/** R — portable and medium classes require a removable battery. */
const REMOVABLE = ["user_removable", "tool_removable"];
/** Application `vehicle` outside the class: every other T-02 value. */
const NOT_VEHICLE = ["consumer_electronics", "industrial", "small_mobility"];

type Op = "lt" | "lte" | "gt" | "gte";

const all = (...conditions: JsonObject[]): JsonObject => ({ all: conditions });
const any = (...conditions: JsonObject[]): JsonObject => ({ any: conditions });
const chemistryIn = (list: readonly string[]): JsonObject => ({
  chemistryIn: [...list],
});
const removabilityIn = (list: readonly string[]): JsonObject => ({
  removabilityIn: [...list],
});
const applicationIn = (list: readonly string[]): JsonObject => ({
  applicationIn: [...list],
});
const bandIn = (...bands: string[]): JsonObject => ({ bandIn: bands });
const lb = (op: Op, value: string): JsonObject => ({
  mass: { op, value, unit: "lb" },
});
const kg = (op: Op, value: string): JsonObject => ({
  mass: { op, value, unit: "kg" },
});
const wh = (op: Op, value: string): JsonObject => ({
  energy: { op, value, unit: "Wh" },
});

interface StandardClasses {
  readonly citation: string;
  readonly removable: readonly string[];
  readonly labels: {
    readonly portablePrimary: string;
    readonly portableRechargeable: string;
    readonly mediumPrimary: string;
    readonly mediumRechargeable: string;
  };
  /** Which chemistries count as rechargeable here (California: no lead-acid). */
  readonly rechargeable?: readonly string[];
  /** "Sealed lead-acid over 11 lb … outside every class". */
  readonly sealedLeadOver11Outside?: boolean;
  /** "Application `vehicle` … outside every class". */
  readonly vehicleOutside?: boolean;
  /** Connecticut's primary limit (4 lb 6 oz), in place of the standard. */
  readonly portablePrimaryLb?: string;
  /** Connecticut's medium rechargeable: (> 11 lb and ≤ 25 lb) or (> 300 Wh and ≤ 2,000 Wh). */
  readonly mediumRechargeableEither?: boolean;
  /** "Large format … Used only where an obligation names it." */
  readonly large?: { readonly label: string };
}

/**
 * Appendix A's standard classes (S), and R:
 *
 * - **Portable:** primary ≤ 4.4 lb; or rechargeable ≤ 11 lb and ≤ 300 Wh.
 * - **Medium format:** primary > 4.4 lb and ≤ 25 lb; or rechargeable (> 11 lb
 *   or > 300 Wh) and ≤ 25 lb and ≤ 2,000 Wh.
 * - **Large format:** primary > 25 lb; or rechargeable > 25 lb or > 2,000 Wh.
 * - **R:** portable and medium classes require a removable battery.
 *
 * An exclusion "outside every class" is folded into each class as a
 * condition, so a product that fails a class on its size is told so even
 * where the excluded fact is missing.
 *
 * A class cites the state's law as its version does, unless Appendix A names
 * the class's own section (California, New York, Minnesota, Iowa, DC):
 * no section number is filled in that the spec does not give.
 */
function standardClasses(options: StandardClasses): JsonObject[] {
  const rechargeable = options.rechargeable ?? RECHARGEABLE;
  const primaryLimit = options.portablePrimaryLb ?? "4.4";
  const guards: JsonObject[] = [removabilityIn(options.removable)];
  if (options.vehicleOutside === true) guards.push(applicationIn(NOT_VEHICLE));

  const mediumRechargeableSize: JsonObject =
    options.mediumRechargeableEither === true
      ? any(
          all(lb("gt", "11"), lb("lte", "25")),
          all(wh("gt", "300"), wh("lte", "2000")),
        )
      : all(
          any(lb("gt", "11"), wh("gt", "300")),
          lb("lte", "25"),
          wh("lte", "2000"),
        );
  const mediumRechargeableChemistry: JsonObject =
    options.sealedLeadOver11Outside === true &&
    rechargeable.includes("lead_acid_sealed")
      ? any(
          chemistryIn(
            rechargeable.filter(
              (chemistry) => chemistry !== "lead_acid_sealed",
            ),
          ),
          all(chemistryIn(["lead_acid_sealed"]), lb("lte", "11")),
        )
      : chemistryIn(rechargeable);

  const classes: JsonObject[] = [
    {
      key: "portable_primary",
      label: options.labels.portablePrimary,
      band: "portable",
      citation: options.citation,
      when: all(chemistryIn(PRIMARY), lb("lte", primaryLimit), ...guards),
    },
    {
      key: "portable_rechargeable",
      label: options.labels.portableRechargeable,
      band: "portable",
      citation: options.citation,
      when: all(
        chemistryIn(rechargeable),
        lb("lte", "11"),
        wh("lte", "300"),
        ...guards,
      ),
    },
    {
      key: "medium_primary",
      label: options.labels.mediumPrimary,
      band: "medium_format",
      citation: options.citation,
      when: all(
        chemistryIn(PRIMARY),
        lb("gt", primaryLimit),
        lb("lte", "25"),
        ...guards,
      ),
    },
    {
      key: "medium_rechargeable",
      label: options.labels.mediumRechargeable,
      band: "medium_format",
      citation: options.citation,
      when: all(mediumRechargeableChemistry, mediumRechargeableSize, ...guards),
    },
  ];
  if (options.large !== undefined) {
    classes.push({
      key: "large",
      label: options.large.label,
      band: "large_format",
      citation: options.citation,
      when: any(
        all(chemistryIn(PRIMARY), lb("gt", "25")),
        all(chemistryIn(rechargeable), any(lb("gt", "25"), wh("gt", "2000"))),
      ),
    });
  }
  return classes;
}

const STANDARD_LABELS = {
  portablePrimary: "Portable battery",
  portableRechargeable: "Portable battery",
  mediumPrimary: "Medium format battery",
  mediumRechargeable: "Medium format battery",
} as const;

/** Colorado's and New Jersey's first class (Appendix A). */
function propulsionClass(citation: string): JsonObject {
  return {
    key: "propulsion",
    label: "Propulsion battery",
    band: "large_format",
    citation,
    when: all(applicationIn(["vehicle"]), chemistryIn(RECHARGEABLE_NO_LEAD)),
  };
}

const PORTABLE = bandIn("portable");
const PORTABLE_MEDIUM = bandIn("portable", "medium_format");
const PORTABLE_MEDIUM_LARGE = bandIn(
  "portable",
  "medium_format",
  "large_format",
);
/** "propulsion": the propulsion class is the only large class where it is named. */
const PROPULSION = bandIn("large_format");

const on = (date: string): JsonObject => ({ kind: "statutory_date", on: date });
const yearly = (month: number, day: number, firstOn: string): JsonObject => ({
  kind: "annual",
  month,
  day,
  firstOn,
});
const noDate = (event: string): JsonObject => ({ kind: "no_date", event });

function obligation(
  key: string,
  appliesTo: JsonObject,
  due: JsonObject,
  citation: string,
  duty: string,
): JsonObject {
  return { key, duty, citation, appliesTo, due };
}

const BATTERY_NETWORK = "The Battery Network (formerly Call2Recycle)";

// --- the fifteen ----------------------------------------------------------------------------

interface StateLaw {
  readonly code: string;
  readonly jurisdiction: keyof typeof ID.JURISDICTION;
  readonly coverageRule: keyof typeof ID.JURISDICTION_RULE;
  readonly obligationsRule: keyof typeof ID.JURISDICTION_RULE;
  readonly coverageVersion: keyof typeof ID.RULE_VERSION;
  readonly obligationsVersion: keyof typeof ID.RULE_VERSION;
  readonly versionDate: string;
  readonly law: string;
  readonly sourceUrl: string;
  readonly sources: string;
  /** What Appendix A marks ⚑ for this state, if anything. */
  readonly toCheck: string | null;
  readonly coverage: JsonObject;
  readonly obligations: JsonObject;
}

const WA_LAW = "RCW 70A.555 (2023 c 434); WAC 173-905";
const IL_LAW = "415 ILCS 205 (P.A. 103-1033)";
const CO_LAW = "C.R.S. 25-17-1001 et seq. (SB 25-163, as amended by SB 26-003)";
const CT_LAW = "Public Act 25-34";
const VT_LAW = "10 V.S.A. ch. 168, as amended by Act 152 (2024)";
const NE_LAW =
  "Neb. Rev. Stat. § 81-15,314 et seq. (LB 36, 2025; definitions amended by LB 759, 2026)";
const WI_LAW = "Wis. Stat. § 287.175 (2025 Acts 170, 171)";
const OR_LAW = "HB 4144 (2026)";
const ME_LAW = "38 M.R.S. § 1617 (P.L. 2025, c. 608)";
const CA_LAW =
  "Responsible Battery Recycling Act (PRC §§ 42420–42428); SB 1215 (Stats. 2022, ch. 370)";
const NY_LAW =
  "ECL §§ 27-1801 to 27-1809 (L. 2010, ch. 562, as amended by L. 2025, ch. 712)";
const MN_LAW = "Minn. Stat. §§ 115A.9157, 325E.125";
const NJ_LAW =
  "Dry Cell Battery Management Act (N.J.S.A. 13:1E-99.59 et seq.); Electric and Hybrid Vehicle Battery Management Act (N.J.S.A. 13:1E-99.81 et seq., as NJDEP cites it)";
const IA_LAW = "Iowa Code § 455D.10A";
const DC_LAW = "D.C. Code §§ 8-771.01 et seq.";

const LAWS: readonly StateLaw[] = [
  {
    code: "US-WA",
    jurisdiction: "washington",
    coverageRule: "waProducerCoverage",
    obligationsRule: "waProducerObligations",
    coverageVersion: "waProducerCoverage",
    obligationsVersion: "waProducerObligations",
    versionDate: "2026-01-16",
    law: WA_LAW,
    sourceUrl: "https://lawfilesext.leg.wa.gov",
    sources:
      "lawfilesext.leg.wa.gov, RCW 70A.555; ecology.wa.gov battery stewardship.",
    toCheck: "participate_medium's 2029-01-01.",
    coverage: {
      classes: standardClasses({
        citation: WA_LAW,
        removable: REMOVABLE,
        labels: STANDARD_LABELS,
        large: { label: "Large format battery" },
      }),
      notChecked: ["medical devices"],
    },
    obligations: {
      agency: "Department of Ecology",
      stewardshipOrganizations: [BATTERY_NETWORK],
      obligations: [
        obligation(
          "participate_portable",
          PORTABLE,
          on("2027-01-01"),
          "RCW 70A.555.020",
          "Join an approved battery stewardship plan.",
        ),
        obligation(
          "participate_medium",
          bandIn("medium_format"),
          on("2029-01-01"),
          "RCW 70A.555.010(5)(a), .020",
          "Join an approved plan for medium-format batteries.",
        ),
        obligation(
          "mark_producer",
          PORTABLE_MEDIUM_LARGE,
          on("2028-01-01"),
          "RCW 70A.555.130(1)",
          "Mark each battery with the producer's identification (not needed under ½ inch).",
        ),
        obligation(
          "mark_chemistry",
          PORTABLE_MEDIUM_LARGE,
          on("2030-01-01"),
          "RCW 70A.555.130(1)(b)",
          'Mark the chemistry and "should not be disposed of as household waste".',
        ),
      ],
    },
  },
  {
    code: "US-IL",
    jurisdiction: "illinois",
    coverageRule: "ilProducerCoverage",
    obligationsRule: "ilProducerObligations",
    coverageVersion: "ilProducerCoverage",
    obligationsVersion: "ilProducerObligations",
    versionDate: "2024-08-09",
    law: IL_LAW,
    sourceUrl: "https://ilga.gov",
    sources: "ilga.gov, 415 ILCS 205/15, /65.",
    toCheck: "the standard classes (S).",
    coverage: {
      classes: standardClasses({
        citation: IL_LAW,
        removable: REMOVABLE,
        labels: STANDARD_LABELS,
      }),
      notChecked: ["medical devices"],
    },
    obligations: {
      agency: "Illinois EPA",
      stewardshipOrganizations: [BATTERY_NETWORK],
      obligations: [
        obligation(
          "participate",
          PORTABLE_MEDIUM,
          on("2026-01-01"),
          "415 ILCS 205/15",
          "Join an approved battery stewardship plan.",
        ),
        obligation(
          "mark_producer",
          PORTABLE_MEDIUM,
          on("2027-01-01"),
          "415 ILCS 205/65(a)(1)",
          "Mark the producer's identification (not needed under ½ inch).",
        ),
        obligation(
          "mark_chemistry",
          PORTABLE_MEDIUM,
          on("2029-01-01"),
          "415 ILCS 205/65(a)(2)",
          'Mark the chemistry and "should not be disposed of as household waste".',
        ),
      ],
    },
  },
  {
    code: "US-CO",
    jurisdiction: "colorado",
    coverageRule: "coProducerCoverage",
    obligationsRule: "coProducerObligations",
    coverageVersion: "coProducerCoverage",
    obligationsVersion: "coProducerObligations",
    versionDate: "2026-06-03",
    law: CO_LAW,
    sourceUrl: "https://content.leg.colorado.gov",
    sources:
      "content.leg.colorado.gov, 2025a_163_enr.pdf; SB 26-003 summary, fbm.com.",
    toCheck:
      "the version date (signing date); ev_register's 2027-07-01, ev_outreach_plan's 2029-01-02, ev_label's 2029-07-01 and ev_annual_report's first 2030-06-01.",
    coverage: {
      classes: [
        propulsionClass("SB 26-003"),
        ...standardClasses({
          citation: CO_LAW,
          removable: REMOVABLE,
          labels: STANDARD_LABELS,
          sealedLeadOver11Outside: true,
        }),
      ],
      notChecked: ["medical devices"],
    },
    obligations: {
      agency: "CDPHE",
      stewardshipOrganizations: [],
      obligations: [
        obligation(
          "participate",
          PORTABLE_MEDIUM,
          on("2027-08-01"),
          "C.R.S. 25-17-1004(1)",
          "Join a battery stewardship organization with a plan, and pay its fees.",
        ),
        obligation(
          "mark",
          PORTABLE_MEDIUM,
          on("2028-01-01"),
          "C.R.S. 25-17-1013(1)(a)",
          'Mark the producer, the chemistry and "not household waste".',
        ),
        obligation(
          "ev_register",
          PROPULSION,
          on("2027-07-01"),
          "SB 26-003",
          "Register with CDPHE as a propulsion battery provider.",
        ),
        obligation(
          "ev_outreach_plan",
          PROPULSION,
          on("2029-01-02"),
          "SB 26-003",
          "Send CDPHE an education and outreach plan.",
        ),
        obligation(
          "ev_label",
          PROPULSION,
          on("2029-07-01"),
          "SB 26-003",
          "Label each propulsion battery with your name and its chemistry.",
        ),
        obligation(
          "ev_annual_report",
          PROPULSION,
          yearly(6, 1, "2030-06-01"),
          "SB 26-003",
          "Report on the propulsion batteries you collected.",
        ),
      ],
    },
  },
  {
    code: "US-CT",
    jurisdiction: "connecticut",
    coverageRule: "ctProducerCoverage",
    obligationsRule: "ctProducerObligations",
    coverageVersion: "ctProducerCoverage",
    obligationsVersion: "ctProducerObligations",
    versionDate: "2025-10-01",
    law: CT_LAW,
    sourceUrl: "https://cga.ct.gov",
    sources: "cga.ct.gov, OLR summary of PA 25-34 and HB 5019 file copy.",
    toCheck: "the medium rechargeable limits.",
    coverage: {
      classes: standardClasses({
        citation: CT_LAW,
        removable: REMOVABLE,
        labels: STANDARD_LABELS,
        // 4 lb 6 oz, stored in the statute's unit as 4.375 lb.
        portablePrimaryLb: "4.375",
        mediumRechargeableEither: true,
        sealedLeadOver11Outside: true,
        vehicleOutside: true,
      }),
      notChecked: ["medical devices", "batteries under §§ 22a-629 to 22a-640"],
    },
    obligations: {
      agency: "DEEP",
      stewardshipOrganizations: [],
      obligations: [
        obligation(
          "notify_deep",
          PORTABLE_MEDIUM,
          on("2027-01-01"),
          "PA 25-34 § 1(b)",
          "Tell DEEP whether you'll join a plan jointly or on your own.",
        ),
        obligation(
          "participate",
          PORTABLE_MEDIUM,
          on("2027-01-01"),
          "PA 25-34 § 1(b)",
          "Join an approved battery stewardship plan.",
        ),
        obligation(
          "mark_producer",
          PORTABLE_MEDIUM,
          on("2028-01-01"),
          "PA 25-34",
          "Mark the producer's identification.",
        ),
        obligation(
          "mark_chemistry",
          PORTABLE_MEDIUM,
          on("2030-01-01"),
          "PA 25-34",
          'Mark the chemistry and "should not be disposed of as household waste".',
        ),
      ],
    },
  },
  {
    code: "US-VT",
    jurisdiction: "vermont",
    coverageRule: "vtProducerCoverage",
    obligationsRule: "vtProducerObligations",
    coverageVersion: "vtProducerCoverage",
    obligationsVersion: "vtProducerObligations",
    versionDate: "2024-07-01",
    law: VT_LAW,
    sourceUrl: "https://legislature.vermont.gov",
    sources: "legislature.vermont.gov, Act 152 as enacted.",
    toCheck:
      "rechargeable up to 25 lb and 2,000 Wh; removable meaning user_removable only.",
    coverage: {
      classes: standardClasses({
        citation: VT_LAW,
        removable: ["user_removable"],
        labels: {
          portablePrimary: "Primary battery",
          portableRechargeable: "Rechargeable battery",
          mediumPrimary: "Primary battery",
          mediumRechargeable: "Rechargeable battery",
        },
      }),
      notChecked: [
        "recalled batteries",
        "primary batteries for business-to-business use",
      ],
    },
    obligations: {
      agency: "Agency of Natural Resources",
      stewardshipOrganizations: [BATTERY_NETWORK],
      obligations: [
        obligation(
          "register",
          PORTABLE_MEDIUM,
          on("2025-03-01"),
          "Act 152 § 4(b)",
          "Register with the Agency.",
        ),
        obligation(
          "participate",
          PORTABLE_MEDIUM,
          on("2026-01-01"),
          "10 V.S.A. § 7582(a)",
          "Join an approved stewardship program.",
        ),
        obligation(
          "annual_report",
          PORTABLE_MEDIUM,
          yearly(3, 1, "2027-03-01"),
          "Act 152 § 4(d)",
          "Annual report to the Agency (your stewardship organization may file it).",
        ),
      ],
    },
  },
  {
    code: "US-NE",
    jurisdiction: "nebraska",
    coverageRule: "neProducerCoverage",
    obligationsRule: "neProducerObligations",
    coverageVersion: "neProducerCoverage",
    obligationsVersion: "neProducerObligations",
    versionDate: "2025-05-20",
    law: NE_LAW,
    sourceUrl: "https://nebraskalegislature.gov",
    sources: "nebraskalegislature.gov, LB36 final and slip law; § 81-15,315.",
    toCheck: "the LB 759 definitions; the version date (signing date).",
    coverage: {
      classes: standardClasses({
        citation: NE_LAW,
        removable: REMOVABLE,
        labels: STANDARD_LABELS,
        vehicleOutside: true,
      }),
      notChecked: [
        "medical devices",
        "recalled batteries",
        "batteries for resale between businesses",
      ],
    },
    obligations: {
      agency: "Department of Environment and Energy",
      stewardshipOrganizations: [],
      obligations: [
        obligation(
          "participate",
          PORTABLE_MEDIUM,
          on("2028-01-01"),
          "LB 36 § 3(1)",
          "Join a battery stewardship organization with an approved plan.",
        ),
        obligation(
          "mark_producer",
          PORTABLE_MEDIUM,
          on("2028-01-01"),
          "LB 36 § 3(2)",
          "Mark the producer's identification (not needed under ½ inch).",
        ),
        obligation(
          "mark_chemistry",
          PORTABLE_MEDIUM,
          on("2029-01-01"),
          "LB 36 § 3(3)",
          'Mark the chemistry and "not household waste".',
        ),
      ],
    },
  },
  {
    code: "US-WI",
    jurisdiction: "wisconsin",
    coverageRule: "wiProducerCoverage",
    obligationsRule: "wiProducerObligations",
    coverageVersion: "wiProducerCoverage",
    obligationsVersion: "wiProducerObligations",
    versionDate: "2026-04-02",
    law: WI_LAW,
    sourceUrl: "https://dnr.wisconsin.gov",
    sources: "dnr.wisconsin.gov battery law.",
    toCheck: "the version date (signing date).",
    coverage: {
      classes: standardClasses({
        citation: WI_LAW,
        removable: REMOVABLE,
        labels: STANDARD_LABELS,
      }),
      notChecked: ["medical devices", "E-Cycle Wisconsin electronics"],
    },
    obligations: {
      agency: "DNR",
      stewardshipOrganizations: [BATTERY_NETWORK],
      obligations: [
        obligation(
          "participate",
          PORTABLE_MEDIUM,
          on("2027-01-01"),
          "§ 287.175",
          "Join a battery stewardship organization in a submitted or approved plan.",
        ),
        obligation(
          "mark_producer",
          PORTABLE_MEDIUM,
          on("2027-01-01"),
          "§ 287.175",
          "Mark the brand or manufacturer name (not needed under ½ inch).",
        ),
        obligation(
          "mark_chemistry",
          PORTABLE_MEDIUM,
          on("2029-01-01"),
          "§ 287.175",
          "Label the chemistry and recycling information.",
        ),
      ],
    },
  },
  {
    code: "US-OR",
    jurisdiction: "oregon",
    coverageRule: "orProducerCoverage",
    obligationsRule: "orProducerObligations",
    coverageVersion: "orProducerCoverage",
    obligationsVersion: "orProducerObligations",
    versionDate: "2026-04-07",
    law: OR_LAW,
    sourceUrl: "https://olis.oregonlegislature.gov",
    sources: "olis.oregonlegislature.gov, HB 4144 enrolled.",
    toCheck: "the version date (signing date).",
    coverage: {
      classes: standardClasses({
        citation: OR_LAW,
        removable: REMOVABLE,
        labels: STANDARD_LABELS,
        sealedLeadOver11Outside: true,
        vehicleOutside: true,
      }),
      notChecked: [
        "medical devices",
        "battery energy storage systems",
        "recalled batteries",
      ],
    },
    obligations: {
      agency: "DEQ",
      stewardshipOrganizations: [],
      obligations: [
        obligation(
          "participate",
          PORTABLE_MEDIUM,
          on("2029-07-01"),
          "HB 4144 §§ 3(1), 21(2)",
          "Join a battery producer responsibility organization.",
        ),
      ],
    },
  },
  {
    code: "US-ME",
    jurisdiction: "maine",
    coverageRule: "meProducerCoverage",
    obligationsRule: "meProducerObligations",
    coverageVersion: "meProducerCoverage",
    obligationsVersion: "meProducerObligations",
    versionDate: "2026-04-03",
    law: ME_LAW,
    sourceUrl: "https://legislature.maine.gov",
    sources: "legislature.maine.gov, 38 M.R.S. § 1617.",
    toCheck:
      "the version date (signing date). Embedded batteries come in on 2030-01-01, as a new version then.",
    coverage: {
      classes: standardClasses({
        citation: ME_LAW,
        removable: REMOVABLE,
        labels: STANDARD_LABELS,
        sealedLeadOver11Outside: true,
      }),
      notChecked: ["medical devices"],
    },
    obligations: {
      agency: "Department of Environmental Protection",
      stewardshipOrganizations: [],
      obligations: [
        obligation(
          "participate",
          PORTABLE_MEDIUM,
          noDate(
            "180 days after the first battery stewardship plan is approved",
          ),
          "§ 1617(2)(A)",
          "Join an approved stewardship program.",
        ),
        obligation(
          "embedded_info",
          removabilityIn(["non_removable"]),
          on("2027-03-01"),
          "§ 1617(2)",
          "Give the information the law requires for products with embedded batteries.",
        ),
        obligation(
          "mark",
          PORTABLE_MEDIUM,
          noDate("2 years after the first plan is approved"),
          "§ 1617(3)",
          'Mark the producer, the chemistry and "not household waste".',
        ),
      ],
    },
  },
  {
    code: "US-CA",
    jurisdiction: "california",
    coverageRule: "caProducerCoverage",
    obligationsRule: "caProducerObligations",
    coverageVersion: "caProducerCoverage",
    obligationsVersion: "caProducerObligations",
    versionDate: "2023-01-01",
    law: CA_LAW,
    sourceUrl: "https://calrecycle.ca.gov",
    sources:
      "calrecycle.ca.gov, Batteries and Embedded Batteries; SB 501 summary, fbtgibbons.com.",
    toCheck: null,
    coverage: {
      classes: [
        {
          key: "covered_battery",
          label: "Covered battery (PRC § 42420.1(d))",
          band: "portable",
          citation: "PRC § 42420.1(d)",
          when: all(
            removabilityIn(REMOVABLE),
            any(
              all(chemistryIn(PRIMARY), kg("lte", "2")),
              all(
                chemistryIn(RECHARGEABLE_NO_LEAD),
                // "not (> 5 kg and > 300 Wh)"
                any(kg("lte", "5"), wh("lte", "300")),
              ),
            ),
          ),
        },
      ],
      notChecked: [],
    },
    obligations: {
      agency: "CalRecycle",
      stewardshipOrganizations: [],
      obligations: [
        obligation(
          "participate",
          PORTABLE_MEDIUM,
          noDate(
            "a plan approved within 24 months after CalRecycle's regulations take effect; they are not yet in force",
          ),
          "PRC §§ 42420–42428",
          "Join an approved stewardship program.",
        ),
        obligation(
          "sb1215_notice",
          all(
            removabilityIn(["non_removable"]),
            applicationIn(["consumer_electronics"]),
          ),
          yearly(7, 1, "2025-07-01"),
          "SB 1215",
          "Send retailers and CalRecycle your list of covered and exempt battery-embedded products.",
        ),
        obligation(
          "sb1215_label",
          all(
            removabilityIn(["non_removable"]),
            applicationIn(["consumer_electronics"]),
          ),
          on("2026-01-01"),
          "SB 1215",
          "Label the product with your name or brand, and give the battery chemistry on the label or your website.",
        ),
        obligation(
          "sb1215_report",
          all(
            removabilityIn(["non_removable"]),
            applicationIn(["consumer_electronics"]),
          ),
          yearly(7, 1, "2027-07-01"),
          "SB 1215",
          "Annual report to CalRecycle.",
        ),
      ],
    },
  },
  {
    code: "US-NY",
    jurisdiction: "newYork",
    coverageRule: "nyProducerCoverage",
    obligationsRule: "nyProducerObligations",
    coverageVersion: "nyProducerCoverage",
    obligationsVersion: "nyProducerObligations",
    versionDate: "2025-12-19",
    law: NY_LAW,
    sourceUrl: "https://www.nysenate.gov",
    sources: "nysenate.gov, S73A.",
    toCheck: null,
    coverage: {
      classes: [
        {
          key: "rechargeable",
          label: "Rechargeable battery (ECL § 27-1803(4))",
          band: "portable",
          citation: "ECL § 27-1803(4)",
          when: all(
            chemistryIn(RECHARGEABLE),
            lb("lt", "50"),
            applicationIn(NOT_VEHICLE),
          ),
        },
      ],
      notChecked: [
        "wheelchair batteries are excluded",
        "solar and wind storage",
        "memory backup",
      ],
    },
    obligations: {
      agency: "DEC",
      stewardshipOrganizations: [],
      obligations: [
        obligation(
          "participate",
          PORTABLE,
          on("2025-12-19"),
          "ECL § 27-1807(2-a)",
          "Run or join an approved collection plan to sell rechargeable batteries in New York.",
        ),
      ],
    },
  },
  {
    code: "US-MN",
    jurisdiction: "minnesota",
    coverageRule: "mnProducerCoverage",
    obligationsRule: "mnProducerObligations",
    coverageVersion: "mnProducerCoverage",
    obligationsVersion: "mnProducerObligations",
    versionDate: "1995-09-20",
    law: MN_LAW,
    sourceUrl: "https://www.revisor.mn.gov",
    sources: "revisor.mn.gov, § 115A.9157; pca.state.mn.us.",
    toCheck: "rechargeable, any removability.",
    coverage: {
      classes: [
        {
          key: "rechargeable",
          label: "Rechargeable battery or product (§ 115A.9157)",
          band: "portable",
          citation: "§ 115A.9157",
          when: chemistryIn(RECHARGEABLE),
        },
      ],
      notChecked: [],
    },
    obligations: {
      agency: "Pollution Control Agency",
      stewardshipOrganizations: [],
      obligations: [
        obligation(
          "participate",
          PORTABLE,
          on("1995-09-20"),
          "§ 115A.9157 subd. 5",
          "Run or join a collection program for your rechargeable batteries and products.",
        ),
      ],
    },
  },
  {
    code: "US-NJ",
    jurisdiction: "newJersey",
    coverageRule: "njProducerCoverage",
    obligationsRule: "njProducerObligations",
    coverageVersion: "njProducerCoverage",
    obligationsVersion: "njProducerObligations",
    versionDate: "2024-01-08",
    law: NJ_LAW,
    sourceUrl: "https://www.nj.gov/dep",
    sources: "nj.gov/dep, EV battery management.",
    toCheck:
      "the EV act's citation (N.J.S.A. 13:1E-99.81 et seq.); dry_cell_plan's date.",
    coverage: {
      classes: [
        propulsionClass("EV act"),
        {
          key: "nicd_sealed_lead",
          label: "Nickel-cadmium or sealed lead rechargeable battery",
          band: "portable",
          citation:
            "Dry Cell Battery Management Act (N.J.S.A. 13:1E-99.59 et seq.)",
          when: chemistryIn(["nicd", "lead_acid_sealed"]),
        },
      ],
      notChecked: [],
    },
    obligations: {
      agency: "NJDEP",
      stewardshipOrganizations: [],
      obligations: [
        obligation(
          "dry_cell_plan",
          PORTABLE,
          noDate("in force since the 1990s; date not on file"),
          "N.J.S.A. 13:1E-99.66",
          "Keep a battery management plan with NJDEP.",
        ),
        obligation(
          "ev_register",
          PROPULSION,
          on("2025-01-08"),
          "EV act",
          "Register with NJDEP as a propulsion battery producer.",
        ),
        obligation(
          "ev_annual_report",
          PROPULSION,
          yearly(1, 8, "2026-01-08"),
          "EV act",
          "Report the propulsion batteries you sold into New Jersey.",
        ),
        obligation(
          "ev_plan",
          PROPULSION,
          noDate(
            "180 days after NJDEP adopts its battery management plan rules",
          ),
          "EV act",
          "Send NJDEP a battery management plan.",
        ),
      ],
    },
  },
  {
    code: "US-IA",
    jurisdiction: "iowa",
    coverageRule: "iaProducerCoverage",
    obligationsRule: "iaProducerObligations",
    coverageVersion: "iaProducerCoverage",
    obligationsVersion: "iaProducerObligations",
    versionDate: "1996-07-01",
    law: IA_LAW,
    sourceUrl: "https://www.legis.iowa.gov",
    sources: "legis.iowa.gov, § 455D.10A.",
    toCheck: "the class, stored as portable.",
    coverage: {
      classes: [
        {
          key: "rechargeable_household",
          label: "Rechargeable household battery (§ 455D.10A)",
          band: "portable",
          citation: "§ 455D.10A",
          when: all(
            chemistryIn(["nicd", "lead_acid_sealed"]),
            lb("lt", "25"),
            applicationIn(NOT_VEHICLE),
          ),
        },
      ],
      notChecked: [],
    },
    obligations: {
      agency: "Department of Natural Resources",
      stewardshipOrganizations: [],
      obligations: [
        obligation(
          "participate",
          PORTABLE,
          on("1996-07-01"),
          "§ 455D.10A(2)(c)",
          "Take part in a collection system for these batteries.",
        ),
      ],
    },
  },
  {
    code: "US-DC",
    jurisdiction: "districtOfColumbia",
    coverageRule: "dcProducerCoverage",
    obligationsRule: "dcProducerObligations",
    coverageVersion: "dcProducerCoverage",
    obligationsVersion: "dcProducerObligations",
    versionDate: "2021-10-01",
    law: DC_LAW,
    sourceUrl: "https://code.dccouncil.gov",
    sources: "code.dccouncil.gov, § 8-771.01.",
    toCheck: null,
    coverage: {
      classes: [
        {
          key: "primary_or_rechargeable",
          label: "Primary or rechargeable battery (§ 8-771.01)",
          band: "portable",
          citation: "§ 8-771.01",
          when: all(
            any(
              all(chemistryIn(PRIMARY), lb("lte", "4.4")),
              // "less than 11 pounds" — lt, where the rest say "no more than".
              all(chemistryIn(RECHARGEABLE), lb("lt", "11"), wh("lte", "300")),
            ),
            applicationIn(NOT_VEHICLE),
          ),
        },
      ],
      notChecked: ["medical devices", "covered electronic equipment"],
    },
    obligations: {
      agency: "DOEE",
      stewardshipOrganizations: [BATTERY_NETWORK],
      obligations: [
        obligation(
          "participate",
          PORTABLE,
          on("2021-10-01"),
          "D.C. Code § 8-771.02(a)(1), (c)",
          "Be a member of a battery stewardship organization.",
        ),
      ],
    },
  },
];

/** California's coverage under SB 501 (Stats. 2026, ch. 414), scheduled. */
const CA_COVERAGE_2027: JsonObject = {
  classes: standardClasses({
    citation: "SB 501 (Stats. 2026, ch. 414)",
    removable: REMOVABLE,
    labels: {
      portablePrimary: "Small format battery",
      portableRechargeable: "Small format battery",
      mediumPrimary: "Medium format battery",
      mediumRechargeable: "Medium format battery",
    },
    rechargeable: RECHARGEABLE_NO_LEAD,
  }),
  notChecked: [],
};

// --- rules and versions ---------------------------------------------------------------------

const RULE_ATTRIBUTION = {
  isActive: true,
  appliesToApplicationClasses: null,
  createdAt: SPEC_READ,
  updatedAt: SPEC_READ,
  createdBy: ID.USER.platformAdmin,
  updatedBy: ID.USER.platformAdmin,
} as const;

export const jurisdictionRules: readonly JurisdictionRule[] = LAWS.flatMap(
  (law): JurisdictionRule[] => [
    {
      id: ID.JURISDICTION_RULE[law.coverageRule],
      jurisdictionId: ID.JURISDICTION[law.jurisdiction],
      ruleKey: "producer.coverage",
      domain: "format_threshold",
      title: "Producer law — battery classes",
      description:
        "Which batteries the state's producer law covers, and in which class, checked in order (Rule 8.8).",
      ...RULE_ATTRIBUTION,
    },
    {
      id: ID.JURISDICTION_RULE[law.obligationsRule],
      jurisdictionId: ID.JURISDICTION[law.jurisdiction],
      ruleKey: "producer.obligations",
      domain: "producer_obligation",
      title: "Producer law — obligations",
      description:
        "What a producer must do under the state's law, and by when (Rules 8.9, 8.10).",
      ...RULE_ATTRIBUTION,
    },
  ],
);

function sourceRef(law: StateLaw): string {
  const read = `Read 17 Nov 2026 from: ${law.sources}`;
  return law.toCheck === null
    ? read
    : `${read} ⚑ To check against the official text in unit 20: ${law.toCheck}`;
}

function version(input: {
  readonly id: string;
  readonly ruleId: string;
  readonly law: StateLaw;
  readonly effectiveOn: string;
  readonly expiresOn: string | null;
  readonly citation: string;
  readonly payload: JsonObject;
  readonly schema: string;
  readonly supersedes: string | null;
  readonly status: RuleVersion["status"];
}): RuleVersion {
  return {
    id: input.id,
    jurisdictionRuleId: input.ruleId,
    versionLabel: input.effectiveOn,
    effectiveOn: input.effectiveOn,
    expiresOn: input.expiresOn,
    citation: input.citation,
    citationUrl: input.law.sourceUrl,
    sourceDocumentRef: sourceRef(input.law),
    payload: input.payload,
    payloadSchemaKey: input.schema,
    supersedesRuleVersionId: input.supersedes,
    status: input.status,
    publishedAt: SPEC_READ,
    publishedBy: ID.USER.platformAdmin,
    createdAt: SPEC_READ,
    createdBy: ID.USER.platformAdmin,
  };
}

export const ruleVersions: readonly RuleVersion[] = LAWS.flatMap(
  (law): RuleVersion[] => {
    const rows: RuleVersion[] = [
      version({
        id: ID.RULE_VERSION[law.coverageVersion],
        ruleId: ID.JURISDICTION_RULE[law.coverageRule],
        law,
        effectiveOn: law.versionDate,
        // California's first coverage version ends where SB 501's begins:
        // "expires 2026-12-31" is its last day, so the exclusive end is the next.
        expiresOn:
          law.coverageVersion === "caProducerCoverage" ? "2027-01-01" : null,
        citation: law.law,
        payload: law.coverage,
        schema: "producer.coverage.v1",
        supersedes: null,
        status: "active",
      }),
      version({
        id: ID.RULE_VERSION[law.obligationsVersion],
        ruleId: ID.JURISDICTION_RULE[law.obligationsRule],
        law,
        effectiveOn: law.versionDate,
        expiresOn: null,
        citation: law.law,
        payload: law.obligations,
        schema: "producer.obligations.v1",
        supersedes: null,
        status: "active",
      }),
    ];
    if (law.coverageVersion === "caProducerCoverage") {
      rows.push(
        version({
          id: ID.RULE_VERSION.caProducerCoverage2027,
          ruleId: ID.JURISDICTION_RULE.caProducerCoverage,
          law: {
            ...law,
            toCheck: "no lead-acid in the 2027 classes.",
          },
          effectiveOn: "2027-01-01",
          expiresOn: null,
          citation: `${law.law}; SB 501 (Stats. 2026, ch. 414)`,
          payload: CA_COVERAGE_2027,
          schema: "producer.coverage.v1",
          supersedes: ID.RULE_VERSION.caProducerCoverage,
          status: "scheduled",
        }),
      );
    }
    return rows;
  },
);

// --- catalog --------------------------------------------------------------------------------

const CATALOG_PUBLISHED = "2026-11-02T00:00:00.000Z";

function entry(
  fields: Pick<
    CatalogEntry,
    | "id"
    | "manufacturerName"
    | "brandName"
    | "modelName"
    | "partNumber"
    | "partNumberNormalized"
    | "applicationClass"
    | "removability"
    | "chemistry"
    | "cellFormFactor"
    | "nominalVoltageV"
    | "ratedCapacityAh"
    | "ratedEnergyWh"
    | "massKg"
    | "unIdentifier"
    | "properShippingName"
    | "hazardClass"
  >,
): CatalogEntry {
  return {
    ...fields,
    organizationId: null,
    gtin: null,
    packingGroup: "not_applicable",
    un383SummaryUrl: null,
    labelTextPatterns: null,
    dateCodeFormatKey: null,
    sourceType: "manufacturer_datasheet",
    sourceUrl: null,
    status: "published",
    verifiedBy: ID.USER.platformAdmin,
    verifiedAt: CATALOG_PUBLISHED,
    createdAt: CATALOG_PUBLISHED,
    updatedAt: CATALOG_PUBLISHED,
    createdBy: ID.USER.platformAdmin,
    updatedBy: ID.USER.platformAdmin,
  };
}

export const catalogEntries: readonly CatalogEntry[] = [
  entry({
    id: ID.CATALOG.tidewaterAlkalineAa,
    manufacturerName: "Tidewater Cell Co.",
    brandName: "Tidewater",
    modelName: "TW-AA4",
    partNumber: "TW-AA4-LR6",
    partNumberNormalized: "TWAA4LR6",
    applicationClass: "consumer_electronics",
    removability: "user_removable",
    chemistry: "alkaline",
    cellFormFactor: "cylindrical",
    nominalVoltageV: "1.500",
    ratedCapacityAh: "2.600",
    ratedEnergyWh: "3.900",
    massKg: "0.023",
    unIdentifier: null,
    properShippingName: null,
    hazardClass: null,
  }),
  entry({
    id: ID.CATALOG.kestrelScrubberLfp,
    manufacturerName: "Kestrel Floorcare",
    brandName: "Kestrel",
    modelName: "FS-48",
    partNumber: "FS-48-LFP",
    partNumberNormalized: "FS48LFP",
    applicationClass: "industrial",
    removability: "tool_removable",
    chemistry: "li_lfp",
    cellFormFactor: "prismatic",
    nominalVoltageV: "25.600",
    ratedCapacityAh: "60.000",
    ratedEnergyWh: "1536.000",
    massKg: "13.600",
    unIdentifier: "un3480",
    properShippingName: "Lithium ion batteries",
    hazardClass: "9",
  }),
  entry({
    // No weight on file — normal, and it reads "Can't tell", never "Doesn't apply".
    id: ID.CATALOG.harborTrollingLfp,
    manufacturerName: "Harbor Marine Power",
    brandName: "Harbor",
    modelName: "TM-12",
    partNumber: "TM-12-LFP100",
    partNumberNormalized: "TM12LFP100",
    applicationClass: "consumer_electronics",
    removability: "user_removable",
    chemistry: "li_lfp",
    cellFormFactor: "prismatic",
    nominalVoltageV: "12.800",
    ratedCapacityAh: "100.000",
    ratedEnergyWh: "1280.000",
    massKg: null,
    unIdentifier: "un3480",
    properShippingName: "Lithium ion batteries",
    hazardClass: "9",
  }),
  entry({
    // Zinc-air has no T-01 value, so it is `other` — and can't be told.
    id: ID.CATALOG.brightlineZincAir,
    manufacturerName: "Brightline Hearing",
    brandName: "Brightline",
    modelName: "675-ZA",
    partNumber: "BL-675-ZA",
    partNumberNormalized: "BL675ZA",
    applicationClass: "consumer_electronics",
    removability: "user_removable",
    chemistry: "other",
    cellFormFactor: "button_coin",
    nominalVoltageV: "1.450",
    ratedCapacityAh: "0.600",
    ratedEnergyWh: "0.870",
    massKg: "0.002",
    unIdentifier: null,
    properShippingName: null,
    hazardClass: null,
  }),
];

// --- Priya's products -----------------------------------------------------------------------

export const PRODUCTS_DECLARED_AT = "2026-11-09T17:00:00.000Z";

function product(
  id: string,
  catalogEntryId: string,
  states: readonly (keyof typeof ID.JURISDICTION)[],
): ProducerProduct {
  return {
    id,
    organizationId: ID.ORG.cascade,
    catalogEntryId,
    jurisdictionIds: states.map((state) => ID.JURISDICTION[state]),
    addedAt: PRODUCTS_DECLARED_AT,
    addedBy: ID.USER.priyaProducer,
    removedAt: null,
    removedBy: null,
    removalReason: null,
    createdAt: PRODUCTS_DECLARED_AT,
    updatedAt: PRODUCTS_DECLARED_AT,
  };
}

/**
 * Between them, every T-06 band and every T-68 status, a state with no rules
 * (Florida), overdue, done, annual and "No date yet" deadlines, and
 * California's scheduled coverage version (spec §6):
 *
 * | Product | States | What it shows |
 * | --- | --- | --- |
 * | Tidewater TW-AA4 (alkaline) | WA IL DC VT MN FL | portable; MN not covered, so MN doesn't apply; FL no rules; VT's annual report; DC done |
 * | Kestrel FS-48 (30 lb, 1,536 Wh) | WA CT DC | large in WA, medium in CT, not covered in DC |
 * | Harbor TM-12 (no weight) | WA OR | can't tell — OR's obligation can't tell yet |
 * | Halden HM-L58 (embedded) | CA ME NY | not covered in CA and ME; CA's annual notices; NY overdue |
 * | Northvale NV-TP400 (vehicle) | CO NJ | propulsion; NJ's "No date yet" |
 * | Brightline 675-ZA (zinc-air) | IL | can't tell: chemistry recorded as Other |
 */
export const producerProducts: readonly ProducerProduct[] = [
  product(
    ID.PRODUCER_PRODUCT.tidewaterAlkalineAa,
    ID.CATALOG.tidewaterAlkalineAa,
    [
      "washington",
      "illinois",
      "districtOfColumbia",
      "vermont",
      "minnesota",
      "florida",
    ],
  ),
  product(
    ID.PRODUCER_PRODUCT.kestrelScrubberLfp,
    ID.CATALOG.kestrelScrubberLfp,
    ["washington", "connecticut", "districtOfColumbia"],
  ),
  product(ID.PRODUCER_PRODUCT.harborTrollingLfp, ID.CATALOG.harborTrollingLfp, [
    "washington",
    "oregon",
  ]),
  product(ID.PRODUCER_PRODUCT.haldenLaptop, ID.CATALOG.laptopCellLco, [
    "california",
    "maine",
    "newYork",
  ]),
  product(
    ID.PRODUCER_PRODUCT.northvaleTraction,
    ID.CATALOG.vehicleTractionNmc,
    ["colorado", "newJersey"],
  ),
  product(ID.PRODUCER_PRODUCT.brightlineZincAir, ID.CATALOG.brightlineZincAir, [
    "illinois",
  ]),
];

/** When Cascade's seeded run ran, as the nightly job — 07:00 Pacific. */
export const SEEDED_OBLIGATIONS_AT = "2026-11-16T15:00:00.000Z";

/** Priya marks DC's participation deadline done, after the run (Rule 8.12). */
export const SEEDED_COMPLETION = {
  jurisdiction: "districtOfColumbia",
  obligationKey: "participate",
  completedOn: "2026-06-15",
  completedAt: "2026-11-16T18:30:00.000Z",
  note: "Joined The Battery Network for DC on 15 June 2026; membership confirmed by email.",
  reference: "BN-DC-20431",
} as const;
