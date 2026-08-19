import type {
  Attributed,
  Created,
  Decimal,
  IsoTimestamp,
  JsonObject,
  JsonValue,
  PostalAddress,
  TenantScoped,
  TimeZone,
  Timestamped,
  Uuid,
} from "@/types/common";
import type { AlertType } from "@/domain/taxonomy/alert-type";
import type { ContainerStatus } from "@/domain/taxonomy/container-status";
import type { ContainerType } from "@/domain/taxonomy/container-type";
import type { HandlerActivityType } from "@/domain/taxonomy/handler-activity-type";
import type { LotStatus } from "@/domain/taxonomy/lot-status";
import type { StorageClockAlertBand } from "@/domain/taxonomy/storage-clock-alert-band";
import type { StorageClockStatus } from "@/domain/taxonomy/storage-clock-status";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";

/**
 * Storage and containers — `ERD.md` §6.
 *
 * `container` · `lot` · `storage_clock` · `storage_event` · `alert`.
 */

/**
 * A physical accumulation container.
 *
 * **A container row covers one accumulation cycle.** Reusing the physical drum
 * after a shipment opens a **new** row — that is what keeps an accumulation
 * start date, a label and a clock unambiguous.
 */
export interface Container extends TenantScoped, Timestamped, Attributed {
  readonly id: Uuid;
  /** From `organization.container_seq`. */
  readonly containerCode: string;
  /**
   * T-23. **A composite of two dimensions** — classification outcome (T-13) ×
   * condition state (T-30, T-46) — per Rule 4.28. Because every value carries
   * both, no container can hold two waste classification outcomes and no
   * container can hold sound material beside DDR material (Rules 6.17, 6.18).
   *
   * Effectively terminal once the container holds material: changing it with
   * contents present is unavailable, and the material moves to a new container.
   */
  readonly containerType: ContainerType;
  /** Grouping for handling and reporting. */
  readonly lotId: Uuid | null;
  /** **The only shipment-membership link in the schema** (`ERD.md` §11.1). */
  readonly shipmentId: Uuid | null;
  readonly capacityKg: Decimal | null;
  /** Fire-code volume limits are rule rows that read this. */
  readonly capacityVolumeM3: Decimal | null;
  /** Maintained by trigger on containment change. */
  readonly currentNetMassKg: Decimal | null;
  /**
   * The date the **first battery was placed** — not when the container was
   * created (Rule 4.4). Printed on the label; a mismatch flags the container as
   * mislabeled and it cannot ship until relabelled (Rules 4.19, 4.22).
   *
   * **No role can change this.** It travels with the records (Rules 4.9–4.12),
   * and there is no re-date control on any screen for any role — a re-date
   * affordance is a way to restart a legal clock.
   */
  readonly accumulationStartedAt: IsoTimestamp | null;
  /**
   * How the start date was established.
   *
   * `ERD.md` §6.1 says the values are in `TAXONOMY.md`; no system defines them —
   * reported in this unit's build-notes.
   */
  readonly accumulationStartSource: string | null;
  /** Falls back to `organization.primaryAddress`. */
  readonly siteAddress: PostalAddress | null;
  /** IANA zone, defaulted from the organization. **Clock day boundaries are evaluated here** (Rule 4.29). */
  readonly siteTimeZone: TimeZone;
  /** Aisle, rack, room. */
  readonly storageLocation: string | null;
  /**
   * T-24. Includes **`overdue`** — **a hard state, not a warning**: the
   * container accepts no new items and its contents leave only by shipment or a
   * recorded P2 remediation (Rules 4.15–4.17). It can enter it on receipt by
   * inheriting an earlier start date (Rule 4.10; EC-23).
   *
   * There is no separate `empty` value; emptiness is read from fill level and
   * clock status.
   */
  readonly status: ContainerStatus;
  readonly sealedAt: IsoTimestamp | null;
  /** Ends the accumulation cycle. */
  readonly closedAt: IsoTimestamp | null;
  /** The label currently in force. */
  readonly currentContainerLabelId: Uuid | null;
}

/**
 * A grouping of containers for handling, reporting and shipment building.
 *
 * **A lot holds containers, not batteries** — one containment path, no
 * ambiguity. It has no fill level and no storage clock of its own (Rule 4.23),
 * reports the earliest accumulation start date among its contents, and reads
 * overdue where any content container is overdue (Rule 4.24).
 */
export interface Lot extends TenantScoped, Timestamped, Attributed {
  readonly id: Uuid;
  /** From `organization.lot_seq`. */
  readonly lotCode: string;
  readonly description: string | null;
  /** Rolled up from contents; read by B1b storage-volume and B2 aggregation views. */
  readonly chemistryMix: JsonObject | null;
  /** Maintained by trigger. */
  readonly totalMassKg: Decimal | null;
  /** Maintained by trigger. **Jurisdictions that measure by energy read this.** */
  readonly totalEnergyWh: Decimal | null;
  /** T-25. */
  readonly status: LotStatus;
}

/**
 * The accumulation clock. Attaches to **either** a battery or a container, never
 * both.
 *
 * **The clock never pauses** (Rule 4.6). There is no hold, freeze, suspend or
 * extension field here, and the absence is the enforcement: a container in
 * dispute, under inspection or awaiting a carrier keeps counting.
 *
 * `maxDurationDays` is **copied from the resolved rule version at the moment the
 * clock starts**, so a later rule change does not silently move a running clock.
 * "The one-year clock" is colloquial; the system never assumes one year
 * (Rule 4.5).
 */
