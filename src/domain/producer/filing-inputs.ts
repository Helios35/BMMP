import type {
  FilingPacketInputs,
  FilingProduct,
  FilingVersionReference,
} from "@/domain/documents/build-filing-packet-payload";
import {
  resolveRules,
  type RuleVersionCandidate,
} from "@/domain/rules/resolve";
import type { ProducerObligationStatus } from "@/domain/taxonomy/producer-obligation-status";
import type {
  IsoDate,
  JsonObject,
  JsonValue,
  PostalAddress,
} from "@/types/common";

import {
  MISSING_INPUT_WORDS,
  type MissingInput,
  type Truth,
} from "./conditions";
import {
  FILINGS_RULE_KEY,
  filingFor,
  filingsOf,
  type FilingDefinition,
} from "./filings";
import type { ResolvedPeriod } from "./period";

/**
 * A packet's inputs, read from the rows the adapter fetched — Rules 8.18,
 * 8.19; `TECHNICAL_SPEC.md` §8.5.
 *
 * Pure, and shaped by structure rather than by the row types, so the page,
 * the action and the seed read a deadline one way. **It decides nothing new**:
 * whether each product meets the obligation is what the run stored on the
 * obligation row (`applies_because`, D-78 #4); which filing version governs
 * is rule resolution, on the state alone (a federal row never stands in);
 * the period is the caller's, from Rule 8.21.
 */

export interface FilingSourceRows {
  readonly deadline: { readonly id: string; readonly dueOn: IsoDate };
  readonly obligation: {
    readonly id: string;
    readonly obligationKey: string;
    readonly obligationTitle: string;
    readonly citation: string;
    readonly status: ProducerObligationStatus;
    readonly jurisdictionRuleId: string;
    readonly governingRuleVersionId: string;
    readonly appliesBecause: JsonObject;
  };
  readonly state: {
    readonly jurisdictionId: string;
    readonly code: string;
    readonly name: string;
  };
  readonly filingCandidates: readonly RuleVersionCandidate[];
  readonly organization: {
    readonly id: string;
    readonly name: string;
    readonly legalName: string | null;
    readonly primaryAddress: PostalAddress | null;
    readonly mailingAddress: PostalAddress | null;
  };
  readonly contact: {
    readonly userId: string;
    readonly name: string | null;
    readonly email: string;
  };
  readonly products: readonly {
    readonly product: { readonly id: string };
    readonly entry: {
      readonly id: string;
      readonly manufacturerName: string;
      readonly brandName: string | null;
      readonly modelName: string | null;
      readonly partNumber: string | null;
      readonly gtin: string | null;
      readonly chemistry: string;
      readonly massKg: string | null;
    };
  }[];
  readonly sales: readonly {
    readonly id: string;
    readonly producerProductId: string;
    readonly year: number;
    readonly units: number;
    readonly basisNote: string;
  }[];
}

export interface ResolvedFiling {
  readonly filing: FilingDefinition;
  readonly version: FilingVersionReference;
}

