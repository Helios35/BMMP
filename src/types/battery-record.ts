import type {
  Attributed,
  Decimal,
  IsoDate,
  IsoTimestamp,
  JsonObject,
  JsonValue,
  TenantScoped,
  Timestamped,
  Uuid,
} from "@/types/common";
import type { ApplicationClass } from "@/domain/taxonomy/application-class";
import type { AssemblyLevel } from "@/domain/taxonomy/assembly-level";
import type { BatteryRecordStatus } from "@/domain/taxonomy/battery-record-status";
import type { CellFormFactor } from "@/domain/taxonomy/cell-form-factor";
import type { Chemistry } from "@/domain/taxonomy/chemistry";
import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import type { DispositionRoute } from "@/domain/taxonomy/disposition-route";
import type { ProvenanceSourceType } from "@/domain/taxonomy/provenance-source-type";
import type { StateOfChargeBand } from "@/domain/taxonomy/state-of-charge-band";

/**
 * The canonical battery record — `ERD.md` §5.1, migration `0005`.
 *
 * **One record type for a power-wheelchair pack, a mobility scooter pack, a
 * consumer cell, an industrial pack and a vehicle traction pack.** Phase B3 is a
 * four-week phase on that assumption; built narrow, B3 is a rebuild rather than
 * an activation (`PROJECT_SETUP_BMMP.md` §8.2, `TECHNICAL_SPEC.md` §4.2,
 * `PRD.md` §6.19).
 *
 * **No field below is named or scaled for one battery class.** `batteryMassKg`
 * holds a 0.045 kg coin cell and a 600 kg traction pack. `cellCount`,
 * `moduleCount` and `cellFormFactor` are nullable because a consumer cell has no
 * modules and a mobility pack rarely publishes cell counts — a required field
 * here would force fake data. Lead-acid is a first-class chemistry from day one,
 * not a lithium schema with an exception. `sourceDeviceIdentifier` holds a VIN,
 * a wheelchair serial, a scooter serial or an asset tag, and is **deliberately
 * not named `vin`**.
 *
 * **Widening this record after `0005` for a battery class that was known in
 * August 2026 is a defect, not a feature.**
 *
 * The backbone is adopted from the Battery Pass data model, which is public and
 * openly licensed, so a European passport export stays a serialisation exercise
 * instead of a rebuild (`TECHNICAL_SPEC.md` §4.1). BMMP extensions are grouped
 * and reasoned below.
 */
export interface BatteryRecord extends TenantScoped, Timestamped, Attributed {
  // --- Identity and tenancy ------------------------------------------------

  readonly id: Uuid;
  /** Allocated from `organization.battery_record_seq` in the insert transaction. */
  readonly recordNumber: string;
  /**
   * ISO/IEC 15459-style unique identifier. Null until issued; present makes a
   * passport export mechanical.
   */
  readonly batteryPassportIdentifier: string | null;
  /** T-22. */
  readonly status: BatteryRecordStatus;
  /** The session that created it. */
  readonly intakeSessionId: Uuid | null;
  /** The matched and **human-confirmed** product. */
  readonly catalogEntryId: Uuid | null;
  /**
   * **The only containment link.** Lot and shipment membership derive through
   * the container (`ERD.md` §11.1). Two paths would mean two answers to "what is
   * on this shipment", and a legal document cannot have two answers.
   */
  readonly containerId: Uuid | null;
  readonly archivedAt: IsoTimestamp | null;

  // --- Battery Pass: general battery and manufacturer information ----------

  /**
   * Battery Pass battery status.
   *
   * An external vocabulary from the Battery Pass data model. **No `TAXONOMY.md`
   * system enumerates it** — reported in this unit's build-notes rather than
   * invented here (TAXONOMY.md §1.1).
   */
  readonly batteryStatus: string | null;
  readonly manufacturerName: string | null;
  /** Economic-operator identifier. */
  readonly manufacturerIdentifier: string | null;
  readonly manufacturingPlace: string | null;
  /** May originate from `date_code_decode`. */
  readonly manufacturedOn: IsoDate | null;
  readonly brandName: string | null;
  readonly modelName: string | null;
  readonly partNumber: string | null;
  /** Customer data. Redacted below `warn` in logs (Rule 7.21). */
  readonly serialNumber: string | null;
  /** Holds a 0.045 kg cell and a 600 kg traction pack. One field, no loss. */
  readonly batteryMassKg: Decimal | null;
  /**
   * T-01. **Matched from the catalog and confirmed by a human. Never written
   * from an extraction, never inferred from an image** (Rules 2.9, 2.10;
   * `_ANCHORS.md` §7.2).
   *
   * D-23: the resolved lithium-ion sub-chemistry lives here, defaulted from the
   * matched catalog entry — not left on the catalog entry alone.
   */
  readonly chemistry: Chemistry | null;
  /**
   * T-04. May be proposed from a photograph and still passes the gate. **It
   * never contributes to a chemistry determination** (Rule 2.25).
   */
  readonly cellFormFactor: CellFormFactor;
  /** T-03. The field that lets one table hold a single consumer cell and a vehicle traction pack. */
  readonly assemblyLevel: AssemblyLevel;
  /**
   * T-02. Carries `small_mobility` **from `0005`**, live at B1a — B3 onboards
   * the customer, it does not add the value.
   */
  readonly applicationClass: ApplicationClass;
  /** Nullable — a consumer cell has none. */
  readonly cellCount: number | null;
  /** Nullable — a mobility pack rarely publishes it. */
  readonly moduleCount: number | null;

  // --- Battery Pass: performance and durability (nameplate) ----------------

