import type { ContainerType } from "@/domain/taxonomy/container-type";
import type { DamageAssessmentStatus } from "@/domain/taxonomy/damage-assessment-status";
import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import type { WasteClassification } from "@/domain/taxonomy/waste-classification";

/**
 * Placement — which container a record may enter (Rules 4.16, 4.28, 6.17,
 * 6.18; T-23).
 *
 * **A container holds one segregation class, and the constraint is enforced at
 * placement, not advised** (Rule 4.28). T-23 makes the class a composite of two
 * dimensions — the classification outcome of the contents crossed with their
 * condition state — and every value names both, so two consequences follow
 * mechanically rather than by builder judgement: no container ever holds two
 * waste classification outcomes, and no container holds sound material beside
 * damaged, defective or recalled material.
 *
 * This module reads the two dimensions and names the one container type that
 * admits the record. It reads no threshold, no fill limit and no separation
 * distance — those are `jurisdiction_rule` data and not properties of the type.
 */

/**
 * The container type a record with this classification and condition may enter.
 *
 * `null` where the classification is `undetermined`: T-23 gives such a record
 * no container at all — Rule 3.10 blocks the decision and Rule 3.12 blocks
 * every downstream document until the missing input is supplied (EC-16).
 *
 * The condition state is read from the DDR flags and the assessment status
 * together: any flag → the `_ddr` quarantine class (Rules 6.17, 6.18); an
 * assessment still `not_assessed` → the `_hold` class, from which no document
 * issues; otherwise sound.
 */
export function requiredContainerType(
  classification: WasteClassification,
  condition: {
    readonly ddrFlags: readonly DdrFlag[];
    readonly assessmentStatus: DamageAssessmentStatus;
  },
): ContainerType | null {
  if (classification === "undetermined") return null;

  const family =
    classification === "fully_regulated" ? "fully_regulated" : "light_category";

  if (condition.ddrFlags.length > 0) return `${family}_ddr`;
  if (condition.assessmentStatus === "not_assessed") return `${family}_hold`;
  return `${family}_sound`;
}
