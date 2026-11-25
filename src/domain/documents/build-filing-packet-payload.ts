import type {
  FilingDefinition,
  FilingDocumentType,
  FilingItem,
} from "@/domain/producer/filings";
import {
  CATALOG_FIXER,
  CONTACT_FIXER,
  gapSummaryWords,
  missingEntriesWords,
  NO_FILING_WORDS,
  NONE,
  NOT_APPLICABLE_WORDS,
  NOT_HELD_HERE,
  NOT_ON_FILE,
  NOT_THE_FILING,
  ORGANIZATION_FIXER,
  SALES_FIXER,
  sendToWords,
  undeterminedWords,
} from "@/domain/producer/filing-words";
import { periodWords, type ResolvedPeriod } from "@/domain/producer/period";
import type { Truth } from "@/domain/producer/conditions";
import { basisCivilDate } from "@/domain/hazard/words";
import {
  ruleOutcome,
  type AppliedRuleVersion,
  type RuleOutcome,
} from "@/domain/rules/outcome";
import { CHEMISTRY_LABELS, type Chemistry } from "@/domain/taxonomy/chemistry";
import {
  FILING_ITEM_SOURCE_LABELS,
  type FilingItemSource,
} from "@/domain/taxonomy/filing-item-source";
import type { ProducerObligationStatus } from "@/domain/taxonomy/producer-obligation-status";
import { addDecimal, isDecimalString, multiplyDecimal } from "@/domain/units";
import type { IsoDate, PostalAddress } from "@/types/common";

import type { DocumentPayloadBuild } from "./build-shipping-paper-payload";
import type { DocumentIdentity } from "./document-identity";

/**
 * A filing packet or an annual report — `TECHNICAL_SPEC.md` §8.5; Rules
 * 8.17–8.22; T-38 `filing_packet` / `annual_report`; T-71.
 *
 * **One pure builder for both types.** From the filing's items (the rule
 * data), the period (Rule 8.21), the sales entries (Rule 8.17), the catalog
 * entries and the organization, it returns what the packet says, as a
 * `RuleOutcome`. **Gaps are values, not errors** (Rule 8.20):
 *
 * - a value the platform should hold and doesn't reads **"Not on file"**,
 *   with who can fix it
 * - an item the platform doesn't keep reads **"Not held here — add it on the
 *   agency's form"**, by name
 * - a total with a gap in it says how many entries are missing, and is never
 *   shown as complete — and a total no entry contributed to reads "Not on
 *   file", **never zero**
 *
 * It fails only when the obligation doesn't apply (`undetermined` names the
 * missing input) or the filing has no rule. **Weight is units × the catalog's
 * `mass_kg`, summed per chemistry, through `src/domain/units.ts`** — never
 * typed. No item, label, period or citation is written here: every one is
 * placed from the rule data (Rule 1.23).
 *
 * Every date and name on the page is in the content, so the packet is
 * byte-deterministic from its snapshot (`TECHNICAL_SPEC.md` §8.1).
 */

// --- inputs ---------------------------------------------------------------------------------

/** A version the packet cites — the filings version and the obligations version. */
export type FilingVersionReference = {
  readonly jurisdictionRuleId: string;
  readonly ruleVersionId: string;
  readonly ruleKey: string;
  readonly versionLabel: string;
  readonly effectiveOn: IsoDate;
  readonly citation: string;
  readonly citationUrl: string | null;
};

/** One product sold in the state, with its truth on this obligation as the run stored it. */
export type FilingProduct = {
  readonly productId: string;
  readonly catalogEntryId: string;
  /** How the product reads: brand (or maker) and model. */
  readonly label: string;
  readonly manufacturerName: string;
  readonly brandName: string | null;
  readonly modelName: string | null;
  readonly partNumber: string | null;
  readonly gtin: string | null;
  /** T-01. */
  readonly chemistry: string;
  readonly massKg: string | null;
  readonly truth: Truth;
  /** Why it can't be told, in words — empty unless `cant_tell`. */
  readonly missing: readonly string[];
};

/** One current sales entry (Rule 8.17). Units are whole numbers; zero is an entry. */
export type FilingSalesEntry = {
  readonly id: string;
  readonly productId: string;
  readonly year: number;
  readonly units: number;
  readonly basisNote: string;
};

export type FilingAddress = {
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
};