  /** Spans a single cell to a traction pack. */
  readonly nominalVoltageV: Decimal | null;
  readonly minVoltageV: Decimal | null;
  readonly maxVoltageV: Decimal | null;
  readonly ratedCapacityAh: Decimal | null;
  /**
   * Read by state producer thresholds, fire-code energy limits and B3
   * air-travel calculations — which is why the field exists from `0005` rather
   * than arriving with the phase that reads it.
   */
  readonly ratedEnergyWh: Decimal | null;
  readonly originalPowerW: Decimal | null;
  readonly expectedLifetimeCycles: number | null;
  readonly operatingTempMinC: Decimal | null;
  readonly operatingTempMaxC: Decimal | null;
  readonly internalResistanceMohm: Decimal | null;
  readonly cRateMax: Decimal | null;

  // --- Battery Pass: materials, footprint, circularity, conformity ---------

  readonly materialComposition: JsonObject | null;
  readonly hazardousSubstances: JsonObject | null;
  readonly criticalRawMaterials: JsonObject | null;
  readonly recycledContent: JsonObject | null;
  readonly carbonFootprint: JsonObject | null;
  readonly dismantlingInformation: JsonObject | null;
  readonly safetyInformation: JsonObject | null;
  readonly extinguishingAgent: string | null;
  /** Marks read from the label; feeds the B2 hazard ranking as one factor (T-34). */
  readonly certificationMarks: JsonValue | null;
  readonly un383TestSummaryRef: string | null;
  readonly hasUn383Summary: boolean | null;
  readonly hasSeparateCollectionSymbol: boolean | null;

  // --- [BMMP] extensions ---------------------------------------------------

  /**
   * T-21. **The band, not a number** — the storage limit that defines it is
   * jurisdiction data, so the band name carries no threshold (Rule 1.23).
   */
  readonly stateOfChargeBand: StateOfChargeBand;
  /** The observed figure behind the band. **Never the filter column.** */
  readonly stateOfChargePercentAtIntake: Decimal | null;
  /**
   * How the charge reading was established (Rule 2.26).
   *
   * `ERD.md` §5.1 does not cite a `TAXONOMY.md` system for this column and none
   * exists — reported in this unit's build-notes.
   */
  readonly socSource: string | null;
  readonly socAssessedAt: IsoTimestamp | null;
  /** T-32. B2 sets it; the field exists from `0005`. */
  readonly dispositionRoute: DispositionRoute;
  /**
   * **Assessed**, never *measured* (`_ANCHORS.md` §7.5). BMMP integrates
   * third-party health testers; it does not measure battery health itself, and
   * assessed and measured are never merged into one field (Rule 11.5).
   *
   * No `TAXONOMY.md` system enumerates the condition vocabulary — reported in
   * this unit's build-notes.
   */
  readonly assessedCondition: string | null;
  readonly conditionConfirmedBy: Uuid | null;
  readonly conditionConfirmedAt: IsoTimestamp | null;
  /**
   * How chemistry was established. **No value in the set means "read from a
   * photograph"** — Rule 2.10 admits exactly two sources, a matched catalog
   * entry or direct human entry.
   *
   * `ERD.md` §5.1 says the values are in `TAXONOMY.md`; no system defines them —
   * reported in this unit's build-notes.
   */
  readonly chemistrySource: string | null;
  /**
   * **Human confirmation of chemistry. Required before this record can produce a
   * document** (Rule 2.34).
   */
  readonly chemistryConfirmedBy: Uuid | null;
  readonly chemistryConfirmedAt: IsoTimestamp | null;
  /**
   * T-30. **An empty array is the normal state, not a null.** Set by rule
   * evaluation (Rules 6.4, 6.5). Any non-empty value makes the record damaged,
   * defective or recalled.
   */
  readonly ddrFlags: readonly DdrFlag[];
  /**
   * Read by the shipment trigger, not only by the UI. **Rule 6.8 admits no
   * override for any role** — there is no bypass parameter, no service-role path
   * and no support-grant path through it.
   */
  readonly isAirTransportProhibited: boolean;
  /** Which rule version set the two fields above. */
  readonly conditionRuleVersionId: Uuid | null;
  /** As printed. */
  readonly dateCodeRaw: string | null;
  /** The auditable decode. Deterministic rules, no machine learning (Rule 2.24). */
  readonly dateCodeDecodeId: Uuid | null;
  /**
   * What the pack came out of. **The set spans mobility devices as well as
   * vehicles from `0005`.**
   *
   * `ERD.md` §5.1 says the values are in `TAXONOMY.md`; no system defines them —
   * reported in this unit's build-notes.
   */
  readonly sourceDeviceType: string | null;
  /**
   * VIN, wheelchair serial, scooter serial or asset tag. **Deliberately not
   * named `vin`** — the record is wide, and so is this field.
   */
  readonly sourceDeviceIdentifier: string | null;
  readonly sourceDeviceMake: string | null;
  readonly sourceDeviceModel: string | null;
  readonly sourceDeviceModelYear: number | null;
  /**
   * T-11. B1a **captures** the source reference; verification and the formal
   * binding are B2 (Rules 2.30, 10.9). No B1a surface implies it is verified.
   */
  readonly provenanceSourceType: ProvenanceSourceType;
  readonly provenanceRecordedAt: IsoTimestamp | null;
  /**
   * Battery Pass attributes no BMMP rule reads and no BMMP document prints.
   *
   * **D-23's test decides what belongs here:** a Battery Pass attribute becomes
   * a typed field if any rule evaluates it, any document prints it, or any list
   * filters or sorts on it. Everything else is JSONB. **Moving an attribute out
   * of JSONB later is normal; moving one in is not.**
   */
  readonly passportExtension: JsonObject | null;
}
