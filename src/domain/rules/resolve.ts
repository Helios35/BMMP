import type { IsoDate, JsonObject, Uuid } from "@/types/common";
import type { JurisdictionLevel } from "@/domain/taxonomy/jurisdiction-level";
import type { JurisdictionRuleDomain } from "@/domain/taxonomy/jurisdiction-rule-domain";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";
import type { RuleKey } from "@/domain/rules/outcome";

/**
 * Reading a `jurisdiction_rule` at the version in force on a given date.
 *
 * `TECHNICAL_SPEC.md` §6.2. Pure, deterministic, and testable without a
 * database: **the adapter fetches candidate rows, the domain resolves.** That
 * split is what keeps resolution identical on mock and on Supabase, which is
 * what makes "the same Playwright suite passes both ways" a real test rather
 * than a hope.
 *
 * **There is no default.** A missing rule is a loud failure that names the gap
 * and points at P6 — silently applying a fallback threshold to a compliance
 * decision is worse than refusing to decide (Rules 3.4, 3.10; EC-16, EC-54).
 */

/** One link in a jurisdiction chain. */
export interface JurisdictionRef {
  readonly id: Uuid;
  /** Never parsed for meaning. Branching on a specific code is a review rejection (Rule 1.23). */
  readonly code: string;
  readonly name: string;
  readonly level: JurisdictionLevel;
}

/**
 * A candidate row: one `rule_version` with the `jurisdiction_rule` it belongs to.
 *
 * The adapter returns these unfiltered by date; this module decides which one
 * was in force. Only published versions are resolvable (T-42), which the adapter
 * enforces on the query and this module re-checks, because a candidate set is an
 * argument and an argument can be wrong.
 */
export interface RuleVersionCandidate {
  readonly ruleVersionId: Uuid;
  readonly jurisdictionRuleId: Uuid;
  readonly jurisdictionId: Uuid;
  readonly ruleKey: RuleKey;
  readonly domain: JurisdictionRuleDomain;
  readonly title: string;
  readonly versionLabel: string;
  /** Inclusive. */
  readonly effectiveOn: IsoDate;
  /** Exclusive. `null` means open-ended — `daterange(effective_on, expires_on, '[)')`. */
  readonly expiresOn: IsoDate | null;
  /** Mandatory on `rule_version`. */
  readonly citation: string;
  readonly citationUrl: string | null;
  /** Thresholds, operators, units, offsets, retention periods. **The only place these values exist.** */
  readonly payload: JsonObject;
  readonly payloadSchemaKey: string;
  /** Which categories the rule governs. `null` means all (`ERD.md` §4.2). */
  readonly appliesToApplicationClasses: readonly ApplicationClass[] | null;
  /** `null` while draft. A version with no publication is never resolvable. */
  readonly publishedAt: string | null;
  readonly isRuleActive: boolean;
}

export interface RuleResolutionRequest {
  readonly ruleKeys: readonly RuleKey[];
  /** Most specific first — `local`, then `state`, then `federal` (T-40). */
  readonly jurisdictionChain: readonly JurisdictionRef[];
  /**
   * The governing date, already reduced to a calendar day in the right zone.
   *
   * A calendar date rather than an instant, because `rule_version.effective_on`
   * is a `date` and the zone that turns an instant into a day is named by the
   * rule that needs it, not by this function (Rule 12.20, `TECHNICAL_SPEC.md`
   * §6.4). Handing this a `Date` would put the day-boundary decision in the one
   * place that has no idea which site it is deciding for.
   */
  readonly asOf: IsoDate;
  /** Narrows to rules that govern this class. Omit to accept any. */
  readonly applicationClass?: ApplicationClass;
}

/** One resolved rule, with the version that was in force and where it came from. */
export interface ResolvedRule {
  readonly ruleKey: RuleKey;
  readonly version: RuleVersionCandidate;
  /** Which link in the chain supplied the answer. */
  readonly jurisdiction: JurisdictionRef;
  /** Which level supplied it — recorded, per T-40. */
  readonly level: JurisdictionLevel;
}

export interface ResolvedRuleSet {
  readonly asOf: IsoDate;
  readonly rules: Readonly<Record<RuleKey, ResolvedRule>>;
  /** The chain that was walked, most specific first. */
  readonly jurisdictionChain: readonly JurisdictionRef[];
}

/** Why a rule key could not be resolved. Each one is a stated gap, never a default. */
export type RuleResolutionFailureReason =
  /** No published version of this rule exists anywhere in the chain. */
  | "no_rule_on_file"
  /** The rule exists but no published version's effective range contains `asOf`. */
  | "no_version_in_force"
  /** Versions exist but none governs the requested application class. */
  | "not_applicable_to_class";

export interface UnresolvedRule {
  readonly ruleKey: RuleKey;
  readonly reason: RuleResolutionFailureReason;
}

/**
 * The result of a resolution. A discriminated union, deliberately.
 *
 * `TECHNICAL_SPEC.md` §6.2 says the function returns a resolution error rather
 * than a default. Returning it — rather than throwing — makes handling the miss
 * structurally unavoidable: a caller cannot reach `rules` without first passing
 * through the branch where they are absent, which is the same property
 * {@link ruleOutcome} gives the applied-version array.
 *
 * `src/lib/errors.ts` turns an `unresolved` into the `RuleResolutionError`
 * (`RULE_UNRESOLVED`, 422) that `§10.1` specifies, with the message *"No rule is
 * on file for <jurisdiction> covering <topic> as of <date>."* That translation
 * belongs in `lib` because `src/domain` reaches for nothing, including an error
 * class defined outside itself.
 */
