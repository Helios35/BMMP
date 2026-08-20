import { PlatformTable, TenantTable } from "./table";
import * as FIXTURES from "./fixtures";
import { resetIdSequence, resetSequenceNumbers } from "./ids";
import type {
  Alert,
  Container,
  Lot,
  StorageClock,
  StorageEvent,
} from "@/types/storage";
import type { AuditEvent } from "@/types/audit";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type { DamageAssessment } from "@/types/condition";
import type {
  ClassificationDecision,
  ContainerLabel,
  DocumentRender,
  Shipment,
  ShippingPaper,
} from "@/types/documents";
import type {
  DateCodeDecode,
  IntakePhoto,
  IntakeSession,
  LabelExtraction,
} from "@/types/intake";
import type {
  FormatClassification,
  Jurisdiction,
  JurisdictionRule,
  RuleVersion,
} from "@/types/rules-as-data";
import type {
  Membership,
  Organization,
  TosAcceptance,
  User,
} from "@/types/tenancy";
import type { Uuid } from "@/types/common";

/**
 * The in-memory database.
 *
 * One table per B1a entity, seeded from `./fixtures`.
 *
 * `organization`, `user` and the three platform rule tables are `PlatformTable`
 * because they carry no `organization_id` column — four of the thirty-two
 * (`ERD.md` §12.1). `organization` is scoped by its own `id`, which the
 * repository narrows itself. `catalog_entry` is a platform table whose rows may
 * carry a tenant id: `null` is a global entry visible to everyone, and a set
 * value is a proposal visible only to that tenant and to P6.
 */

/** An `audit_event` always has an organization in the mock; only platform events do not. */
export type TenantAuditEvent = AuditEvent & { readonly organizationId: Uuid };

export interface MockStore {
  readonly organizations: PlatformTable<Organization>;
  readonly users: PlatformTable<User>;
  readonly memberships: TenantTable<Membership>;
  readonly tosAcceptances: TenantTable<TosAcceptance>;

  readonly jurisdictions: PlatformTable<Jurisdiction>;
  readonly jurisdictionRules: PlatformTable<JurisdictionRule>;
  readonly ruleVersions: PlatformTable<RuleVersion>;
  readonly formatClassifications: TenantTable<FormatClassification>;

  readonly batteryRecords: TenantTable<BatteryRecord>;
  readonly catalogEntries: PlatformTable<CatalogEntry>;
  readonly intakeSessions: TenantTable<IntakeSession>;
  readonly intakePhotos: TenantTable<IntakePhoto>;
  readonly labelExtractions: TenantTable<LabelExtraction>;
  readonly dateCodeDecodes: TenantTable<DateCodeDecode>;

  readonly containers: TenantTable<Container>;
  readonly lots: TenantTable<Lot>;
  readonly storageClocks: TenantTable<StorageClock>;
  readonly storageEvents: TenantTable<StorageEvent>;
  readonly alerts: TenantTable<Alert>;

  readonly classificationDecisions: TenantTable<ClassificationDecision>;
  readonly shipments: TenantTable<Shipment>;
  readonly shippingPapers: TenantTable<ShippingPaper>;
  readonly containerLabels: TenantTable<ContainerLabel>;
  readonly documentRenders: TenantTable<DocumentRender>;

  readonly damageAssessments: TenantTable<DamageAssessment>;
  readonly auditEvents: TenantTable<TenantAuditEvent>;

  /** Object bytes, keyed `bucket:path`. */
  readonly objects: Map<string, { bytes: Uint8Array; contentType: string }>;
}

const seededAuditEvents: readonly TenantAuditEvent[] = FIXTURES.auditEvents.map(
  (event) => ({ ...event, organizationId: event.organizationId as Uuid }),
);

/**
 * Built once, at module load, and **re-seeded in place** by
 * {@link resetMockStore}.
 *
 * The tables are constructed once and never replaced, because every repository
 * closes over its table. Swapping the store object on reset would leave the
 * repositories pointing at the old tables — a reset that silently does nothing
 * is worse than no reset at all.
 */