export interface FilingPacketInputs {
  /** `null` where the rule data names no filing for the obligation. */
  readonly filing: FilingDefinition | null;
  readonly filingsVersion: FilingVersionReference | null;
  readonly obligation: {
    readonly id: string;
    readonly key: string;
    readonly duty: string;
    readonly citation: string;
    readonly status: ProducerObligationStatus;
    /** Why it can't be told, in words — for `undetermined`. */
    readonly missing: readonly string[];
    readonly version: FilingVersionReference;
  };
  readonly state: {
    readonly jurisdictionId: string;
    readonly code: string;
    readonly name: string;
  };
  readonly deadline: { readonly id: string; readonly dueOn: IsoDate };
  readonly period: ResolvedPeriod;
  readonly organization: {
    readonly id: string;
    readonly name: string;
    readonly legalName: string | null;
    readonly primaryAddress: PostalAddress | null;
    readonly mailingAddress: PostalAddress | null;
  };
  /** The person making the packet (T-71 `contact`). */
  readonly contact: {
    readonly userId: string;
    readonly name: string | null;
    readonly email: string;
  };
  /** Every product sold in the state. */
  readonly products: readonly FilingProduct[];
  /** The current entries for this state. Entries outside the period are ignored. */
  readonly sales: readonly FilingSalesEntry[];
}

// --- the content: the render's input snapshot --------------------------------------------------

export type FilingLine =
  | { readonly kind: "value"; readonly text: string }
  /** Rule 8.20 — "Not on file", with who can fix it. */
  | { readonly kind: "gap"; readonly what: string; readonly fixer: string }
  /** Rule 8.20 — an item the platform doesn't keep, by name. */
  | { readonly kind: "not_held"; readonly text: string }
  /** A total — `missing` above zero is never complete. */
  | {
      readonly kind: "total";
      readonly text: string;
      readonly missing: number;
    };

export type FilingPacketItem = {
  readonly source: FilingItemSource;
  /** T-71's label. */
  readonly sourceLabel: string;
  /** The law's words. */
  readonly label: string;
  readonly citation: string;
  readonly lines: readonly FilingLine[];
  /** Values not on file in this item. */
  readonly gaps: number;
};

export type FilingPacketContent = {
  readonly documentType: FilingDocumentType;
  readonly title: string;
  readonly sendTo: string;
  readonly sendToWords: string;
  readonly notTheFiling: string;
  readonly citation: string;
  readonly citationUrl: string | null;
  /** The filings version's citation — the law the filing comes from. */
  readonly law: string;
  readonly filingsVersionLabel: string;
  readonly state: {
    readonly jurisdictionId: string;
    readonly code: string;
    readonly name: string;
  };
  readonly obligation: {
    readonly id: string;
    readonly key: string;
    readonly duty: string;
    readonly citation: string;
    readonly status: ProducerObligationStatus;
  };
  readonly deadline: {
    readonly id: string;
    readonly dueOn: IsoDate;
    readonly dueOnText: string;
  };
  readonly period: {
    readonly kind: ResolvedPeriod["kind"];
    readonly years: readonly number[];
    readonly words: string;
    /** Rule 8.21 — who picked the year, where the law names none. */
    readonly chosenByUserId: string | null;
    readonly chosenByName: string | null;
  };
  readonly items: readonly FilingPacketItem[];
  readonly gaps: {
    readonly notOnFile: number;
    readonly notHeld: number;
    readonly words: string;
  };
  /** What the packet read — `TECHNICAL_SPEC.md` §8.2's "the inputs it used". */
  readonly inputs: {
    readonly salesEntryIds: readonly string[];
    readonly sales: readonly FilingSalesEntry[];
    readonly catalog: readonly {
      readonly productId: string;
      readonly catalogEntryId: string;
      readonly manufacturerName: string;
      readonly brandName: string | null;
      readonly modelName: string | null;
      readonly partNumber: string | null;
      readonly gtin: string | null;
      readonly chemistry: string;
      readonly massKg: string | null;
      readonly truth: Truth;
    }[];
    readonly organization: {
      readonly id: string;
      readonly name: string;
      readonly legalName: string | null;
      readonly primaryAddress: FilingAddress | null;
      readonly mailingAddress: FilingAddress | null;
    };
    readonly contact: {
      readonly userId: string;
      readonly name: string | null;
      readonly email: string;
    };
  };
};

