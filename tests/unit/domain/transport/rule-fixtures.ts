import type { ResolvedRule } from "@/domain/rules/resolve";
import type { JurisdictionRuleDomain } from "@/domain/taxonomy/jurisdiction-rule-domain";
import type { JsonObject } from "@/types/common";

/**
 * Resolved rule versions for the transport unit tests — built here, in the
 * test, because the shipper certification rule has no version on file yet
 * (`b1a-05-shipments` build-notes). The text below is test data, never
 * regulatory wording, and it is never read by `src/`.
 */

export function resolvedRule(input: {
  readonly ruleKey: string;
  readonly payloadSchemaKey: string;
  readonly payload: JsonObject;
  readonly domain?: JurisdictionRuleDomain;
  readonly citation?: string;
}): ResolvedRule {
  const jurisdiction = {
    id: "jurisdiction-federal",
    code: "US",
    name: "United States",
    level: "federal" as const,
  };
  return {
    ruleKey: input.ruleKey,
    jurisdiction,
    level: "federal",
    version: {
      ruleVersionId: `version-${input.ruleKey}`,
      jurisdictionRuleId: `rule-${input.ruleKey}`,
      jurisdictionId: jurisdiction.id,
      ruleKey: input.ruleKey,
      domain: input.domain ?? "transport",
      title: `Test rule ${input.ruleKey}`,
      versionLabel: "test",
      effectiveOn: "2026-01-01",
      expiresOn: null,
      citation: input.citation ?? `Test citation for ${input.ruleKey}`,
      citationUrl: null,
      payload: input.payload,
      payloadSchemaKey: input.payloadSchemaKey,
      appliesToApplicationClasses: null,
      publishedAt: "2025-12-15T00:00:00.000Z",
      isRuleActive: true,
    },
  };
}

export const BASIC_DESCRIPTION = resolvedRule({
  ruleKey: "transport.basic_description",
  payloadSchemaKey: "transport.basic_description.v1",
  payload: {
    descriptionSequence: [
      "un_identifier",
      "proper_shipping_name",
      "hazard_class",
      "packing_group",
    ],
    requiresTwentyFourHourNumber: true,
  },
});

export const SHIPPER_CERTIFICATION = resolvedRule({
  ruleKey: "transport.shipper_certification",
  payloadSchemaKey: "transport.shipper_certification.v1",
  payload: { statement: "TEST CERTIFICATION STATEMENT — not regulatory text." },
});

export const RETENTION = resolvedRule({
  ruleKey: "retention.shipment_record",
  payloadSchemaKey: "retention.shipment_record.v1",
  payload: { retentionYears: 3 },
  domain: "retention",
});
