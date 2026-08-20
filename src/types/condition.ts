import type {
  Created,
  Decimal,
  IsoDate,
  IsoTimestamp,
  JsonObject,
  JsonValue,
  TenantScoped,
  Timestamped,
  Uuid,
} from "@/types/common";
import type { ConditionGrade } from "@/domain/taxonomy/condition-grade";
import type { DamageAssessmentStatus } from "@/domain/taxonomy/damage-assessment-status";
import type { DamageFindingType } from "@/domain/taxonomy/damage-finding-type";
import type { HazardFactorCode } from "@/domain/taxonomy/hazard-factor-code";
import type { HazardRankingBand } from "@/domain/taxonomy/hazard-ranking-band";
import type { RecallMatchStatus } from "@/domain/taxonomy/recall-match-status";
import type { RecallSource } from "@/domain/taxonomy/recall-source";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";

/**
 * Condition — `ERD.md` §8.
 *
 * `damage_assessment` (B1a) · `grade`, `hazard_ranking`, `recall_match` (B2).
 *
 * The three B2 entities are typed here from B1a so a later phase adds behaviour
 * rather than migrating types — **and they get no `DataAdapter` method, no mock
 * implementation and no fixture in this unit** (D-24). Adding a method at the
 * phase that needs it is normal; carrying unused ones through 32 weeks of
 * prototype churn is not.
 */

/**
 * Visible damage indicators and the resulting assessed condition —
 * **APPEND-ONLY**. Also the landing place for a third-party battery-health
 * tester reading (the B3 socket).
 *
 * **Neither assessed state is terminal.** Rule 6.11 provides exactly one
 * clearing path — a superseding human assessment finding no indicator present,
 * with a stated reason and **at least one supporting photograph**, which the
 * schema enforces with a CHECK rather than trusting the form. Both assessments
 * stay visible side by side, permanently and in every export (Rule 6.12).
 *
 * This transition is the only thing that clears an air-transport block.
 */
export interface DamageAssessment extends TenantScoped, Created {
  readonly id: Uuid;
  readonly batteryRecordId: Uuid;
  /** The damage photo, when there is one. */
  readonly intakePhotoId: Uuid | null;
  /**
   * How the assessment was produced. An instrument-sourced row also carries the
   * `instrument*` fields below.
   *
   * `ERD.md` §8.1 says the values are in `TAXONOMY.md`; no system defines them —
   * reported in this unit's build-notes.
   */
  readonly assessmentMethod: string;
  /** T-46. */
  readonly status: DamageAssessmentStatus;
  /** T-29. Minimum one; **`none_observed` is a real finding, not an empty array** (Rule 6.3). */
  readonly findingTypes: readonly DamageFindingType[];
  /** Per finding: severity, note, photo reference. */
  readonly findingDetail: JsonValue | null;
  /**
   * **Assessed**, never *measured* (`_ANCHORS.md` §7.5). Assessed and measured
   * are never merged into one field (Rule 11.5).
   */
  readonly assessedCondition: string;
  /** Read by the shipment trigger. */
  readonly isAirTransportProhibited: boolean;
  readonly governingRuleVersionId: Uuid | null;
  readonly evaluationTrace: readonly AppliedRuleVersion[] | null;
  /** B2 model-assisted triage. **A model proposes, a human sets** (Rules 6.2, 6.6). */
  readonly modelProvider: string | null;
  readonly modelIdentifier: string | null;
  readonly modelConfidence: Decimal | null;
  /** **The B3 health-tester socket.** Vendor open at Gate 3. */
  readonly instrumentVendor: string | null;
  readonly instrumentModel: string | null;
  readonly instrumentSerial: string | null;
  readonly instrumentReadAt: IsoTimestamp | null;
  /**
   * Vendor payload, verbatim. **BMMP records what the instrument reported; it
   * does not present it as its own measurement.**
   */
  readonly instrumentReading: JsonObject | null;
  readonly assessedAt: IsoTimestamp;
  /** Null when the source is an instrument webhook. */
  readonly assessedBy: Uuid | null;
  readonly confirmedBy: Uuid | null;
  readonly confirmedAt: IsoTimestamp | null;
  /** **Rule 6.11's supporting photograph.** Required in effect on a clearing transition. */
  readonly clearingPhotoIntakePhotoId: Uuid | null;
  /** Corrections insert. Both stay visible side by side, permanently (Rule 6.12). */
  readonly supersedesDamageAssessmentId: Uuid | null;
}

/**
 * The published transparent grading scheme's output — **APPEND-ONLY** · B2.
 *
 * There is no external letter-grade standard to conform to; **BMMP publishes its
 * own scheme and says so** (Rule 10.6). A grade is a commercial and safety claim
 * and is confirmed by a person before it leaves the system.
 */