export type FilingPacketBuild =
  | { readonly ok: true; readonly outcome: RuleOutcome<FilingPacketContent> }
  | {
      readonly ok: false;
      readonly reason: "not_applicable" | "undetermined" | "no_filing";
      /** What the page says — Rule 8.19 names the missing input. */
      readonly words: string;
    };

// --- display helpers (strings only; arithmetic is `units.ts`'s) --------------------------------

/** Whole units, grouped: "120,000". */
function unitsText(units: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    units,
  );
}

/** A decimal as digits, grouped, trailing zeros dropped: "2760.000" → "2,760". */
function decimalText(value: string): string {
  const [whole = "0", fraction = ""] = value.split(".");
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  const kept = fraction.replace(/0+$/u, "");
  return `${negative ? "-" : ""}${grouped}${kept === "" ? "" : `.${kept}`}`;
}

function yearsText(years: readonly number[]): string {
  if (years.length === 0) return "";
  const first = years[0];
  const last = years[years.length - 1];
  return first === last ? String(first) : `${String(first)}–${String(last)}`;
}

function chemistryLabel(code: string): string | null {
  if (code === "unknown") return null;
  return code in CHEMISTRY_LABELS ? CHEMISTRY_LABELS[code as Chemistry] : code;
}

function filingAddress(value: PostalAddress | null): FilingAddress | null {
  if (value === null) return null;
  return {
    line1: value.line1,
    line2: value.line2 ?? null,
    city: value.city,
    region: value.region,
    postalCode: value.postalCode,
    country: value.country,
  };
}

function isComplete(address: FilingAddress | null): address is FilingAddress {
  return (
    address !== null &&
    [
      address.line1,
      address.city,
      address.region,
      address.postalCode,
      address.country,
    ].every((part) => part.trim() !== "")
  );
}

function addressText(address: FilingAddress): string {
  return [
    address.line1,
    address.line2,
    `${address.city}, ${address.region} ${address.postalCode}`,
    address.country,
  ]
    .filter((part): part is string => part !== null && part.trim() !== "")
    .join(", ");
}

function blank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

function value(text: string): FilingLine {
  return { kind: "value", text };
}

function gap(what: string, fixer: string): FilingLine {
  return { kind: "gap", what, fixer };
}

// --- one item, by its source (T-71) -----------------------------------------------------------

interface ItemContext {
  readonly inputs: FilingPacketInputs;
  readonly years: readonly number[];
  /** The products the obligation applies to. */
  readonly applying: readonly FilingProduct[];
  /** The products it can't be told whether it applies to — never left out (Rule 8.20). */
  readonly undecided: readonly FilingProduct[];
  /** The current entries in the period, by product and year. */
  readonly entry: (productId: string, year: number) => FilingSalesEntry | null;
}

/** Products it can't be told whether this obligation covers — a gap in every product item. */
function undecidedGaps(context: ItemContext): readonly FilingLine[] {
  return context.undecided.map((product) =>
    gap(
      `${product.label}: whether this obligation covers it${
        product.missing.length === 0 ? "" : ` (${product.missing.join(", ")})`
      }`,
      CATALOG_FIXER,
    ),
  );
}

function identityLines(context: ItemContext): readonly FilingLine[] {
  const organization = context.inputs.organization;
  const lines: FilingLine[] = [
    value(organization.legalName ?? organization.name),
  ];
  const primary = filingAddress(organization.primaryAddress);
  lines.push(
    isComplete(primary)
      ? value(`Address: ${addressText(primary)}`)
      : gap(
          `${organization.legalName ?? organization.name}: address`,
          ORGANIZATION_FIXER,
        ),
  );
  const mailing = filingAddress(organization.mailingAddress);
  if (isComplete(mailing)) {
    lines.push(value(`Mailing address: ${addressText(mailing)}`));
  }
  return lines;
}

function contactLines(context: ItemContext): readonly FilingLine[] {
  const contact = context.inputs.contact;
  return blank(contact.name)
    ? [
        gap("Name of the person making this packet", CONTACT_FIXER),
        value(contact.email),
      ]
    : [value(`${contact.name ?? ""} — ${contact.email}`)];
}

