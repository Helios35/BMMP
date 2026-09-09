import type { AssessedCondition } from "@/domain/taxonomy/assessed-condition";
import type { DamageAssessmentStatus } from "@/domain/taxonomy/damage-assessment-status";
import {
  COSMETIC_FINDING_TYPES,
  DAMAGE_FINDING_TYPES,
  DAMAGED_OR_DEFECTIVE_FINDING_TYPES,
  type DamageFindingType,
} from "@/domain/taxonomy/damage-finding-type";
import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";

/**
 * Damage assessment — `BUSINESS_RULES.md` Rules 6.2–6.6; T-29, T-30, T-46,
 * T-49.
 *
 * **Mechanical, two-valued, no judgement.** Rule 6.4 says a record is damaged
 * or defective when a human has confirmed at least one indicator from the
 * taxonomy's damaged-or-defective set, and that which indicators belong to
 * that set "is a taxonomy decision, not a builder's judgment". So this module
 * reads set membership out of `DAMAGED_OR_DEFECTIVE_FINDING_TYPES` and
 * `COSMETIC_FINDING_TYPES` and nothing else: no severity, no count, no
 * weighting, and no ranking of how bad a finding is. It ranks nothing and
 * states nothing beyond what set membership implies.
 *
 * The findings arrive from a person (Rules 6.2, 6.6). A model may propose
 * indicators upstream; by the time they reach this function they are what a
 * human confirmed, and the determination is what that confirmation means.
 *
 * `recalled` is the one DDR flag this module never sets. A recall association
 * is entered separately by a human in B1a (Rule 6.5) and is not a finding.
 */

export interface DamageDetermination {
  /** T-49. */
  readonly assessedCondition: AssessedCondition;
  /** T-30 — `damaged` from the finding set, `defective` from the functional flag. */
  readonly ddrFlags: readonly DdrFlag[];
  /** Any DDR flag prohibits air transport. Stated as a fact of the flag, not a rule this module evaluated. */
  readonly isAirTransportProhibited: boolean;
  /** T-46 — the two values a fresh, human-confirmed assessment can hold. */
  readonly assessmentStatus: Extract<
    DamageAssessmentStatus,
    "assessed_sound" | "assessed_damaged"
  >;
  /** De-duplicated, in T-29 display order. */
  readonly findingTypes: readonly DamageFindingType[];
}

export type DamageFindingsValidation =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        "empty" | "none_observed_not_exclusive" | "unknown_finding";
    };

/**
 * Whether a set of stored strings is a set of findings an assessment can carry.
 *
 * Three rules, checked in order: minimum one (`ERD.md` — `finding_types` is
 * never empty; `none_observed` is a real finding, not an empty array), every
 * value is a T-29 value (never invent one), and `none_observed` stands alone —
 * "nothing observed, and also swelling" is not a statement a person can have
 * made.
 */
export function validateFindings(
  findings: readonly string[],
): DamageFindingsValidation {
  if (findings.length === 0) return { ok: false, reason: "empty" };
  if (
    !findings.every((finding) => isTaxonomyValue(DAMAGE_FINDING_TYPES, finding))
  ) {
    return { ok: false, reason: "unknown_finding" };
  }
  if (findings.includes("none_observed") && findings.length > 1) {
    return { ok: false, reason: "none_observed_not_exclusive" };
  }
  return { ok: true };
}

function isDamagedOrDefectiveFinding(finding: DamageFindingType): boolean {
  return isTaxonomyValue(DAMAGED_OR_DEFECTIVE_FINDING_TYPES, finding);
}

function isCosmeticFinding(finding: DamageFindingType): boolean {
  return isTaxonomyValue(COSMETIC_FINDING_TYPES, finding);
}

/**
 * The determination a set of confirmed findings mechanically implies.
 *
 * - any finding in the damaged-or-defective set, or `isDefective` → the record
 *   is `damaged_or_defective` (Rule 6.4), the `damaged` flag is set from the
 *   findings and `defective` from the functional flag (T-30), the assessment
 *   is `assessed_damaged`, and air transport is prohibited;
 * - only cosmetic findings → `cosmetic_wear_only`, no flag, `assessed_sound`;
 * - `none_observed` → `sound`, no flag, `assessed_sound`.
 *
 * Findings that fail {@link validateFindings} throw rather than guess: the
 * caller was meant to refuse them at the boundary, and a determination made
 * from an impossible set would be filed and believed.
 */
export function assessDamage(
  findings: readonly DamageFindingType[],
  extra: { readonly isDefective: boolean },
): DamageDetermination {
  const validation = validateFindings(findings);
  if (!validation.ok) {
    throw new RangeError(
      `Findings cannot be assessed (${validation.reason}). validateFindings gates this call — Rules 6.3, 6.4.`,
    );
  }

  const unique = new Set(findings);
  const findingTypes = DAMAGE_FINDING_TYPES.filter((finding) =>
    unique.has(finding),
  );

  const damaged = findingTypes.some(isDamagedOrDefectiveFinding);
  const cosmetic = findingTypes.some(isCosmeticFinding);

  if (damaged || extra.isDefective) {
    const ddrFlags: DdrFlag[] = [];
    if (damaged) ddrFlags.push("damaged");
    if (extra.isDefective) ddrFlags.push("defective");
    return {
      assessedCondition: "damaged_or_defective",
      ddrFlags,
      isAirTransportProhibited: true,
      assessmentStatus: "assessed_damaged",
      findingTypes,
    };
  }

  return {
    assessedCondition: cosmetic ? "cosmetic_wear_only" : "sound",
    ddrFlags: [],
    isAirTransportProhibited: false,
    assessmentStatus: "assessed_sound",
    findingTypes,
  };
}
