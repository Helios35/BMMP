import type { AppliedRuleVersion } from "@/domain/rules/outcome";
import type { ResolvedRule } from "@/domain/rules/resolve";
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