function brandLines(context: ItemContext): readonly FilingLine[] {
  const lines: FilingLine[] = [];
  const seen = new Set<string>();
  for (const product of context.applying) {
    if (blank(product.brandName)) {
      lines.push(gap(`${product.label}: brand name`, CATALOG_FIXER));
      continue;
    }
    const brand = product.brandName ?? "";
    if (seen.has(brand)) continue;
    seen.add(brand);
    lines.push(value(brand));
  }
  return [...lines, ...undecidedGaps(context)];
}

function productLines(context: ItemContext): readonly FilingLine[] {
  const lines: FilingLine[] = [];
  for (const product of context.applying) {
    const held: string[] = [];
    const missing: string[] = [];
    const field = (name: string, text: string | null): void => {
      if (blank(text)) missing.push(name);
      else held.push(`${name} ${text ?? ""}`);
    };
    field("brand", product.brandName);
    field("model", product.modelName);
    field("part number", product.partNumber);
    field("GTIN", product.gtin);
    const chemistry = chemistryLabel(product.chemistry);
    if (chemistry === null) missing.push("chemistry");
    else held.push(chemistry);
    lines.push(value(`${product.label} — ${held.join(" · ")}`));
    for (const name of missing) {
      lines.push(gap(`${product.label}: ${name}`, CATALOG_FIXER));
    }
  }
  return [...lines, ...undecidedGaps(context)];
}

function outsideLines(context: ItemContext): readonly FilingLine[] {
  const outside = context.inputs.products.filter(
    (product) => product.truth === "false",
  );
  return outside.length === 0
    ? [value(NONE)]
    : outside.map((product) =>
        value(
          [product.label, product.partNumber]
            .filter((part): part is string => !blank(part))
            .join(" — "),
        ),
      );
}

function chemistryLines(context: ItemContext): readonly FilingLine[] {
  const lines: FilingLine[] = [];
  const seen = new Set<string>();
  for (const product of context.applying) {
    const label = chemistryLabel(product.chemistry);
    if (label === null) {
      lines.push(gap(`${product.label}: chemistry`, CATALOG_FIXER));
      continue;
    }
    if (seen.has(label)) continue;
    seen.add(label);
    lines.push(value(label));
  }
  return [...lines, ...undecidedGaps(context)];
}

function unitLines(context: ItemContext): readonly FilingLine[] {
  const lines: FilingLine[] = [];
  for (const year of context.years) {
    // Summed as digits, like every quantity (`units.ts`).
    let total = "0";
    let counted = 0;
    let missing = 0;
    for (const product of context.applying) {
      const entry = context.entry(product.productId, year);
      if (entry === null) {
        missing += 1;
        lines.push(
          gap(`${product.label}, ${String(year)}: units`, SALES_FIXER),
        );
        continue;
      }
      counted += 1;
      total = addDecimal(total, String(entry.units));
      lines.push(
        value(
          `${product.label}, ${String(year)}: ${unitsText(entry.units)} units`,
        ),
      );
    }
    lines.push({
      kind: "total",
      // A total no entry reached is not zero — it is not on file.
      text: `Total, ${String(year)}: ${counted === 0 ? NOT_ON_FILE : `${decimalText(total)} units`}`,
      missing,
    });
  }
  return [...lines, ...undecidedGaps(context)];
}

function weightLines(context: ItemContext): readonly FilingLine[] {
  const lines: FilingLine[] = [];
  const byChemistry = new Map<string, FilingProduct[]>();
  for (const product of context.applying) {
    const key = chemistryLabel(product.chemistry) ?? "Chemistry not on file";
    byChemistry.set(key, [...(byChemistry.get(key) ?? []), product]);
  }
  for (const [chemistry, products] of byChemistry) {
    let total = "0";
    let counted = 0;
    let missing = 0;
    for (const product of products) {
      const mass =
        product.massKg !== null && isDecimalString(product.massKg)
          ? product.massKg
          : null;
      if (mass === null) {
        lines.push(gap(`${product.label}: weight`, CATALOG_FIXER));
      }
      for (const year of context.years) {
        const entry = context.entry(product.productId, year);
        if (entry === null) {
          missing += 1;
          lines.push(
            gap(`${product.label}, ${String(year)}: units`, SALES_FIXER),
          );
          continue;
        }
        if (mass === null) {
          // The entry is on file, but it can't be weighed.
          missing += 1;
          continue;
        }
        const weight = multiplyDecimal(String(entry.units), mass);
        total = addDecimal(total, weight);
        counted += 1;
        lines.push(
          value(
            `${product.label}, ${String(year)}: ${unitsText(entry.units)} units × ${decimalText(mass)} kg = ${decimalText(weight)} kg`,
          ),
        );
      }
    }
    lines.push({
      kind: "total",
      text: `${chemistry}, ${yearsText(context.years)}: ${counted === 0 ? NOT_ON_FILE : `${decimalText(total)} kg`}`,
      missing,
    });
  }
  return [...lines, ...undecidedGaps(context)];
}

