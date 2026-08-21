import type { IsoDate, JsonValue, Uuid } from "@/types/common";

/**
 * The envelope every rule evaluator in `src/domain` returns.
 *
 * `TECHNICAL_SPEC.md` §6.3. This is the mechanism that makes "which rule version
 * applied" impossible to forget — not a convention a reviewer has to check, but
 * the shape of the only value a rule evaluator is allowed to hand back.
 *
 * An auditor in 2029 asking why a battery logged in October 2026 was routed the
 * way it was gets: the inputs, the reasoning sentence, the rule key, the version
 * label, and the citation text **as it read that day** (Rules 12.15, 12.16).
 *
 * **The rules themselves are not in this unit.** This is the thing rules will be
 * written into.
 */

/** The stable machine key of a `jurisdiction_rule`, unique within its jurisdiction. */
export type RuleKey = string;

/**
 * One rule version that contributed to a decision, frozen at decision time.
 *
 * `citation` is copied, not referenced. The `rule_version` row is immutable once
 * published and is retained permanently, but the copy is what makes an
 * `evaluation_trace` readable on its own — and a citation is **never** written
 * into logic (Rule 1.23).
 */
export interface AppliedRuleVersion {
  readonly jurisdictionRuleId: Uuid;
  readonly ruleVersionId: Uuid;
  readonly ruleKey: RuleKey;
  readonly versionLabel: string;
  /** Mandatory on `rule_version`: a rule that cannot be cited cannot be created. */
  readonly citation: string;
  /** The inputs this version was evaluated against. */
  readonly inputs: Readonly<Record<string, JsonValue>>;
  /** What this version, on its own, produced. */
  readonly outcome: string;
}

/**
 * The result of one rule evaluation, with everything an audit needs attached.
 *
 * `ruleVersionsApplied` is **never empty** — see {@link ruleOutcome}, which is
 * the only way to construct one and refuses an empty array. Every table that
 * stores a decision carries `governing_rule_version_id` plus an
 * `evaluation_trace jsonb` holding this array with its citations frozen.
 */
export interface RuleOutcome<T> {
  readonly result: T;
  /**
   * Plain language, shown to the user and printed on exports.
   *
   * **Never states or implies a compliance outcome the system did not compute**
   * (`TECHNICAL_SPEC.md` §10.3 rule 4), and never expresses a probability of
   * ignition — the only permitted hazard shape is a relative ranking with a
   * stated basis per factor (Rules 1.25, 10.3; `_ANCHORS.md` §7.1).
   */
  readonly reasoning: string;
  /** Never empty. */
  readonly ruleVersionsApplied: readonly AppliedRuleVersion[];
  /** The exact inputs the evaluation consumed, frozen. */
  readonly inputsSnapshot: Readonly<Record<string, JsonValue>>;
}

/**
 * Thrown when a rule evaluator tries to return an outcome with no applied rule
 * version.
 *
 * A decision with no recorded version is a decision that cannot be reproduced,
 * which on this product is the same thing as a decision that was never
 * defensible. Failing loudly at construction is cheaper than discovering it in
 * an `evaluation_trace` two years later.
 */
export class MissingRuleVersionError extends Error {
  constructor(readonly context: string) {
    super(
      `A rule outcome was built with no applied rule version (${context}). ` +
        "Every decision records which version produced it — TECHNICAL_SPEC.md §6.3.",
    );
    this.name = "MissingRuleVersionError";
  }
}

/**
 * Build a {@link RuleOutcome}. The only sanctioned way to make one.
 *
 * Refuses an empty `ruleVersionsApplied`. The interface says "never empty"; this
 * is what makes that true at runtime as well as in the type, because an empty
 * array satisfies `readonly AppliedRuleVersion[]` perfectly well.
 */
export function ruleOutcome<T>(input: {
  result: T;
  reasoning: string;
  ruleVersionsApplied: readonly AppliedRuleVersion[];
  inputsSnapshot: Readonly<Record<string, JsonValue>>;
  /** What was being decided, used only in the error message. */
  context?: string;
}): RuleOutcome<T> {
  if (input.ruleVersionsApplied.length === 0) {
    throw new MissingRuleVersionError(input.context ?? input.reasoning);
  }
  return {
    result: input.result,
    reasoning: input.reasoning,
    ruleVersionsApplied: input.ruleVersionsApplied,
    inputsSnapshot: input.inputsSnapshot,
  };
}

/**
 * The version a decision row records in `governing_rule_version_id`.
 *
 * Where several versions governed, the full set lives in `evaluation_trace` and
 * this is the first — the one the FK points at, so "show me everything decided
 * under version X" stays a single indexed query.
 */
export function governingRuleVersionId<T>(outcome: RuleOutcome<T>): Uuid {
  const [first] = outcome.ruleVersionsApplied;
  if (first === undefined) {
    throw new MissingRuleVersionError(outcome.reasoning);
  }
  return first.ruleVersionId;
}

/**
 * The `evaluation_trace jsonb` payload for a decision row.
 *
 * The FK survives; **the trace is the reproduction** (`TECHNICAL_SPEC.md` §6.3).
 */
export function evaluationTrace<T>(
  outcome: RuleOutcome<T>,
): readonly AppliedRuleVersion[] {
  return outcome.ruleVersionsApplied;
}

/**
 * The date a decision was governed by, as the caller resolved it.
 *
 * Carried separately from the outcome because **the governing date differs by
 * rule and is named by the rule that needs it** (Rule 12.20) — it is not a
 * property the envelope can infer.
 */
export type GoverningDate = IsoDate;
