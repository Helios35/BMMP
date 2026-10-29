import type { AppliedRuleVersion } from "@/domain/rules/outcome";
import type { ResolvedRule } from "@/domain/rules/resolve";
import { CHEMISTRIES, type Chemistry } from "@/domain/taxonomy/chemistry";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";
import type { JsonValue } from "@/types/common";

/**
 * The transport rule keys a shipping paper reads, and their payloads —
 * `BUSINESS_RULES.md` Rules 1.23, 5.5, 5.8, 5.18–5.20.
 *
 * **Every sequence, statement, period and exception is a rule version's
 * payload; none is a literal here.** This module knows the *shape* of each
 * payload schema and nothing of its contents. A payload whose schema key or
 * shape it does not recognise reads as `null` — refused, never half-read —
 * because a payload half-read is a document half-made (Rules 3.4, 3.10).
 *
 * Two keys are named here before any rule version carries them, and both are
 * reported in `b1a-05-shipments`' build-notes for planning to author:
 * {@link SHIPPER_CERTIFICATION_RULE_KEY} and
 * {@link PACKAGING_EXCEPTION_RULE_KEY}. Until a version is on file the first
 * blocks generation as a named gap and the second records that no exception
 * was applied — never an assumed one (Rule 5.20).
 */

/** The basic description sequence and the emergency response information it requires (Rules 5.5, 5.8). */
export const BASIC_DESCRIPTION_RULE_KEY = "transport.basic_description";
/** The shipper's certification statement printed on the paper. Not yet authored as data. */
export const SHIPPER_CERTIFICATION_RULE_KEY = "transport.shipper_certification";
/** Packaging-exception eligibility (Rules 5.19, 5.20). Not yet authored as data. */
export const PACKAGING_EXCEPTION_RULE_KEY = "transport.packaging_exception";
/** How long a shipment record is retained (Rules 5.18, 12.10). */
export const SHIPMENT_RETENTION_RULE_KEY = "retention.shipment_record";
/**
 * Packaging and marking for a damaged, defective or recalled battery, by
 * chemistry family, and the air prohibition's citation (Rule 6.15; D-58 #5;
 * D-71) — authored by planning in `SPEC_ddr-packaging-rule-data_2026-10-22.md`.
 */
export const DDR_PACKAGING_RULE_KEY = "transport.ddr_packaging";

/** Every key a shipping paper resolves, in one place so a caller cannot forget one. */
export const SHIPPING_PAPER_RULE_KEYS = [
  BASIC_DESCRIPTION_RULE_KEY,
  SHIPPER_CERTIFICATION_RULE_KEY,
  PACKAGING_EXCEPTION_RULE_KEY,
] as const;

const BASIC_DESCRIPTION_SCHEMA = "transport.basic_description.v1";
const SHIPPER_CERTIFICATION_SCHEMA = "transport.shipper_certification.v1";
const RETENTION_SCHEMA = "retention.shipment_record.v1";
/**
 * v1 (b1a-08) and v2 (D-72 #9, b2-09): the same rows, v2 carrying the packing
 * level with its own citation. Both read; nothing else does.
 */
const DDR_PACKAGING_SCHEMAS: readonly string[] = [
  "transport.ddr_packaging.v1",
  "transport.ddr_packaging.v2",
];

/**
 * The fields `transport.basic_description.v1` may sequence. The schema's own
 * vocabulary — **which** of them appear, and in what order, is the payload's.
 */
export const BASIC_DESCRIPTION_FIELDS = [
  "un_identifier",
  "proper_shipping_name",
  "hazard_class",
  "packing_group",
] as const;

export type BasicDescriptionField = (typeof BASIC_DESCRIPTION_FIELDS)[number];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isField(value: unknown): value is BasicDescriptionField {
  return (
    typeof value === "string" &&
    (BASIC_DESCRIPTION_FIELDS as readonly string[]).includes(value)
  );
}

