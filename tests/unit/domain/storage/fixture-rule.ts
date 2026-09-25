import * as fixtures from "@/data/mock/fixtures";
import { JURISDICTION, RULE_VERSION } from "@/data/mock/fixtures/ids";
import type {
  ResolvedRule,
  RuleVersionCandidate,
} from "@/domain/rules/resolve";

/** The fixture accumulation rule, resolved the way `resolveRules` would resolve it. */
export function fixtureAccumulationRule(): ResolvedRule {
  const row = fixtures.ruleVersions.find(
    (candidate) => candidate.id === RULE_VERSION.waAccumulationPeriod2026,
  );
  const rule = fixtures.jurisdictionRules.find(
    (candidate) => candidate.id === row?.jurisdictionRuleId,
  );
  const jurisdiction = fixtures.jurisdictions.find(
    (candidate) => candidate.id === JURISDICTION.washington,
  );
  if (!row || !rule || !jurisdiction) throw new Error("fixture rule missing");
  const version: RuleVersionCandidate = {
    ruleVersionId: row.id,
    jurisdictionRuleId: rule.id,
    jurisdictionId: rule.jurisdictionId,
    ruleKey: rule.ruleKey,
    domain: rule.domain,
    title: rule.title,
    versionLabel: row.versionLabel,
    effectiveOn: row.effectiveOn,
    expiresOn: row.expiresOn,
    citation: row.citation,
    citationUrl: row.citationUrl,
    payload: row.payload,
    payloadSchemaKey: row.payloadSchemaKey,
    appliesToApplicationClasses: rule.appliesToApplicationClasses,
    publishedAt: row.publishedAt,
    isRuleActive: rule.isActive,
  };
  return {
    ruleKey: rule.ruleKey,
    version,
    jurisdiction: {
      id: jurisdiction.id,
      code: jurisdiction.code,
      name: jurisdiction.name,
      level: jurisdiction.level,
    },
    level: jurisdiction.level,
  };
}
