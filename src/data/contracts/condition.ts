import type {
  AppendInput,
  AppendOnlyRepository,
  BaseQuery,
} from "./repository";
import type { DamageAssessment } from "@/types/condition";
import type { DamageAssessmentStatus } from "@/domain/taxonomy/damage-assessment-status";
import type { DamageFindingType } from "@/domain/taxonomy/damage-finding-type";
import type { Uuid } from "@/types/common";

/**
 * Condition contracts — `ERD.md` §8.1.
 *
 * **`damage_assessment` only.** `grade`, `hazard_ranking` and `recall_match` are
 * typed in `src/types/condition.ts` and get no contract method until B2 (D-24).
 */

export type CreateDamageAssessment = AppendInput<DamageAssessment>;

export interface DamageAssessmentQuery extends BaseQuery {
  readonly batteryRecordId?: Uuid;
  readonly status?: DamageAssessmentStatus;
  readonly findingType?: DamageFindingType;
  readonly isAirTransportProhibited?: boolean;
  /** Excludes `superseded` — the assessment currently governing each record. */
  readonly isCurrent?: boolean;
}

/**
 * Append-only, and that is load-bearing.
 *
 * **Rule 6.11 is the only clearing path** for a damaged finding: a superseding
 * human assessment finding no indicator present, with a stated reason and at
 * least one supporting photograph. Because this is an append, both assessments
 * stay visible side by side, permanently and in every export (Rule 6.12) — the
 * reversal is part of the record, not a replacement of it.
 *
 * A model proposes; **a human sets** (Rules 6.2, 6.6).
 */
export type DamageAssessmentRepository = AppendOnlyRepository<
  DamageAssessment,
  CreateDamageAssessment,
  DamageAssessmentQuery
>;
