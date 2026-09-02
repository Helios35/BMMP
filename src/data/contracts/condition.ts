import type { RequestContext } from "./context";
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
export interface DamageAssessmentRepository extends AppendOnlyRepository<
  DamageAssessment,
  CreateDamageAssessment,
  DamageAssessmentQuery
> {
  /**
   * Mark an assessment superseded by a later one — **the only permitted
   * update**, applied by trigger on the old row when a superseding assessment
   * is appended (T-46). Every other column stays exactly as recorded: the
   * superseded assessment is displayed alongside the current one with its
   * author, timestamp, findings and evidence, permanently (Rule 6.12).
   *
   * Mirrors `documentRenders.markSuperseded`. Refuses when the superseding row
   * does not exist, so a row can never be retired by an assessment that was
   * never written.
   */
  markSuperseded(
    ctx: RequestContext,
    id: Uuid,
    supersededByDamageAssessmentId: Uuid,
  ): Promise<DamageAssessment>;
}
