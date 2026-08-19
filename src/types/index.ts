/**
 * The 32 entity types — one per table in `docs/ERD.md`.
 *
 * | Group | Types | Phase |
 * | --- | --- | --- |
 * | Tenancy and identity | `Organization`, `User`, `Membership`, `TosAcceptance` | B1a |
 * | Rules as data | `Jurisdiction`, `JurisdictionRule`, `RuleVersion`, `FormatClassification` | B1a |
 * | Battery and identification | `BatteryRecord`, `CatalogEntry`, `IntakeSession`, `IntakePhoto`, `LabelExtraction`, `DateCodeDecode` | B1a |
 * | Storage and containers | `Container`, `Lot`, `StorageClock`, `StorageEvent`, `Alert` | B1a |
 * | Classification and documents | `ClassificationDecision`, `Shipment`, `ShippingPaper`, `ContainerLabel`, `DocumentRender` | B1a |
 * | Condition | `DamageAssessment` (B1a), `Grade`, `HazardRanking`, `RecallMatch` (B2) | B1a / B2 |
 * | Producer obligations | `ProducerObligation`, `ObligationDeadline` | B1b |
 * | Evidence and audit | `EvidencePack` (B1b), `AuditEvent` (B1a) | B1b / B1a |
 *
 * **All 32 are typed. The `DataAdapter` contract covers B1a's 26 only** — the
 * six B1b and B2 entities get no contract method, no mock implementation and no
 * fixture until the phase that needs them (D-24).
 *
 * Types are `PascalCase` singular; database tables are `snake_case` singular;
 * object properties are `camelCase`. Stored classification values are exactly as
 * `TAXONOMY.md` states them and are typed from `src/domain/taxonomy`.
 *
 * `src/domain` may import `@/types/common`, which imports nothing. It must not
 * import this barrel — the entity types depend on `src/domain/taxonomy`, and the
 * barrel would close a cycle.
 */

export * from "./common";
export * from "./tenancy";
export * from "./rules-as-data";
export * from "./battery-record";
export * from "./catalog";
export * from "./intake";
export * from "./storage";
export * from "./documents";
export * from "./condition";
export * from "./producer";
export * from "./audit";
