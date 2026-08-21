import type {
  IsoDate,
  IsoTimestamp,
  JsonObject,
  Sha256,
  TenantScoped,
  Timestamped,
  Uuid,
} from "@/types/common";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";

/**
 * Producer obligations and evidence — `ERD.md` §9 and §10.1 · B1b.
 *
 * `producer_obligation` · `obligation_deadline` · `evidence_pack`.
 *
 * Typed here from B1a so the schema and the type set are complete from the
 * start, and **given no `DataAdapter` method, no mock implementation and no
 * fixture in this unit** (D-24).
 *
 * The three `status` fields below carry no `TAXONOMY.md` system, and `ERD.md`
 * says so explicitly: they are specified at Gate 2 with Rules 8.5 and 9.1.
 * Values are a taxonomy addition at that gate, **not a builder's choice**.
 */

export interface ProducerObligation extends TenantScoped, Timestamped {
  readonly id: Uuid;
  readonly jurisdictionId: Uuid;
  readonly jurisdictionRuleId: Uuid;
  readonly governingRuleVersionId: Uuid;
  readonly obligationKey: string;
  readonly obligationTitle: string;
  /** Copied from the rule version at determination time. **Never written into logic.** */
  readonly citation: string;
  /** The inputs that triggered it — format, mass, energy, removability, sales footprint. */
  readonly appliesBecause: JsonObject;
  readonly evaluationTrace: readonly AppliedRuleVersion[];
  /** Which stewardship organization to join. */
  readonly stewardshipOrgName: string | null;
  /** **No `TAXONOMY.md` system governs this field** — specified at Gate 2 (Rule 8.5). */
  readonly status: string;
  readonly determinedAt: IsoTimestamp;
  readonly determinedBy: Uuid | null;
  readonly isCurrent: boolean;
  readonly supersedesProducerObligationId: Uuid | null;
}

export interface ObligationDeadline extends TenantScoped, Timestamped {
  readonly id: Uuid;
  readonly producerObligationId: Uuid;
  readonly deadlineKey: string;
  /** **From the rule payload. Never a literal in code.** */
  readonly dueOn: IsoDate;
  /**
   * Whether the date is fixed by statute or derived from an event.
   *
   * `ERD.md` §9.2 says the values are in `TAXONOMY.md`; no system defines them —
   * reported in this unit's build-notes.
   */
  readonly dueBasis: string;
  /** Mandatory, as on `rule_version`. */
  readonly citation: string;
  readonly governingRuleVersionId: Uuid;
  /** **No `TAXONOMY.md` system governs this field** — specified at Gate 2 (Rule 8.5). */
  readonly status: string;
  readonly completedAt: IsoTimestamp | null;
  readonly completedBy: Uuid | null;
  /** The filing that satisfied it. */
  readonly evidenceDocumentRenderId: Uuid | null;
  readonly reminderSchedule: JsonObject | null;
  readonly nextReminderAt: IsoTimestamp | null;
}

/**
 * The underwriter/auditor export · B1b.
 *
 * **It contains records that already exist; it never creates new assertions**,
 * and a gap appears in the pack as a gap (Rule 9.3). It never expresses a
 * probability of ignition (Rule 9.4).
 */
export interface EvidencePack extends TenantScoped, Timestamped {
  readonly id: Uuid;
  /**
   * Which kind of pack.
   *
   * `ERD.md` §10.1 gives no `TAXONOMY.md` citation for this field — reported in
   * this unit's build-notes.
   */
  readonly packType: string;
  readonly periodStartOn: IsoDate;
  readonly periodEndOn: IsoDate;
  /**
   * Every included artifact with its `documentRenderId` and `contentHash` —
   * **the pack proves what it contained.**
   */
  readonly manifest: JsonObject;
  /** SHA-256 over the manifest. */
  readonly contentHash: Sha256 | null;
  /** The assembled export. */
  readonly documentRenderId: Uuid | null;
  /** **No `TAXONOMY.md` system governs this field** — specified at Gate 2 (Rule 9.1). */
  readonly status: string;
  readonly requestedBy: Uuid;
  readonly requestedAt: IsoTimestamp;
  readonly generatedAt: IsoTimestamp | null;
  /** P5's access window. **Read-only regardless**, and a grant without an expiry cannot be created (Rule 1.15). */
  readonly auditorAccessExpiresAt: IsoTimestamp | null;
}