export interface StorageClock extends TenantScoped, Timestamped {
  readonly id: Uuid;
  /**
   * Which subject this clock runs on; matches whichever id below is non-null.
   *
   * `ERD.md` §6.3 says the values are in `TAXONOMY.md`; no system defines them —
   * reported in this unit's build-notes.
   */
  readonly subjectType: string;
  readonly batteryRecordId: Uuid | null;
  readonly containerId: Uuid | null;
  readonly clockStartAt: IsoTimestamp;
  /**
   * What started it.
   *
   * `ERD.md` §6.3 gives no `TAXONOMY.md` citation for this column — reported in
   * this unit's build-notes.
   */
  readonly clockStartBasis: string;
  /** Copied from the container at start, so a later site edit cannot move a running clock. */
  readonly timeZone: TimeZone;
  /** **Copied from the resolved rule version at start. Not a constant in code.** */
  readonly maxDurationDays: number;
  /** Which version set the duration. */
  readonly governingRuleVersionId: Uuid;
  /** Full applied-rule array with citations frozen at start. */
  readonly evaluationTrace: readonly AppliedRuleVersion[];
  /** Computed once, in `timeZone`, stored. */
  readonly dueAt: IsoTimestamp;
  /** Offsets materialised from the rule payload — the ladder is data. */
  readonly alertSchedule: JsonObject;
  /** T-27. Band offsets are configuration; the *existence* of alerting is not (Rule 4.13). */
  readonly alertBand: StorageClockAlertBand;
  /**
   * Advanced in the same transaction as the alert event, **so a double cron run
   * cannot double-fire**.
   */
  readonly nextAlertAt: IsoTimestamp | null;
  readonly stoppedAt: IsoTimestamp | null;
  readonly stopReason: string | null;
  /**
   * T-26. The overdue value is **`overdue`** — renamed from `expired` at
   * `TAXONOMY.md` v1.2 so one condition is not called two things across
   * `container.status`, this field and `alertBand`.
   */
  readonly status: StorageClockStatus;
}

/**
 * Everything that happens to a container, a clock or a battery's storage state —
 * **APPEND-ONLY**.
 */
export interface StorageEvent extends TenantScoped, Created {
  readonly id: Uuid;
  /**
   * T-16. Which activities are permitted and which prohibited is
   * `jurisdiction_rule` data. **A prohibited activity has no screen, action,
   * status or field through which it can be recorded** (Rules 3.21, 3.22).
   */
  readonly activityType: HandlerActivityType;
  readonly storageClockId: Uuid | null;
  readonly containerId: Uuid | null;
  readonly batteryRecordId: Uuid | null;
  readonly lotId: Uuid | null;
  readonly occurredAt: IsoTimestamp;
  /** Differs from `occurredAt` on a backdated entry. */
  readonly recordedAt: IsoTimestamp;
  /** Null when the actor is the alert job. */
  readonly recordedBy: Uuid | null;
  readonly payload: JsonValue | null;
  /** Set on rule-driven events. */
  readonly governingRuleVersionId: Uuid | null;
}

/**
 * **Alerts are records, not notifications** — `ERD.md` §6.5.
 *
 * *"The system warned them"* is itself evidence. An alert that exists only as a
 * sent email cannot be produced at an audit, cannot be counted, and cannot be
 * shown to an underwriter. Alerts are retained and appear in the audit export
 * (Rule 12.9), and **no screen derives an alert on render**
 * (`SITE_ARCHITECTURE.md` §7.6a).
 */
export interface Alert extends TenantScoped, Timestamped {
  readonly id: Uuid;
  /** T-44. */
  readonly alertType: AlertType;
  /**
   * **Never expresses a probability of ignition** (Rules 1.25, 10.3; T-44).
   *
   * `ERD.md` §6.5 says the values are in `TAXONOMY.md`; no system defines them —
   * reported in this unit's build-notes.
   */
  readonly severity: string;
  /** Plain language, rendered from the alert's own data — never a stored regulatory phrase. */
  readonly title: string;
  /** States the condition and the required handling, **never a chance of anything**. */
  readonly body: string;
  readonly storageClockId: Uuid | null;
  readonly containerId: Uuid | null;
  readonly batteryRecordId: Uuid | null;
  readonly shipmentId: Uuid | null;
  readonly intakeSessionId: Uuid | null;
  readonly recallMatchId: Uuid | null;
  readonly obligationDeadlineId: Uuid | null;
  /** The site the alert belongs to, for routing per Rule 4.14. */
  readonly siteIdRef: string | null;
  /**
   * Default routing from T-44, as role codes. **Routing, not permission** — what
   * a role can see is `BUSINESS_RULES.md` §1 and the capability map.
   */
  readonly audienceRoles: readonly string[];
  /** Which version's threshold or offset fired it. Null only for non-rule alerts. */
  readonly governingRuleVersionId: Uuid | null;
  /** The values that crossed the threshold, frozen — so "why did this fire" is answerable later. */
  readonly triggerSnapshot: JsonObject;
  readonly raisedAt: IsoTimestamp;
  /**
   * Stable per (subject, type, band). **Makes re-evaluation idempotent** — a
   * re-run never fires a duplicate.
   */
  readonly dedupeKey: string;
  readonly acknowledgedAt: IsoTimestamp | null;
  readonly acknowledgedBy: Uuid | null;
  /** Set when the underlying condition clears. */
  readonly resolvedAt: IsoTimestamp | null;
  readonly resolutionReason: string | null;
  /** Where it was also sent. **Delivery is a property of the record, never the record itself.** */
  readonly deliveredChannels: JsonValue | null;
}
