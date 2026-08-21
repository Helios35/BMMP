import type { ObjectStore } from "./object-store";
import type {
  MembershipRepository,
  OrganizationRepository,
  TosAcceptanceRepository,
  UserRepository,
} from "./tenancy";
import type {
  FormatClassificationRepository,
  JurisdictionRepository,
  JurisdictionRuleRepository,
  RuleVersionRepository,
} from "./rules-as-data";
import type {
  BatteryRecordRepository,
  CatalogRepository,
  DateCodeDecodeRepository,
  IntakePhotoRepository,
  IntakeRepository,
  LabelExtractionRepository,
} from "./battery";
import type {
  AlertRepository,
  ContainerRepository,
  LotRepository,
  StorageClockRepository,
  StorageEventRepository,
} from "./storage";
import type {
  ClassificationDecisionRepository,
  ContainerLabelRepository,
  DocumentRenderRepository,
  ShipmentRepository,
  ShippingPaperRepository,
} from "./documents";
import type { DamageAssessmentRepository } from "./condition";
import type { AuditEventRepository } from "./audit";
import type { IdentityRepository } from "./identity";

/**
 * The contract every data adapter satisfies.
 *
 * Written before either implementation, and the only thing the rest of the
 * codebase is allowed to know about data access. **No screen, page, component,
 * hook or route handler ever talks to Supabase directly — everything goes
 * through `src/data`** (`PROJECT_SETUP_BMMP.md` §3.2, D-15).
 *
 * ## What is here, and what is deliberately not
 *
 * **B1a's 26 entities only (D-24).** Every one of the 32 entities in `ERD.md`
 * has a type in `src/types`; the six B1b and B2 entities — `grade`,
 * `hazard_ranking`, `recall_match`, `producer_obligation`,
 * `obligation_deadline`, `evidence_pack` — get **no contract method, no mock
 * implementation and no fixture** until the phase that needs them. Adding a
 * method at that phase is normal; carrying six unused ones through 32 weeks of
 * prototype churn is not.
 *
 * This is a narrower list than `TECHNICAL_SPEC.md` §5.2 sketches, and D-24
 * (19 Aug 2026) is why — see this unit's build-notes.
 *
 * ## Rules that bind every method here
 *
 * - **Every method takes a `RequestContext` first.** The mock has no row-level
 *   security, so it enforces tenant scope and role in code — or the Playwright
 *   suite passes on mock and leaks on Supabase. The **one** exception is the
 *   pre-authentication half of {@link IdentityRepository}, which takes a
 *   `PublicContext` because resolving a `RequestContext` is what those methods
 *   are for. It is documented in place in `./identity.ts` and **it is not a
 *   precedent for anything else.**
 * - Contracts import from `src/types` and `src/domain` and from each other. They
 *   import **nothing** from `@supabase/*`, from `next/*`, or from `src/lib`. A
 *   Supabase type in a contract is the leak.
 * - Every method is `async` and returns a plain serialisable object. No cursors,
 *   no query builders, no lazy relations.
 * - Query objects are explicit typed shapes. **No adapter accepts a raw filter
 *   string.**
 * - `create`/`append` inputs never include `id`, `organizationId`, `createdAt`
 *   or `createdBy` — the adapter sets them from `ctx`, so **a caller cannot
 *   write into another tenant even by accident**.
 * - Errors are thrown as the same codes by both adapters, so a test asserting on
 *   an error code passes on both.
 *
 * ## Four repositories are wider than CRUD
 *
 * `intakeSessions.commitConfirmation`, `catalogEntries.findCandidates`,
 * `shipments.offer` and `documentRenders.readBytes` / `.verify`. Each is wider
 * for a stated reason: **these are the operations that must be atomic, or that
 * must not be reimplemented differently by the two adapters.** Splitting them
 * into separate calls is how a half-committed intake or a shipment with no paper
 * reaches production.
 */
export interface DataAdapter {
  /** Which implementation is live. Reported by `GET /api/health`. */
  describe(): AdapterDescription;

  // Tenancy and identity — ERD.md §3
  /**
   * Sessions, credentials and invitations — D-39, `TECHNICAL_SPEC.md` §9.1.
   *
   * Identity is on the contract rather than beside it so that **the mocked
   * identity provider sits behind the same seam every other read goes through**:
   * when Supabase Auth lands, one module changes and no screen does.
   */
  readonly identity: IdentityRepository;
  readonly organizations: OrganizationRepository;
  readonly users: UserRepository;
  readonly memberships: MembershipRepository;
  readonly tosAcceptances: TosAcceptanceRepository;

  // Rules as data — ERD.md §4
  readonly jurisdictions: JurisdictionRepository;
  readonly jurisdictionRules: JurisdictionRuleRepository;
  readonly ruleVersions: RuleVersionRepository;
  readonly formatClassifications: FormatClassificationRepository;

  // Battery and identification — ERD.md §5
  readonly batteryRecords: BatteryRecordRepository;
  readonly catalogEntries: CatalogRepository;
  readonly intakeSessions: IntakeRepository;
  readonly intakePhotos: IntakePhotoRepository;
  readonly labelExtractions: LabelExtractionRepository;
  readonly dateCodeDecodes: DateCodeDecodeRepository;

  // Storage and containers — ERD.md §6
  readonly containers: ContainerRepository;
  readonly lots: LotRepository;
  readonly storageClocks: StorageClockRepository;
  readonly storageEvents: StorageEventRepository;
  readonly alerts: AlertRepository;

  // Classification and documents — ERD.md §7
  readonly classificationDecisions: ClassificationDecisionRepository;
  readonly shipments: ShipmentRepository;
  readonly shippingPapers: ShippingPaperRepository;
  readonly containerLabels: ContainerLabelRepository;
  readonly documentRenders: DocumentRenderRepository;

  // Condition — ERD.md §8.1. grade, hazard_ranking and recall_match are B2 (D-24).
  readonly damageAssessments: DamageAssessmentRepository;

  // Evidence and audit — ERD.md §10.2. evidence_pack is B1b (D-24).
  readonly auditEvents: AuditEventRepository;

  /** Object storage. Same seam — **no bucket name reaches a feature file.** */
  readonly objects: ObjectStore;
}

export type AdapterName = "mock" | "supabase";

export interface AdapterDescription {
  /** Which implementation is live. Reported by the health endpoint. */
  readonly name: AdapterName;
  /**
   * Whether the records this adapter returns are real. `"fake"` must never reach
   * a customer-facing document — the selector in `../index.ts` is what enforces
   * that, not this field.
   */
  readonly kind: "fake" | "live";
}

export * from "./context";
export * from "./repository";
export * from "./object-store";
export * from "./identity";
export * from "./tenancy";
export * from "./rules-as-data";
export * from "./battery";
export * from "./storage";
export * from "./documents";
export * from "./condition";
export * from "./audit";
