import type { RuleVersionCandidate } from "@/domain/rules/resolve";
import type { JurisdictionRule, RuleVersion } from "@/types/rules-as-data";

/**
 * One `rule_version` with the `jurisdiction_rule` it belongs to, in the shape
 * the pure resolver takes (`TECHNICAL_SPEC.md` §6.2) — **the one mapping**,
 * read by rule resolution and by the producer run alike.
 */
export function ruleVersionCandidate(
  rule: JurisdictionRule,
  version: RuleVersion,
): RuleVersionCandidate {
  return {
    ruleVersionId: version.id,
    jurisdictionRuleId: rule.id,
    jurisdictionId: rule.jurisdictionId,
    ruleKey: rule.ruleKey,
    domain: rule.domain,
    title: rule.title,
    versionLabel: version.versionLabel,
    effectiveOn: version.effectiveOn,
    expiresOn: version.expiresOn,
    citation: version.citation,
    citationUrl: version.citationUrl,
    payload: version.payload,
    payloadSchemaKey: version.payloadSchemaKey,
    appliesToApplicationClasses: rule.appliesToApplicationClasses,
    publishedAt: version.publishedAt,
    isRuleActive: rule.isActive,
    supersedesRuleVersionId: version.supersedesRuleVersionId,
  };
}