export type RuleResolution =
  | { readonly ok: true; readonly resolved: ResolvedRuleSet }
  | {
      readonly ok: false;
      readonly unresolved: readonly UnresolvedRule[];
      /** Partial: the keys that did resolve. Never used as a substitute for the ones that did not. */
      readonly partial: ResolvedRuleSet;
    };

/**
 * Whether a candidate's effective range contains a calendar day.
 *
 * `[effective_on, expires_on)` — inclusive start, exclusive end, matching the
 * GiST exclusion constraint on `rule_version` that makes two overlapping
 * published versions structurally impossible. ISO `YYYY-MM-DD` strings compare
 * lexicographically in calendar order, so no date parsing and no timezone enters
 * this comparison.
 */
export function isInForceOn(
  candidate: Pick<RuleVersionCandidate, "effectiveOn" | "expiresOn">,
  asOf: IsoDate,
): boolean {
  if (asOf < candidate.effectiveOn) return false;
  if (candidate.expiresOn !== null && asOf >= candidate.expiresOn) return false;
  return true;
}

function governsClass(
  candidate: RuleVersionCandidate,
  applicationClass: ApplicationClass | undefined,
): boolean {
  if (candidate.appliesToApplicationClasses === null) return true;
  if (applicationClass === undefined) return true;
  return candidate.appliesToApplicationClasses.includes(applicationClass);
}

/**
 * Resolve every requested rule key against a jurisdiction chain at a date.
 *
 * Most specific jurisdiction wins; within a jurisdiction, the single published
 * version whose effective range contains `asOf` wins. Nothing falls back to a
 * broader level once a more specific one has answered, and nothing falls back to
 * a value at all if no level answers.
 */
export function resolveRules(
  request: RuleResolutionRequest,
  candidates: readonly RuleVersionCandidate[],
): RuleResolution {
  const rules: Record<RuleKey, ResolvedRule> = {};
  const unresolved: UnresolvedRule[] = [];

  for (const ruleKey of request.ruleKeys) {
    const forKey = candidates.filter(
      (candidate) => candidate.ruleKey === ruleKey && candidate.isRuleActive,
    );

    if (forKey.length === 0) {
      unresolved.push({ ruleKey, reason: "no_rule_on_file" });
      continue;
    }

    // Only a published version is resolvable by a decision (T-42).
    const published = forKey.filter(
      (candidate) => candidate.publishedAt !== null,
    );
    if (published.length === 0) {
      unresolved.push({ ruleKey, reason: "no_rule_on_file" });
      continue;
    }

    const applicable = published.filter((candidate) =>
      governsClass(candidate, request.applicationClass),
    );
    if (applicable.length === 0) {
      unresolved.push({ ruleKey, reason: "not_applicable_to_class" });
      continue;
    }

    // Most specific jurisdiction first. The chain is walked, never enumerated.
    let matched: ResolvedRule | undefined;
    for (const jurisdiction of request.jurisdictionChain) {
      const inForce = applicable.filter(
        (candidate) =>
          candidate.jurisdictionId === jurisdiction.id &&
          isInForceOn(candidate, request.asOf),
      );
      const [version] = inForce;
      if (version === undefined) continue;

      // Two published versions of one rule cannot overlap in time — the GiST
      // exclusion constraint on rule_version makes it structurally impossible.
      // Reaching here with more than one means the candidate set was assembled
      // wrongly, and guessing which one applied is exactly the ambiguity that
      // constraint exists to remove.
      if (inForce.length > 1) {
        throw new OverlappingRuleVersionsError(
          ruleKey,
          jurisdiction.code,
          request.asOf,
          inForce.map((candidate) => candidate.ruleVersionId),
        );
      }

      matched = {
        ruleKey,
        version,
        jurisdiction,
        level: jurisdiction.level,
      };
      break;
    }

    if (matched === undefined) {
      unresolved.push({ ruleKey, reason: "no_version_in_force" });
      continue;
    }
    rules[ruleKey] = matched;
  }

  const set: ResolvedRuleSet = {
    asOf: request.asOf,
    rules,
    jurisdictionChain: request.jurisdictionChain,
  };

  if (unresolved.length > 0) {
    return { ok: false, unresolved, partial: set };
  }
  return { ok: true, resolved: set };
}

/**
 * Two published versions of one rule were in force on the same day.
 *
 * Thrown, not returned, because unlike a missing rule this is not a state the
 * product can be in: the database forbids it. Reaching it means the candidate
 * set did not come from `rule_version`, or came from it filtered wrongly.
 */
export class OverlappingRuleVersionsError extends Error {
  constructor(
    readonly ruleKey: RuleKey,
    readonly jurisdictionCode: string,
    readonly asOf: IsoDate,
    readonly ruleVersionIds: readonly Uuid[],
  ) {
    super(
      `Two published versions of rule "${ruleKey}" are in force in ${jurisdictionCode} ` +
        `on ${asOf} (${ruleVersionIds.join(", ")}). rule_version carries a GiST ` +
        "exclusion constraint that makes this impossible in the database, so the " +
        "candidate set is wrong. Refusing to pick one.",
    );
    this.name = "OverlappingRuleVersionsError";
  }
}