export interface BasicDescriptionRule {
  /** The required sequence. Never empty, never repeating a field. */
  readonly sequence: readonly BasicDescriptionField[];
}

export function readBasicDescriptionRule(
  resolved: ResolvedRule,
): BasicDescriptionRule | null {
  if (resolved.ruleKey !== BASIC_DESCRIPTION_RULE_KEY) return null;
  if (resolved.version.payloadSchemaKey !== BASIC_DESCRIPTION_SCHEMA) {
    return null;
  }
  const payload: unknown = resolved.version.payload;
  if (!isRecord(payload)) return null;
  const { descriptionSequence, requiresTwentyFourHourNumber } = payload;
  if (
    !Array.isArray(descriptionSequence) ||
    descriptionSequence.length === 0 ||
    !descriptionSequence.every(isField) ||
    new Set(descriptionSequence).size !== descriptionSequence.length
  ) {
    return null;
  }
  // Read for its shape only. Rules 5.6 and 5.7 require the verified number on
  // every paper whatever a payload says, so nothing branches on this.
  if (typeof requiresTwentyFourHourNumber !== "boolean") return null;
  return { sequence: descriptionSequence };
}

export function readShipperCertificationRule(
  resolved: ResolvedRule,
): { readonly statement: string } | null {
  if (resolved.ruleKey !== SHIPPER_CERTIFICATION_RULE_KEY) return null;
  if (resolved.version.payloadSchemaKey !== SHIPPER_CERTIFICATION_SCHEMA) {
    return null;
  }
  const payload: unknown = resolved.version.payload;
  if (!isRecord(payload)) return null;
  const { statement } = payload;
  if (typeof statement !== "string" || statement.trim() === "") return null;
  return { statement };
}

export function readRetentionRule(
  resolved: ResolvedRule,
): { readonly retentionYears: number } | null {
  if (resolved.ruleKey !== SHIPMENT_RETENTION_RULE_KEY) return null;
  if (resolved.version.payloadSchemaKey !== RETENTION_SCHEMA) return null;
  const payload: unknown = resolved.version.payload;
  if (!isRecord(payload)) return null;
  const { retentionYears } = payload;
  if (
    typeof retentionYears !== "number" ||
    !Number.isInteger(retentionYears) ||
    retentionYears <= 0
  ) {
    return null;
  }
  return { retentionYears };
}

// --- transport.ddr_packaging.v1 ----------------------------------------------------

/** One chemistry family the rule covers, and the marking text it requires. */
export interface DdrPackagingFamily {
  readonly familyKey: string;
  /** T-01 values. A chemistry in no family has no rule on file (D-71). */
  readonly chemistries: readonly Chemistry[];
  readonly markingText: string;
}

/** One packaging requirement, with its own citation (Rule 12.15). */
export type DdrPackagingItem = {
  readonly item: string;
  readonly requirement: string;
  readonly citation: string;
};