const store: MockStore = {
  organizations: new PlatformTable(
    "organization",
    "organizations",
    FIXTURES.organizations,
  ),
  users: new PlatformTable("user", "users", FIXTURES.users),
  memberships: new TenantTable(
    "membership",
    "memberships",
    FIXTURES.memberships,
  ),
  tosAcceptances: new TenantTable(
    "tos_acceptance",
    "tosAcceptances",
    FIXTURES.tosAcceptances,
  ),

  jurisdictions: new PlatformTable(
    "jurisdiction",
    "jurisdictions",
    FIXTURES.jurisdictions,
  ),
  jurisdictionRules: new PlatformTable(
    "jurisdiction_rule",
    "jurisdictionRules",
    FIXTURES.jurisdictionRules,
  ),
  ruleVersions: new PlatformTable(
    "rule_version",
    "ruleVersions",
    FIXTURES.ruleVersions,
  ),
  formatClassifications: new TenantTable(
    "format_classification",
    "formatClassifications",
    FIXTURES.formatClassifications,
  ),

  batteryRecords: new TenantTable(
    "battery_record",
    "batteryRecords",
    FIXTURES.batteryRecords,
  ),
  catalogEntries: new PlatformTable(
    "catalog_entry",
    "catalogEntries",
    FIXTURES.catalogEntries,
  ),
  intakeSessions: new TenantTable(
    "intake_session",
    "intakeSessions",
    FIXTURES.intakeSessions,
  ),
  intakePhotos: new TenantTable(
    "intake_photo",
    "intakePhotos",
    FIXTURES.intakePhotos,
  ),
  labelExtractions: new TenantTable(
    "label_extraction",
    "labelExtractions",
    FIXTURES.labelExtractions,
  ),
  dateCodeDecodes: new TenantTable(
    "date_code_decode",
    "dateCodeDecodes",
    FIXTURES.dateCodeDecodes,
  ),

  containers: new TenantTable("container", "containers", FIXTURES.containers),
  lots: new TenantTable("lot", "lots", FIXTURES.lots),
  storageClocks: new TenantTable(
    "storage_clock",
    "storageClocks",
    FIXTURES.storageClocks,
  ),
  storageEvents: new TenantTable(
    "storage_event",
    "storageEvents",
    FIXTURES.storageEvents,
  ),
  alerts: new TenantTable("alert", "alerts", FIXTURES.alerts),

  classificationDecisions: new TenantTable(
    "classification_decision",
    "classificationDecisions",
    FIXTURES.classificationDecisions,
  ),
  shipments: new TenantTable("shipment", "shipments", FIXTURES.shipments),
  shippingPapers: new TenantTable(
    "shipping_paper",
    "shippingPapers",
    FIXTURES.shippingPapers,
  ),
  containerLabels: new TenantTable(
    "container_label",
    "containerLabels",
    FIXTURES.containerLabels,
  ),
  documentRenders: new TenantTable(
    "document_render",
    "documentRenders",
    FIXTURES.documentRenders,
  ),

  damageAssessments: new TenantTable(
    "damage_assessment",
    "damageAssessments",
    FIXTURES.damageAssessments,
  ),
  auditEvents: new TenantTable("audit_event", "auditEvents", seededAuditEvents),

  objects: new Map(),
};

export function mockStore(): MockStore {
  return store;
}

/**
 * Restore the fixtures.
 *
 * Every test that writes calls this first. Without it, a test that appends a
 * record changes what the next test reads, which is how a suite starts passing
 * only in the order it happens to run in.
 */
export function resetMockStore(): MockStore {
  store.organizations.replaceAll(FIXTURES.organizations);
  store.users.replaceAll(FIXTURES.users);
  store.memberships.replaceAll(FIXTURES.memberships);
  store.tosAcceptances.replaceAll(FIXTURES.tosAcceptances);

  store.jurisdictions.replaceAll(FIXTURES.jurisdictions);
  store.jurisdictionRules.replaceAll(FIXTURES.jurisdictionRules);
  store.ruleVersions.replaceAll(FIXTURES.ruleVersions);
  store.formatClassifications.replaceAll(FIXTURES.formatClassifications);

  store.batteryRecords.replaceAll(FIXTURES.batteryRecords);
  store.catalogEntries.replaceAll(FIXTURES.catalogEntries);
  store.intakeSessions.replaceAll(FIXTURES.intakeSessions);
  store.intakePhotos.replaceAll(FIXTURES.intakePhotos);
  store.labelExtractions.replaceAll(FIXTURES.labelExtractions);
  store.dateCodeDecodes.replaceAll(FIXTURES.dateCodeDecodes);

  store.containers.replaceAll(FIXTURES.containers);
  store.lots.replaceAll(FIXTURES.lots);
  store.storageClocks.replaceAll(FIXTURES.storageClocks);
  store.storageEvents.replaceAll(FIXTURES.storageEvents);
  store.alerts.replaceAll(FIXTURES.alerts);

  store.classificationDecisions.replaceAll(FIXTURES.classificationDecisions);
  store.shipments.replaceAll(FIXTURES.shipments);
  store.shippingPapers.replaceAll(FIXTURES.shippingPapers);
  store.containerLabels.replaceAll(FIXTURES.containerLabels);
  store.documentRenders.replaceAll(FIXTURES.documentRenders);

  store.damageAssessments.replaceAll(FIXTURES.damageAssessments);
  store.auditEvents.replaceAll(seededAuditEvents);

  store.objects.clear();

  resetIdSequence();
  resetSequenceNumbers();

  return store;
}
