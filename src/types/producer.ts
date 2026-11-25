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
import type { DeadlineDueBasis } from "@/domain/taxonomy/deadline-due-basis";
import type { ObligationDeadlineStatus } from "@/domain/taxonomy/obligation-deadline-status";
import type { ProducerObligationStatus } from "@/domain/taxonomy/producer-obligation-status";

/**
 * Producer obligations and evidence — `ERD.md` §9 and §10.1 · B1b.
 *
 * `producer_product` · `producer_obligation` · `obligation_deadline` ·
 * `evidence_pack`.
 *
 * Typed from B1a so the schema and the type set were complete from the start
 * (D-24). `b1b-12-state-rules` gives the first three their adapter, their
 * mock and their fixtures (Rules 8.6–8.16; D-78), and their status fields
 * their systems: T-68, T-69 and T-70. `evidence_pack` stays unbuilt (§9).
 */

/**
 * A product the organization declares itself the producer of, and the states
 * it is sold in — Rule 8.6; `_ANCHORS.md` §3 (B1b, D-78).
 *
 * **Its facts are the catalog entry's**: chemistry, mass, energy,
 * removability and application class are read from it, never typed here.
 * Removal is a dated update with a reason — no row is ever deleted
 * (`TECHNICAL_SPEC.md` §9.5). Argued for the first migration in
 * `BUILD_NOTES_b1b-12-state-rules.md` §3.
 */
export interface ProducerProduct extends TenantScoped, Timestamped {
  readonly id: Uuid;
  /** A published catalog entry (T-07). */
  readonly catalogEntryId: Uuid;
  /** The states it is sold, offered for sale or distributed in or into. */
  readonly jurisdictionIds: readonly Uuid[];
  readonly addedAt: IsoTimestamp;
  readonly addedBy: Uuid | null;
  readonly removedAt: IsoTimestamp | null;
  readonly removedBy: Uuid | null;
  readonly removalReason: string | null;
}

export interface ProducerObligation extends TenantScoped, Timestamped {
  readonly id: Uuid;
  readonly jurisdictionId: Uuid;
  readonly jurisdictionRuleId: Uuid;
  readonly governingRuleVersionId: Uuid;
  readonly obligationKey: string;
  readonly obligationTitle: string;
  /** Copied from the rule version at determination time. **Never written into logic.** */
  readonly citation: string;
  /**
   * The inputs that decided it — every product sold in the state with its band
   * in the law's terms (D-78 #4), the coverage and obligations versions, the
   * due rule, and the signature a re-run compares (Rule 8.11).
   */
  readonly appliesBecause: JsonObject;
  readonly evaluationTrace: readonly AppliedRuleVersion[];
  /** Which stewardship organization to join. */
  readonly stewardshipOrgName: string | null;
  /** T-68. Set by an evaluation run, never by a person (Rule 8.9). */
  readonly status: ProducerObligationStatus;
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
  /** T-70. A date that waits on an event is not a deadline (Rule 8.10). */
  readonly dueBasis: DeadlineDueBasis;
  /** Mandatory, as on `rule_version`. */
  readonly citation: string;
  readonly governingRuleVersionId: Uuid;
  /** T-69. Overdue is shown from the date, never stored. */
  readonly status: ObligationDeadlineStatus;
  /** The date the deadline was met — Rule 8.12. */
  readonly completedOn: IsoDate | null;
  /** When it was marked done. */
  readonly completedAt: IsoTimestamp | null;
  readonly completedBy: Uuid | null;
  /** What was done — required with a completion (Rule 8.12). */
  readonly completionNote: string | null;
  /** A filing number, a receipt, a membership id. Optional. */
  readonly completionReference: string | null;
  /** The filing that satisfied it. */
  readonly evidenceDocumentRenderId: Uuid | null;
  readonly reminderSchedule: JsonObject | null;
  readonly nextReminderAt: IsoTimestamp | null;
}

/**
 * One entry in a producer's sales dataset — Rule 8.17; `_ANCHORS.md` §3
 * (`producer_sales_record`, B1b, D-81).
 *
 * A product, a state, a calendar year and **the number of units** sold,
 * offered for sale or distributed in or into that state that year, with a
 * note saying where the number came from. **Only units are typed**: weight
 * and energy are worked out from the catalog entry, never stored here.
 *
 * - **A missing entry is a gap, never zero.** Zero is an entry someone typed.
 * - **A correction is a new entry that replaces the old one.** The old one
 *   is kept, and its `supersededById` points at its replacement — the only
 *   update the row ever takes, by trigger (`TECHNICAL_SPEC.md` §9.5).
 *
 * Argued for the first migration in `BUILD_NOTES_b1b-13-filings.md` §3.
 */
export interface ProducerSalesRecord extends TenantScoped {
  readonly id: Uuid;
  readonly producerProductId: Uuid;
  readonly jurisdictionId: Uuid;
  /** A calendar year. */
  readonly year: number;
  /** A whole number, zero allowed. */
  readonly units: number;
  /** Where the number came from. Required. */
  readonly basisNote: string;
  readonly recordedAt: IsoTimestamp;
  readonly recordedBy: Uuid;
  /** Set when a correction replaces it — kept, shown as replaced. */
  readonly supersededById: Uuid | null;
  readonly supersededAt: IsoTimestamp | null;
  readonly createdAt: IsoTimestamp;
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
