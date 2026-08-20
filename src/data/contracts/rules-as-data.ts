import type { RequestContext } from "./context";
import type {
  AppendInput,
  AppendOnlyRepository,
  BaseQuery,
  CreateInput,
  Repository,
  UpdateInput,
} from "./repository";
import type {
  FormatClassification,
  Jurisdiction,
  JurisdictionRule,
  RuleVersion,
} from "@/types/rules-as-data";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";
import type { FormatCategory } from "@/domain/taxonomy/format-category";
import type { JurisdictionLevel } from "@/domain/taxonomy/jurisdiction-level";
import type { JurisdictionRuleDomain } from "@/domain/taxonomy/jurisdiction-rule-domain";
import type { RuleVersionStatus } from "@/domain/taxonomy/rule-version-status";
import type { IsoDate, Uuid } from "@/types/common";
import type {
  RuleResolution,
  RuleVersionCandidate,
} from "@/domain/rules/resolve";

/** Rules-as-data contracts — `ERD.md` §4. */

// --- jurisdiction -----------------------------------------------------------

export type CreateJurisdiction = CreateInput<Jurisdiction>;
/** `code` is stable and never reused. A jurisdiction that ceases to be relevant is deactivated. */
export type UpdateJurisdiction = UpdateInput<Jurisdiction, "code">;

export interface JurisdictionQuery extends BaseQuery {
  readonly code?: string;
  readonly level?: JurisdictionLevel;
  readonly parentJurisdictionId?: Uuid;
  readonly countryCode?: string;
}

export interface JurisdictionRepository extends Repository<
  Jurisdiction,
  CreateJurisdiction,
  UpdateJurisdiction,
  JurisdictionQuery
> {
  /**
   * The chain from a jurisdiction upward to the root, **most specific first**.
   *
   * The chain is walked, never enumerated (`TECHNICAL_SPEC.md` §6.2), and the
   * resolved answer records which level supplied it (T-40). A site with no
   * jurisdiction profile blocks classification rather than defaulting it
   * (Rule 3.10; EC-16).
   */
  chainFrom(
    ctx: RequestContext,
    jurisdictionId: Uuid,
  ): Promise<readonly Jurisdiction[]>;
}

// --- jurisdiction_rule ------------------------------------------------------

export type CreateJurisdictionRule = CreateInput<JurisdictionRule>;
/** `ruleKey` is the stable identity a decision points at conceptually. It does not move. */
export type UpdateJurisdictionRule = UpdateInput<
  JurisdictionRule,
  "ruleKey" | "jurisdictionId"
>;

export interface JurisdictionRuleQuery extends BaseQuery {
  readonly jurisdictionId?: Uuid;
  readonly ruleKey?: string;
  readonly domain?: JurisdictionRuleDomain;
  readonly applicationClass?: ApplicationClass;
  readonly isActive?: boolean;
}

export type JurisdictionRuleRepository = Repository<
  JurisdictionRule,
  CreateJurisdictionRule,
  UpdateJurisdictionRule,
  JurisdictionRuleQuery
>;

// --- rule_version -----------------------------------------------------------

/**
 * A published `rule_version` is immutable. `UPDATE` is permitted only while
 * `published_at is null`, enforced by trigger — **amending a published rule
 * means publishing a new version with a new effective date, and history is never
 * rewritten** (Rule 12.22).
 *
 * The contract therefore offers no `update`: this is an `AppendOnlyRepository`
 * plus a one-way {@link RuleVersionRepository.publish}.
 */
export type CreateRuleVersion = AppendInput<
  RuleVersion,
  "publishedAt" | "publishedBy"
>;

export interface RuleVersionQuery extends BaseQuery {
  readonly jurisdictionRuleId?: Uuid;
  readonly status?: RuleVersionStatus;
  /** `published_at is not null` — the only versions a decision may resolve (T-42). */
  readonly isPublished?: boolean;
  /** Effective range contains this calendar day. */
  readonly inForceOn?: IsoDate;
}

export interface RuleResolutionRequestInput {
  readonly ruleKeys: readonly string[];
  /** The site's jurisdiction — **not the organization's headquarters** (Rule 3.5). */
  readonly jurisdictionId: Uuid;
  /**
   * The governing date, already reduced to a calendar day in the right zone.
   *
   * Which date that is, is named by the rule that needs it (Rule 12.20).
   */
  readonly asOf: IsoDate;
  readonly applicationClass?: ApplicationClass;
}

export interface RuleVersionRepository extends AppendOnlyRepository<
  RuleVersion,
  CreateRuleVersion,
  RuleVersionQuery
> {
  /**
   * Resolve a rule set for a jurisdiction chain at a point in time.
   *
   * **The adapter fetches candidates; `src/domain/rules/resolve.ts` decides.**
   * That split keeps resolution identical on mock and on Supabase and keeps it
   * unit-testable without a database (`TECHNICAL_SPEC.md` §6.2). The adapter's
   * job here is to walk the chain, gather candidates and hand them to the pure
   * resolver — it does not implement its own precedence.
   *
   * Returns the domain's discriminated result. **There is no default**: a
   * missing rule is a loud failure that names the gap and points at P6.
   */
  resolve(
    ctx: RequestContext,
    req: RuleResolutionRequestInput,
  ): Promise<RuleResolution>;

  /** The raw candidate rows for a chain, for callers that resolve themselves. */
  findCandidates(
    ctx: RequestContext,
    req: RuleResolutionRequestInput,
  ): Promise<readonly RuleVersionCandidate[]>;

  /** **P6 only, one-way.** After this the row is frozen. */
  publish(ctx: RequestContext, id: Uuid): Promise<RuleVersion>;
}

// --- format_classification --------------------------------------------------

export type CreateFormatClassification = AppendInput<FormatClassification>;

export interface FormatClassificationQuery extends BaseQuery {
  readonly batteryRecordId?: Uuid;
  readonly jurisdictionId?: Uuid;
  readonly ruleVersionId?: Uuid;
  readonly formatCategory?: FormatCategory;
  readonly isCurrent?: boolean;
}

/**
 * **Many rows per battery — one per jurisdiction per rule version.** That is the
 * multi-state grain, and it is why this is a table rather than a column on
 * `battery_record` (`ERD.md` §4.4; T-06 records the column as a review
 * rejection).
 */
export type FormatClassificationRepository = AppendOnlyRepository<
  FormatClassification,
  CreateFormatClassification,
  FormatClassificationQuery
>;