function linesFor(
  item: FilingItem,
  context: ItemContext,
): readonly FilingLine[] {
  switch (item.source) {
    case "producer_identity":
      return identityLines(context);
    case "contact":
      return contactLines(context);
    case "brands":
      return brandLines(context);
    case "products":
      return productLines(context);
    case "products_outside":
      return outsideLines(context);
    case "chemistries":
      return chemistryLines(context);
    case "units":
      return unitLines(context);
    case "weight":
      return weightLines(context);
    case "statement":
      return [value(item.text ?? "")];
    case "not_held":
      return [{ kind: "not_held", text: NOT_HELD_HERE }];
  }
}

// --- the builder -----------------------------------------------------------------------------

export function buildFilingPacketContent(
  inputs: FilingPacketInputs,
): FilingPacketBuild {
  const { filing, filingsVersion, obligation } = inputs;
  if (obligation.status === "undetermined") {
    return {
      ok: false,
      reason: "undetermined",
      words: undeterminedWords(obligation.missing),
    };
  }
  if (obligation.status === "not_applicable") {
    return { ok: false, reason: "not_applicable", words: NOT_APPLICABLE_WORDS };
  }
  if (filing === null || filingsVersion === null) {
    return { ok: false, reason: "no_filing", words: NO_FILING_WORDS };
  }

  const years: readonly number[] = inputs.period.years;
  const inPeriod = inputs.sales.filter((entry) => years.includes(entry.year));
  const entries = new Map(
    inPeriod.map((entry) => [
      `${entry.productId}:${String(entry.year)}`,
      entry,
    ]),
  );
  const context: ItemContext = {
    inputs,
    years,
    applying: inputs.products.filter((product) => product.truth === "true"),
    undecided: inputs.products.filter(
      (product) => product.truth === "cant_tell",
    ),
    entry: (productId, year) =>
      entries.get(`${productId}:${String(year)}`) ?? null,
  };

  const items: FilingPacketItem[] = filing.items.map((item) => {
    const lines = linesFor(item, context);
    return {
      source: item.source,
      sourceLabel: FILING_ITEM_SOURCE_LABELS[item.source],
      label: item.label,
      citation: item.citation,
      lines,
      gaps: lines.filter((line) => line.kind === "gap").length,
    };
  });
  const notOnFile = items.reduce((sum, item) => sum + item.gaps, 0);
  const notHeld = items.filter((item) => item.source === "not_held").length;
  const choice =
    inputs.period.kind === "chosen_year" ? inputs.period.choice : null;
  const usedSales = [...inPeriod].sort(
    (a, b) => a.productId.localeCompare(b.productId) || a.year - b.year,
  );

  const content: FilingPacketContent = {
    documentType: filing.documentType,
    title: filing.title,
    sendTo: filing.sendTo,
    sendToWords: sendToWords(filing.sendTo),
    notTheFiling: NOT_THE_FILING,
    citation: filing.citation,
    citationUrl: filing.citationUrl,
    law: filingsVersion.citation,
    filingsVersionLabel: filingsVersion.versionLabel,
    state: inputs.state,
    obligation: {
      id: obligation.id,
      key: obligation.key,
      duty: obligation.duty,
      citation: obligation.citation,
      status: obligation.status,
    },
    deadline: {
      id: inputs.deadline.id,
      dueOn: inputs.deadline.dueOn,
      dueOnText: basisCivilDate(inputs.deadline.dueOn),
    },
    period: {
      kind: inputs.period.kind,
      years: [...years],
      words: periodWords(inputs.period),
      chosenByUserId: choice?.chosenByUserId ?? null,
      chosenByName: choice?.chosenByName ?? null,
    },
    items,
    gaps: {
      notOnFile,
      notHeld,
      words: gapSummaryWords({ notOnFile, notHeld }),
    },
    inputs: {
      salesEntryIds: usedSales.map((entry) => entry.id),
      sales: usedSales,
      catalog: inputs.products.map((product) => ({
        productId: product.productId,
        catalogEntryId: product.catalogEntryId,
        manufacturerName: product.manufacturerName,
        brandName: product.brandName,
        modelName: product.modelName,
        partNumber: product.partNumber,
        gtin: product.gtin,
        chemistry: product.chemistry,
        massKg: product.massKg,
        truth: product.truth,
      })),
      organization: {
        id: inputs.organization.id,
        name: inputs.organization.name,
        legalName: inputs.organization.legalName,
        primaryAddress: filingAddress(inputs.organization.primaryAddress),
        mailingAddress: filingAddress(inputs.organization.mailingAddress),
      },
      contact: inputs.contact,
    },
  };

  const applied: AppliedRuleVersion[] = [
    {
      jurisdictionRuleId: filingsVersion.jurisdictionRuleId,
      ruleVersionId: filingsVersion.ruleVersionId,
      ruleKey: filingsVersion.ruleKey,
      versionLabel: filingsVersion.versionLabel,
      citation: filingsVersion.citation,
      inputs: {
        obligationKey: obligation.key,
        period: [...years],
        salesEntryIds: usedSales.map((entry) => entry.id),
      },
      outcome: filing.documentType,
    },
    {
      jurisdictionRuleId: obligation.version.jurisdictionRuleId,
      ruleVersionId: obligation.version.ruleVersionId,
      ruleKey: obligation.version.ruleKey,
      versionLabel: obligation.version.versionLabel,
      citation: obligation.version.citation,
      inputs: { obligationId: obligation.id, obligationKey: obligation.key },
      outcome: obligation.status,
    },
  ];

  return {
    ok: true,
    outcome: ruleOutcome({
      result: content,
      reasoning: `${filing.title}: ${gapSummaryWords({ notOnFile, notHeld })}`,
      ruleVersionsApplied: applied,
      inputsSnapshot: {
        obligationId: obligation.id,
        deadlineId: inputs.deadline.id,
        period: [...years],
        salesEntryIds: usedSales.map((entry) => entry.id),
      },
      context: "filing_packet.content",
    }),
  };
}