function textOf(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function objectOf(value: JsonValue | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function listOf(value: JsonValue | undefined): readonly JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function isTruth(value: string | null): value is Truth {
  return value === "true" || value === "false" || value === "cant_tell";
}

/**
 * The filing for the deadline's obligation in the version in force on
 * `asOf`, or `null` where the state has no filings rule in force or names no
 * filing for that obligation (a plan, a mark).
 */
export function resolveFiling(
  rows: Pick<FilingSourceRows, "filingCandidates" | "state" | "obligation">,
  asOf: IsoDate,
): ResolvedFiling | null {
  const resolution = resolveRules(
    {
      ruleKeys: [FILINGS_RULE_KEY],
      jurisdictionChain: [
        {
          id: rows.state.jurisdictionId,
          code: rows.state.code,
          name: rows.state.name,
          level: "state",
        },
      ],
      asOf,
    },
    rows.filingCandidates,
  );
  if (!resolution.ok) return null;
  const version = resolution.resolved.rules[FILINGS_RULE_KEY]?.version;
  if (version === undefined) return null;
  const filing = filingFor(filingsOf(version), rows.obligation.obligationKey);
  if (filing === null) return null;
  return {
    filing,
    version: {
      jurisdictionRuleId: version.jurisdictionRuleId,
      ruleVersionId: version.ruleVersionId,
      ruleKey: version.ruleKey,
      versionLabel: version.versionLabel,
      effectiveOn: version.effectiveOn,
      citation: version.citation,
      citationUrl: version.citationUrl,
    },
  };
}

interface StoredTruth {
  readonly truth: Truth;
  readonly missing: readonly string[];
  readonly label: string;
}

/** Each product's truth on the obligation, as the run stored it. */
function storedTruths(
  appliesBecause: JsonObject,
): ReadonlyMap<string, StoredTruth> {
  const truths = new Map<string, StoredTruth>();
  for (const value of listOf(appliesBecause.products)) {
    const product = objectOf(value);
    const id = textOf(product?.productId);
    const truth = textOf(product?.truth);
    if (product === null || id === null || !isTruth(truth)) continue;
    truths.set(id, {
      truth,
      label: textOf(product.label) ?? "",
      missing: listOf(product.missing).flatMap((input) =>
        typeof input === "string" && input in MISSING_INPUT_WORDS
          ? [MISSING_INPUT_WORDS[input as MissingInput]]
          : [],
      ),
    });
  }
  return truths;
}

/** The obligations version the run stored, as the packet cites it. */
function obligationsVersionOf(rows: FilingSourceRows): FilingVersionReference {
  const stored = objectOf(rows.obligation.appliesBecause.obligationsVersion);
  return {
    jurisdictionRuleId: rows.obligation.jurisdictionRuleId,
    ruleVersionId:
      textOf(stored?.ruleVersionId) ?? rows.obligation.governingRuleVersionId,
    ruleKey: textOf(stored?.ruleKey) ?? "",
    versionLabel: textOf(stored?.versionLabel) ?? "",
    effectiveOn: textOf(stored?.effectiveOn) ?? "",
    citation: textOf(stored?.citation) ?? rows.obligation.citation,
    citationUrl: textOf(stored?.citationUrl),
  };
}

function productLabel(
  entry: FilingSourceRows["products"][number]["entry"],
): string {
  const maker = entry.brandName ?? entry.manufacturerName;
  return entry.modelName === null ? maker : `${maker} ${entry.modelName}`;
}

/**
 * Everything the builder takes, for one deadline and one period. A product
 * the run did not store is a product it can't tell about — never one the
 * obligation definitely skips (Rule 8.9).
 */
export function filingPacketInputs(
  rows: FilingSourceRows,
  resolved: ResolvedFiling | null,
  period: ResolvedPeriod,
): FilingPacketInputs {
  const truths = storedTruths(rows.obligation.appliesBecause);
  const products: FilingProduct[] = rows.products.map(({ product, entry }) => {
    const stored = truths.get(product.id);
    return {
      productId: product.id,
      catalogEntryId: entry.id,
      label: productLabel(entry),
      manufacturerName: entry.manufacturerName,
      brandName: entry.brandName,
      modelName: entry.modelName,
      partNumber: entry.partNumber,
      gtin: entry.gtin,
      chemistry: entry.chemistry,
      massKg: entry.massKg,
      truth: stored?.truth ?? "cant_tell",
      missing:
        stored === undefined
          ? ["not checked yet — press Check now"]
          : stored.missing,
    };
  });
  const missing = [...truths.values()]
    .filter((stored) => stored.truth === "cant_tell")
    .map((stored) =>
      stored.missing.length === 0
        ? stored.label
        : `${stored.label} — ${stored.missing.join(", ")}`,
    );
  return {
    filing: resolved?.filing ?? null,
    filingsVersion: resolved?.version ?? null,
    obligation: {
      id: rows.obligation.id,
      key: rows.obligation.obligationKey,
      duty: rows.obligation.obligationTitle,
      citation: rows.obligation.citation,
      status: rows.obligation.status,
      missing,
      version: obligationsVersionOf(rows),
    },
    state: rows.state,
    deadline: rows.deadline,
    period,
    organization: rows.organization,
    contact: rows.contact,
    products,
    sales: rows.sales.map((entry) => ({
      id: entry.id,
      productId: entry.producerProductId,
      year: entry.year,
      units: entry.units,
      basisNote: entry.basisNote,
    })),
  };
}
