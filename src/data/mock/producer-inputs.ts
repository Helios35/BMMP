import type { ProducerRunInputs } from "@/data/contracts/producer";
import {
  COVERAGE_RULE_KEY,
  OBLIGATIONS_RULE_KEY,
  type CurrentDeadline,
  type CurrentObligation,
  type DeclaredProduct,
} from "@/domain/producer";
import type { Uuid } from "@/types/common";
import type { CatalogEntry } from "@/types/catalog";
import type {
  ObligationDeadline,
  ProducerObligation,
  ProducerProduct,
} from "@/types/producer";
import type {
  Jurisdiction,
  JurisdictionRule,
  RuleVersion,
} from "@/types/rules-as-data";
import type { Organization } from "@/types/tenancy";

import { ruleVersionCandidate } from "./rule-candidate";

/**
 * A producer run's inputs, gathered from plain rows — so the adapter, the
 * job and the seed read them one way (Rule 8.11).
 *
 * **The facts are the catalog entry's** (Rule 8.6); every producer rule
 * version on file goes to the domain unfiltered by date, and the domain picks
 * the one in force. Nothing here decides anything.
 */

export interface ProducerSource {
  readonly organizations: readonly Organization[];
  readonly producerProducts: readonly ProducerProduct[];
  readonly catalogEntries: readonly CatalogEntry[];
  readonly jurisdictions: readonly Jurisdiction[];
  readonly jurisdictionRules: readonly JurisdictionRule[];
  readonly ruleVersions: readonly RuleVersion[];
  readonly producerObligations: readonly ProducerObligation[];
  readonly obligationDeadlines: readonly ObligationDeadline[];
}

/** How a product reads: its brand (or maker) and model. */
export function productLabel(entry: CatalogEntry): string {
  const maker = entry.brandName ?? entry.manufacturerName;
  return entry.modelName === null ? maker : `${maker} ${entry.modelName}`;
}

export function activeProducts(
  source: Pick<ProducerSource, "producerProducts">,
  organizationId: Uuid,
): readonly ProducerProduct[] {
  return source.producerProducts.filter(
    (product) =>
      product.organizationId === organizationId && product.removedAt === null,
  );
}

export function gatherProducerInputs(
  source: ProducerSource,
  organizationId: Uuid,
): ProducerRunInputs {
  const organization = source.organizations.find(
    (row) => row.id === organizationId,
  );
  const entries = new Map(source.catalogEntries.map((row) => [row.id, row]));
  const products: DeclaredProduct[] = activeProducts(
    source,
    organizationId,
  ).flatMap((product): DeclaredProduct[] => {
    const entry = entries.get(product.catalogEntryId);
    if (entry === undefined) return [];
    return [
      {
        productId: product.id,
        catalogEntryId: entry.id,
        label: productLabel(entry),
        facts: {
          chemistry: entry.chemistry,
          massKg: entry.massKg,
          energyWh: entry.ratedEnergyWh,
          removability: entry.removability,
          applicationClass: entry.applicationClass,
        },
        jurisdictionIds: product.jurisdictionIds,
      },
    ];
  });

  const producerRules = new Map(
    source.jurisdictionRules
      .filter(
        (rule) =>
          rule.ruleKey === COVERAGE_RULE_KEY ||
          rule.ruleKey === OBLIGATIONS_RULE_KEY,
      )
      .map((rule) => [rule.id, rule]),
  );
  const candidates = source.ruleVersions.flatMap((version) => {
    const rule = producerRules.get(version.jurisdictionRuleId);
    return rule === undefined ? [] : [ruleVersionCandidate(rule, version)];
  });

  const current = source.producerObligations.filter(
    (row) => row.organizationId === organizationId && row.isCurrent,
  );
  const currentIds = new Set(current.map((row) => row.id));
  const obligations: CurrentObligation[] = current.map((row) => ({
    id: row.id,
    jurisdictionId: row.jurisdictionId,
    jurisdictionRuleId: row.jurisdictionRuleId,
    governingRuleVersionId: row.governingRuleVersionId,
    obligationKey: row.obligationKey,
    obligationTitle: row.obligationTitle,
    citation: row.citation,
    status: row.status,
    appliesBecause: row.appliesBecause,
    evaluationTrace: row.evaluationTrace,
    stewardshipOrgName: row.stewardshipOrgName,
  }));
  const deadlines: CurrentDeadline[] = source.obligationDeadlines
    .filter(
      (row) =>
        row.organizationId === organizationId &&
        currentIds.has(row.producerObligationId),
    )
    .map((row) => ({
      id: row.id,
      producerObligationId: row.producerObligationId,
      deadlineKey: row.deadlineKey,
      status: row.status,
      governingRuleVersionId: row.governingRuleVersionId,
      citation: row.citation,
    }));

  return {
    timeZone: organization?.timeZone ?? "UTC",
    evaluation: {
      products,
      jurisdictions: source.jurisdictions.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        level: row.level,
      })),
      candidates,
    },
    current: { obligations, deadlines },
  };
}