// --- the render payload ----------------------------------------------------------------------

export type FilingPacketPayload = FilingPacketContent & {
  readonly document: DocumentIdentity;
};

/**
 * Stamp the render's identity into the content and **refuse, by name,
 * anything an issued packet must carry** before any renderer runs: its title,
 * where it is sent, the "not the filing" sentence, at least one item, and a
 * citation on every item (Rules 8.19, 12.15). A gap is not a refusal — it is
 * printed (Rule 8.20).
 */
export function buildFilingPacketPayload(input: {
  readonly content: RuleOutcome<FilingPacketContent>;
  readonly document: DocumentIdentity;
}): DocumentPayloadBuild<FilingPacketPayload> {
  const { content, document } = input;
  const packet = content.result;
  const missing: string[] = [];
  if (packet.title.trim() === "") missing.push("title");
  if (packet.sendTo.trim() === "") missing.push("send_to");
  if (packet.notTheFiling.trim() === "") missing.push("not_the_filing");
  if (packet.items.length === 0) missing.push("items");
  if (packet.items.some((item) => item.citation.trim() === "")) {
    missing.push("item_citation");
  }
  if (
    document.status !== "issued" ||
    document.documentType !== packet.documentType
  ) {
    missing.push("document.issued_filing");
  }
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    outcome: ruleOutcome({
      result: { ...packet, document },
      reasoning: content.reasoning,
      ruleVersionsApplied: content.ruleVersionsApplied,
      inputsSnapshot: content.inputsSnapshot,
      context: "filing_packet.render_payload",
    }),
  };
}

/** A gap line as the dialog, the packet and the page read it (Rule 8.20). */
export function gapLineText(line: {
  readonly what: string;
  readonly fixer: string;
}): string {
  return `${line.what}: ${NOT_ON_FILE}. ${line.fixer}`;
}

/** A total as it reads: never shown as complete with a gap in it (Rule 8.20). */
export function totalLineText(line: {
  readonly text: string;
  readonly missing: number;
}): string {
  return line.missing === 0
    ? line.text
    : `${line.text} — ${missingEntriesWords(line.missing)}`;
}