export interface DdrPackagingRule {
  readonly families: readonly DdrPackagingFamily[];
  readonly packaging: readonly DdrPackagingItem[];
  /**
   * **Null means not on file** (D-58 #12) — the packet says so; nothing
   * assumes one. v1 carried the level as bare text; v2 (D-72 #9) carries it
   * with its own citation, which the packet prints beside it (Rule 12.15).
   */
  readonly packingLevel: {
    readonly text: string;
    readonly citation: string | null;
  } | null;
  readonly marking: {
    readonly citation: string;
    readonly minimumHeight: string;
    readonly minimumHeightCitation: string;
  };
  /** The federal DDR-air citation the air block prints (D-58 #5). */
  readonly air: { readonly requirement: string; readonly citation: string };
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function readFamily(value: unknown): DdrPackagingFamily | null {
  if (!isRecord(value)) return null;
  const { familyKey, chemistries, markingText } = value;
  if (!isText(familyKey) || !isText(markingText)) return null;
  if (
    !Array.isArray(chemistries) ||
    chemistries.length === 0 ||
    !chemistries.every(
      (chemistry): chemistry is Chemistry =>
        typeof chemistry === "string" &&
        isTaxonomyValue(CHEMISTRIES, chemistry),
    )
  ) {
    return null;
  }
  return { familyKey, chemistries, markingText };
}

function readItem(value: unknown): DdrPackagingItem | null {
  if (!isRecord(value)) return null;
  const { item, requirement, citation } = value;
  if (!isText(item) || !isText(requirement) || !isText(citation)) return null;
  return { item, requirement, citation };
}

/**
 * `transport.ddr_packaging` v1 or v2, read whole or not at all. A family, an item
 * or a citation that is missing or malformed refuses the payload — a packet
 * that printed half its packaging would be a wrong document, and a wrong
 * document is worse than none.
 */
export function readDdrPackagingRule(
  resolved: ResolvedRule,
): DdrPackagingRule | null {
  if (resolved.ruleKey !== DDR_PACKAGING_RULE_KEY) return null;
  if (!DDR_PACKAGING_SCHEMAS.includes(resolved.version.payloadSchemaKey)) {
    return null;
  }
  const payload: unknown = resolved.version.payload;
  if (!isRecord(payload)) return null;
  const { families, packaging, packingLevel, marking, air } = payload;
  if (!Array.isArray(families) || families.length === 0) return null;
  if (!Array.isArray(packaging) || packaging.length === 0) return null;
  const readFamilies = families.map(readFamily);
  const readItems = packaging.map(readItem);
  if (readFamilies.some((family) => family === null)) return null;
  if (readItems.some((item) => item === null)) return null;
  const level = readPackingLevel(packingLevel);
  if (level === undefined) return null;
  if (!isRecord(marking) || !isRecord(air)) return null;
  const { citation, minimumHeight, minimumHeightCitation } = marking;
  if (
    !isText(citation) ||
    !isText(minimumHeight) ||
    !isText(minimumHeightCitation)
  ) {
    return null;
  }
  if (!isText(air.requirement) || !isText(air.citation)) return null;
  return {
    families: readFamilies.filter(
      (family): family is DdrPackagingFamily => family !== null,
    ),
    packaging: readItems.filter(
      (item): item is DdrPackagingItem => item !== null,
    ),
    packingLevel: level,
    marking: { citation, minimumHeight, minimumHeightCitation },
    air: { requirement: air.requirement, citation: air.citation },
  };
}

/**
 * `null` (not on file), v1's bare text, or v2's `{ text, citation }`;
 * `undefined` for anything else — a malformed row reads as no rule, never as
 * a guess.
 */
function readPackingLevel(
  value: unknown,
): DdrPackagingRule["packingLevel"] | undefined {
  if (value === null) return null;
  if (isText(value)) return { text: value, citation: null };
  if (!isRecord(value)) return undefined;
  const { text, citation } = value;
  if (!isText(text)) return undefined;
  if (citation !== null && !isText(citation)) return undefined;
  return { text, citation };
}

/** The family a chemistry falls under, or null — no rule on file for it (D-71). */
export function ddrPackagingFamilyFor(
  rule: DdrPackagingRule,
  chemistry: string | null,
): DdrPackagingFamily | null {
  if (chemistry === null) return null;
  return (
    rule.families.find((family) =>
      (family.chemistries as readonly string[]).includes(chemistry),
    ) ?? null
  );
}

/** The rule version as it read when it was applied — copied, never referenced (Rules 12.15, 12.16). */
export function appliedVersion(
  resolved: ResolvedRule,
  inputs: Readonly<Record<string, JsonValue>>,
  outcome: string,
): AppliedRuleVersion {
  return {
    jurisdictionRuleId: resolved.version.jurisdictionRuleId,
    ruleVersionId: resolved.version.ruleVersionId,
    ruleKey: resolved.ruleKey,
    versionLabel: resolved.version.versionLabel,
    citation: resolved.version.citation,
    inputs,
    outcome,
  };
}