export interface Grade extends TenantScoped, Created {
  readonly id: Uuid;
  readonly batteryRecordId: Uuid;
  readonly schemeKey: string;
  /** Published schemes are versioned; **an old grade keeps its old scheme**. */
  readonly schemeVersion: string;
  /** T-31. */
  readonly gradeValue: ConditionGrade;
  /** Per-criterion contribution with a stated basis. */
  readonly basis: JsonObject;
  readonly inputsSnapshot: JsonObject;
  /** Stated confidence, per Gate 3. */
  readonly confidence: Decimal | null;
  /** Fan-in inputs — the three run independently and grading consumes all three. */
  readonly damageAssessmentId: Uuid | null;
  readonly hazardRankingId: Uuid | null;
  readonly recallMatchId: Uuid | null;
  readonly governingRuleVersionId: Uuid | null;
  readonly decidedAt: IsoTimestamp;
  /** Null until the human gate. */
  readonly decidedBy: Uuid | null;
  /** **A grade is a commercial claim; a person confirms it.** */
  readonly confirmedBy: Uuid | null;
  readonly confirmedAt: IsoTimestamp | null;
  readonly isCurrent: boolean;
  readonly supersedesGradeId: Uuid | null;
}

/**
 * A **relative ranking with a stated basis per factor** — **APPEND-ONLY** · B2.
 *
 * **There is no field named `probability`, `likelihood`, `riskScore`,
 * `ignitionProbability` or any equivalent, and none may be added.** Per
 * `_ANCHORS.md` §7.1, `PROJECT_SETUP_BMMP.md` §8.3 and Roadmap Principle 4, this
 * product never outputs a probability of ignition — in a column, an API
 * response, an export or a PDF. **The absence of that field is the enforcement**,
 * here and in the schema.
 */
export interface HazardRanking extends TenantScoped, Created {
  readonly id: Uuid;
  /**
   * What was ranked; matches whichever id below is non-null.
   *
   * `ERD.md` §8.3 says the values are in `TAXONOMY.md`; no system defines them —
   * reported in this unit's build-notes.
   */
  readonly scopeType: string;
  readonly batteryRecordId: Uuid | null;
  readonly containerId: Uuid | null;
  readonly lotId: Uuid | null;
  /** Position within the ranked set — **relative, not absolute**. */
  readonly rankPosition: number;
  /** **Ranking is meaningless without its denominator.** */
  readonly rankedSetSize: number;
  /** T-33. */
  readonly band: HazardRankingBand;
  /** Plain language, printed wherever the ranking is shown. */
  readonly basisStatement: string;
  /** T-34. Minimum one. */
  readonly factorCodes: readonly HazardFactorCode[];
  /** Per factor: value, weight and **its stated basis** (Rule 10.4). */
  readonly factors: JsonObject;
  readonly schemeVersion: string;
  readonly governingRuleVersionId: Uuid | null;
  readonly computedAt: IsoTimestamp;
  readonly isCurrent: boolean;
  readonly supersedesHazardRankingId: Uuid | null;
}

/**
 * Candidate recall matches from the free government sources · B2.
 *
 * Mutable, because a human confirms or dismisses. **A match is a candidate, not
 * a fact** (Rule 10.7), and **a failed check is recorded as a pending state with
 * a reason, never as an absent row**.
 */
export interface RecallMatch extends TenantScoped, Timestamped {
  readonly id: Uuid;
  readonly batteryRecordId: Uuid;
  /** T-36. */
  readonly source: RecallSource;
  /** The recall's own identifier. */
  readonly providerRecordId: string;
  /** Which fields produced the match. */
  readonly matchedOn: JsonObject;
  readonly matchConfidence: Decimal | null;
  /** T-35. */
  readonly status: RecallMatchStatus;
  readonly recallNumber: string | null;
  readonly recallTitle: string | null;
  readonly recallUrl: string | null;
  readonly recallPublishedOn: IsoDate | null;
  readonly remedySummary: string | null;
  readonly checkedAt: IsoTimestamp;
  /** **Source unavailable is recorded, not swallowed.** */
  readonly checkErrorCode: string | null;
  /**
   * Recording an association is open to P1, P2 or P6 — the handler receives the
   * notice and the effect is safety-increasing (Rule 6.23). **Removing one is
   * held to Rule 6.11's discipline**, so clearing a recall flag cannot become a
   * route around the air prohibition (Rule 6.24).
   */
  readonly confirmedBy: Uuid | null;
  readonly confirmedAt: IsoTimestamp | null;
  readonly dismissedBy: Uuid | null;
  readonly dismissedReason: string | null;
}
