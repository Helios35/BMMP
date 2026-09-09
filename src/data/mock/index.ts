import type { AdapterDescription, DataAdapter } from "@/data/contracts";
import type { RequestContext } from "@/data/contracts/context";
import type {
  Page,
  PageRequest,
  SortRequest,
} from "@/data/contracts/repository";
import type {
  BatteryRecordQuery,
  BatteryRecordRepository,
  BatteryRecordSortField,
  CatalogCandidateFilter,
  CatalogEntrySortField,
  CatalogQuery,
  CatalogRepository,
  CreateBatteryRecord,
  CreateCatalogEntry,
  CreateDateCodeDecode,
  CreateIntakePhoto,
  CreateIntakeSession,
  CreateLabelExtraction,
  DateCodeDecodeQuery,
  IntakeConfirmation,
  IntakePhotoQuery,
  IntakeRepository,
  IntakeSessionQuery,
  LabelExtractionQuery,
  UpdateBatteryRecord,
  UpdateCatalogEntry,
  UpdateIntakeSession,
} from "@/data/contracts/battery";
import type {
  AcknowledgeAlert,
  AlertQuery,
  AlertRepository,
  ContainerQuery,
  CreateAlert,
  CreateContainer,
  CreateLot,
  CreateStorageClock,
  CreateStorageEvent,
  LotQuery,
  StorageClockQuery,
  StorageEventQuery,
  UpdateContainer,
  UpdateLot,
  UpdateStorageClock,
} from "@/data/contracts/storage";
import type {
  ClassificationDecisionQuery,
  ClassificationDecisionRepository,
  ContainerLabelQuery,
  CreateClassificationDecision,
  CreateContainerLabel,
  CreateDocumentRender,
  CreateShipment,
  CreateShippingPaper,
  DocumentRenderQuery,
  DocumentRenderRepository,
  DocumentVerification,
  OfferShipment,
  ShipmentQuery,
  ShipmentRepository,
  ShippingPaperQuery,
  UpdateShipment,
} from "@/data/contracts/documents";
import type {
  CreateFormatClassification,
  CreateJurisdiction,
  CreateJurisdictionRule,
  CreateRuleVersion,
  FormatClassificationQuery,
  JurisdictionQuery,
  JurisdictionRuleQuery,
  RuleResolutionRequestInput,
  RuleVersionQuery,
  RuleVersionRepository,
  UpdateJurisdiction,
  UpdateJurisdictionRule,
} from "@/data/contracts/rules-as-data";
import type {
  CreateMembership,
  CreateOrganization,
  CreateTosAcceptance,
  CreateUser,
  MembershipQuery,
  OrganizationQuery,
  TosAcceptanceQuery,
  TosAcceptanceRepository,
  UpdateMembership,
  UpdateOrganization,
  UpdateUser,
  UserQuery,
} from "@/data/contracts/tenancy";
import type {
  CreateDamageAssessment,
  DamageAssessmentQuery,
  DamageAssessmentRepository,
} from "@/data/contracts/condition";
import type { PlatformConfigurationRepository } from "@/data/contracts/platform-configuration";
import type {
  AuditEventQuery,
  AuditEventRepository,
  AuditEventSortField,
  CreateAuditEvent,
} from "@/data/contracts/audit";
import type { IdentityRepository } from "@/data/contracts/identity";
import type { ObjectStore } from "@/data/contracts/object-store";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type {
  Alert,
  Container,
  Lot,
  StorageClock,
  StorageEvent,
} from "@/types/storage";
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
import type { Sha256, Uuid } from "@/types/common";
import type {
  RuleResolution,
  RuleVersionCandidate,
} from "@/domain/rules/resolve";
import { resolveRules } from "@/domain/rules/resolve";
import { validateIntakeGateConfiguration } from "@/domain/intake/thresholds";
import { requiredContainerType } from "@/domain/storage/placement";
import { intakeLandingStatus } from "@/domain/intake/landing-status";
import type { BatteryRecordStatus } from "@/domain/taxonomy/battery-record-status";
import {
  HARD_GATED_LABEL_FIELD_CODES,
  LABEL_FIELD_CODE_LABELS,
} from "@/domain/taxonomy/label-field-code";
import { addDecimal } from "@/domain/units";
import {
  ConflictError,
  DataIntegrityError,
  DocumentIntegrityError,
  NotFoundError,
  PermissionError,
  ValidationError,
} from "@/lib/errors";
import { PLATFORM_INTAKE_GATE_CONFIGURATION } from "./fixtures/platform-configuration";
import { assertPolicy } from "./policy";
import { mockStore, type TenantAuditEvent } from "./store";
import {
  platformAppendOnlyRepository,
  platformRepository,
  now,
  tenantAppendOnlyRepository,
  tenantRepository,
} from "./factory";
import { byNewest, eq, matchesSearch } from "./table";
import { formatRecordNumber, nextId, nextSequenceNumber } from "./ids";
import { applyMockRuntimeFromEnv } from "./runtime-from-env";
import { mockIdentity } from "./identity";

export { resetMockStore, mockStore } from "./store";
export { MOCK_DEV_PASSWORD } from "./identity";
export { INVITE_TOKENS } from "./fixtures/invite-tokens";
export {
  configureMockRuntime,
  mockRuntimeConfig,
  resetMockRuntime,
} from "./runtime";
export * as fixtureIds from "./fixtures/ids";

/**
 * Latency and seeded failures, from the environment, once at module load.
 *
 * Here and not in `src/data/index.ts` — that file reads `DATA_ADAPTER` and only
 * `DATA_ADAPTER` (`TECHNICAL_SPEC.md` §5.4, CI check 2). Both switches are off
 * unless the environment asks, so vitest and Playwright are unaffected.
 */
applyMockRuntimeFromEnv();

/**
 * The in-memory implementation. **Fake records only.**
 *
 * It enforces `ctx.organizationId` on every read and write and rejects writes
 * from a role Postgres would reject, using the same role sets as
 * `TECHNICAL_SPEC.md` §9.3 — see `./policy.ts`. Without that, the Playwright
 * suite passes on mock and leaks on Supabase, and the seam's whole claim is
 * false.
 *
 * The fixtures are **deliberately unfriendly**: a scuffed label the extraction
 * reads poorly, a battery with no catalog match, a small mobility-scooter pack
 * beside a vehicle pack, a swollen pack that sets the damaged-or-defective flag,
 * a container past its accumulation period in the hard `overdue` state, and a
 * record mid-review with per-field confidence across all four bands
 * (`PROJECT_SETUP_BMMP.md` §3.2). Friendly fixtures produce screens that fall
 * over on contact with real data.
 */

const store = () => mockStore();

/**
 * A comparator for an explicit, typed sort — or the entity's own order when the
 * caller asked for none.
 *
 * `sortBy` reaches an adapter from a URL query parameter, so the map here is
 * closed over the entity's declared sortable fields: a field that is not
 * sortable is a type error rather than a row indexed by a caller's string.
 *
 * **A named sort with no direction is ascending, and that is not the same thing
 * as the unsorted default** — the default is whatever the entity orders itself
 * by, which for anything carrying a time is newest first.
 */
function orderBy<T, TField extends string>(
  sort: SortRequest<TField>,
  keys: Readonly<Record<TField, (row: T) => string | number | null>>,
  fallback?: (a: T, b: T) => number,
): ((a: T, b: T) => number) | undefined {
  const field = sort.sortBy;
  if (field === undefined) return fallback;
  const key = keys[field];
  const direction = sort.sortDirection === "desc" ? -1 : 1;
  return (a, b) => {
    const left = key(a);
    const right = key(b);
    if (left === right) return 0;
    // A missing value sorts last in **either** direction: a column of blanks at
    // the top of a table reads as a broken query rather than as an ordering.
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * direction;
    }
    return (String(left) < String(right) ? -1 : 1) * direction;
  };
}

// ---------------------------------------------------------------------------
// Tenancy and identity
// ---------------------------------------------------------------------------

const organizations = platformRepository<
  Organization,
  CreateOrganization,
  UpdateOrganization,
  OrganizationQuery
>(store().organizations, {
  matches: (row, query: { slug?: string; search?: string }) =>
    eq(query.slug, row.slug) &&
    matchesSearch(query.search, row.name, row.legalName),
  build: (ctx, input, id) => ({
    ...input,
    id,
    batteryRecordSeq: 0,
    containerSeq: 0,
    lotSeq: 0,
    shipmentSeq: 0,
    // D-32 — **verification is a recorded act, not a field.** Neither shape on
    // the contract carries these, so a create or an edit can never stamp its own
    // verification date or name its own verifier; a new organization reads as
    // unverified, which is exactly the state D-32 defines the behaviour for
    // (Rule 5.6).
    emergencyVerifiedAt: null,
    emergencyVerifiedBy: null,
    createdAt: now(),
    updatedAt: now(),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  }),
});

/**
 * `organization` is scoped by its own `id`, so the generic table cannot narrow
 * it. Reads are narrowed here instead: a member sees their own organization and
 * nothing else.
 */
const scopedOrganizations: typeof organizations = {
  ...organizations,
  async get(ctx, id) {
    if (id !== ctx.organizationId && !ctx.isPlatformAdmin) return null;
    return organizations.get(ctx, id);
  },
  async list(ctx, query) {
    const page = await organizations.list(ctx, query);
    const items = page.items.filter(
      (row) => ctx.isPlatformAdmin || row.id === ctx.organizationId,
    );
    return { ...page, items, total: items.length };
  },
};

const users = platformRepository<User, CreateUser, UpdateUser, UserQuery>(
  store().users,
  {
    matches: (
      row,
      query: { email?: string; isPlatformAdmin?: boolean; search?: string },
    ) =>
      eq(query.email, row.email) &&
      eq(query.isPlatformAdmin, row.isPlatformAdmin) &&
      matchesSearch(query.search, row.fullName, row.email),
    build: (_ctx, input, id) => ({
      ...input,
      id,
      lastSeenAt: null,
      createdAt: now(),
      updatedAt: now(),
    }),
  },
);

const memberships = tenantRepository<
  Membership,
  CreateMembership,
  UpdateMembership,
  MembershipQuery
>(store().memberships, {
  matches: (row, query: MembershipQuery) =>
    eq(query.userId, row.userId ?? undefined) &&
    eq(query.role, row.role) &&
    eq(query.invitedEmail, row.invitedEmail ?? undefined) &&
    // D-35, Rule 1.12 — "how many holders does this organization have left" is
    // one query, which is what makes the last-holder block enforceable rather
    // than advisory.
    eq(query.holdsBindingAuthority, row.holdsBindingAuthority) &&
    (query.isActive === undefined ||
      query.isActive === (row.acceptedAt !== null && row.revokedAt === null)) &&
    matchesSearch(query.search, row.invitedEmail),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    // D-35 — **assigning binding authority is its own recorded act.** A member
    // who can sign on the organization's behalf (Rule 7.3) does not acquire that
    // quietly inside an invitation, so a new membership starts without it and
    // `update` is the only path.
    holdsBindingAuthority: false,
    acceptedAt: null,
    revokedAt: null,
    revokedBy: null,
    createdAt: now(),
    updatedAt: now(),
  }),
});

const tosAcceptanceBase = tenantAppendOnlyRepository<
  TosAcceptance,
  CreateTosAcceptance,
  TosAcceptanceQuery
>(store().tosAcceptances, {
  matches: (
    row,
    query: {
      status?: string;
      documentKey?: string;
      isLive?: boolean;
      search?: string;
    },
  ) =>
    eq(query.status, row.status) &&
    eq(query.documentKey, row.documentKey) &&
    (query.isLive === undefined ||
      query.isLive === (row.status === "in_force" || row.status === "grace")) &&
    matchesSearch(query.search, row.documentKey, row.documentVersion),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    revokedAt: null,
    revokedBy: null,
    revocationReason: null,
    createdAt: now(),
    updatedAt: now(),
  }),
});

const tosAcceptances: TosAcceptanceRepository = {
  ...tosAcceptanceBase,
  async setStatus(ctx, id, input): Promise<TosAcceptance> {
    // P6 can never accept, or move, a tenant's acceptance on its behalf
    // (Rules 1.19, 7.4). This is one of exactly three things platform scope
    // cannot buy, and it is enforced rather than documented.
    if (ctx.isPlatformAdmin && ctx.role === "platform_admin") {
      throw new PermissionError({
        userMessage:
          "A platform administrator can never accept or move an organization's Terms of Service. " +
          "Someone holding the organization's binding authority must do it.",
        correlationId: ctx.correlationId,
        context: { rule: "7.4", tosAcceptanceId: id },
      });
    }
    const existing = await store().tosAcceptances.getOrThrow(ctx, id);
    return store().tosAcceptances.update(ctx, existing.id, {
      status: input.status,
      revokedBy: input.revokedBy ?? existing.revokedBy,
      revokedAt: input.status === "revoked" ? now() : existing.revokedAt,
      revocationReason: input.revocationReason ?? existing.revocationReason,
      updatedAt: now(),
    });
  },
};

// ---------------------------------------------------------------------------
// Rules as data
// ---------------------------------------------------------------------------

const jurisdictionBase = platformRepository<
  Jurisdiction,
  CreateJurisdiction,
  UpdateJurisdiction,
  JurisdictionQuery
>(store().jurisdictions, {
  matches: (
    row,
    query: {
      code?: string;
      level?: string;
      parentJurisdictionId?: Uuid;
      countryCode?: string;
      search?: string;
    },
  ) =>
    eq(query.code, row.code) &&
    eq(query.level, row.level) &&
    eq(query.parentJurisdictionId, row.parentJurisdictionId ?? undefined) &&
    eq(query.countryCode, row.countryCode) &&
    matchesSearch(query.search, row.name, row.code),
  build: (_ctx, input, id) => ({
    ...input,
    id,
    createdAt: now(),
    updatedAt: now(),
  }),
});

const jurisdictions = {
  ...jurisdictionBase,
  /** Most specific first. The chain is walked, never enumerated. */
  async chainFrom(
    ctx: RequestContext,
    jurisdictionId: Uuid,
  ): Promise<readonly Jurisdiction[]> {
    const chain: Jurisdiction[] = [];
    let current = await jurisdictionBase.get(ctx, jurisdictionId);
    // A cycle in the chain would be a data defect; the bound stops it becoming
    // a hang rather than pretending it cannot happen.
    for (let depth = 0; current !== null && depth < 16; depth += 1) {
      chain.push(current);
      current =
        current.parentJurisdictionId === null
          ? null
          : await jurisdictionBase.get(ctx, current.parentJurisdictionId);
    }
    return chain;
  },
};

const jurisdictionRules = platformRepository<
  JurisdictionRule,
  CreateJurisdictionRule,
  UpdateJurisdictionRule,
  JurisdictionRuleQuery
>(store().jurisdictionRules, {
  matches: (
    row,
    query: {
      jurisdictionId?: Uuid;
      ruleKey?: string;
      domain?: string;
      applicationClass?: string;
      isActive?: boolean;
      search?: string;
    },
  ) =>
    eq(query.jurisdictionId, row.jurisdictionId) &&
    eq(query.ruleKey, row.ruleKey) &&
    eq(query.domain, row.domain) &&
    eq(query.isActive, row.isActive) &&
    (query.applicationClass === undefined ||
      row.appliesToApplicationClasses === null ||
      (row.appliesToApplicationClasses as readonly string[]).includes(
        query.applicationClass,
      )) &&
    matchesSearch(query.search, row.title, row.ruleKey),
  build: (ctx, input, id) => ({
    ...input,
    id,
    createdAt: now(),
    updatedAt: now(),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  }),
});

const ruleVersionBase = platformAppendOnlyRepository<
  RuleVersion,
  CreateRuleVersion,
  RuleVersionQuery
>(store().ruleVersions, {
  matches: (
    row,
    query: {
      jurisdictionRuleId?: Uuid;
      status?: string;
      isPublished?: boolean;
      inForceOn?: string;
      search?: string;
    },
  ) =>
    eq(query.jurisdictionRuleId, row.jurisdictionRuleId) &&
    eq(query.status, row.status) &&
    (query.isPublished === undefined ||
      query.isPublished === (row.publishedAt !== null)) &&
    (query.inForceOn === undefined ||
      (query.inForceOn >= row.effectiveOn &&
        (row.expiresOn === null || query.inForceOn < row.expiresOn))) &&
    matchesSearch(query.search, row.versionLabel, row.citation),
  build: (ctx, input, id) => ({
    ...input,
    id,
    publishedAt: null,
    publishedBy: null,
    createdAt: now(),
    createdBy: ctx.userId,
  }),
});

async function ruleCandidates(
  ctx: RequestContext,
  req: RuleResolutionRequestInput,
): Promise<{
  chain: readonly Jurisdiction[];
  candidates: readonly RuleVersionCandidate[];
}> {
  const chain = await jurisdictions.chainFrom(ctx, req.jurisdictionId);
  const chainIds = new Set(chain.map((link) => link.id));
  const rules = store()
    .jurisdictionRules.all()
    .filter(
      (rule) =>
        chainIds.has(rule.jurisdictionId) &&
        req.ruleKeys.includes(rule.ruleKey),
    );
  const byRuleId = new Map(rules.map((rule) => [rule.id, rule]));
  const candidates = store()
    .ruleVersions.all()
    .flatMap((version): RuleVersionCandidate[] => {
      const rule = byRuleId.get(version.jurisdictionRuleId);
      if (rule === undefined) return [];
      return [
        {
          ruleVersionId: version.id,
          jurisdictionRuleId: rule.id,
          jurisdictionId: rule.jurisdictionId,
          ruleKey: rule.ruleKey,
          domain: rule.domain,
          title: rule.title,
          versionLabel: version.versionLabel,
          effectiveOn: version.effectiveOn,
          expiresOn: version.expiresOn,
          citation: version.citation,
          citationUrl: version.citationUrl,
          payload: version.payload,
          payloadSchemaKey: version.payloadSchemaKey,
          appliesToApplicationClasses: rule.appliesToApplicationClasses,
          publishedAt: version.publishedAt,
          isRuleActive: rule.isActive,
        },
      ];
    });
  return { chain, candidates };
}

const ruleVersions: RuleVersionRepository = {
  ...ruleVersionBase,
  async findCandidates(ctx, req) {
    assertPolicy(ctx, "rule_version", "select");
    const { candidates } = await ruleCandidates(ctx, req);
    return candidates;
  },
  async resolve(ctx, req): Promise<RuleResolution> {
    assertPolicy(ctx, "rule_version", "select");
    const { chain, candidates } = await ruleCandidates(ctx, req);
    // The adapter gathers; the domain decides. Identical on both adapters,
    // which is what makes the seam's claim testable (TECHNICAL_SPEC.md §6.2).
    return resolveRules(
      {
        ruleKeys: req.ruleKeys,
        jurisdictionChain: chain.map((link) => ({
          id: link.id,
          code: link.code,
          name: link.name,
          level: link.level,
        })),
        asOf: req.asOf,
        ...(req.applicationClass === undefined
          ? {}
          : { applicationClass: req.applicationClass }),
      },
      candidates,
    );
  },
  async publish(ctx, id): Promise<RuleVersion> {
    if (!ctx.isPlatformAdmin) {
      throw new PermissionError({
        userMessage:
          "Only a platform administrator may publish a rule version.",
        correlationId: ctx.correlationId,
        context: { ruleVersionId: id },
      });
    }
    const existing = await store().ruleVersions.getOrThrow(ctx, id);
    if (existing.publishedAt !== null) {
      // Amending a published rule means publishing a new version with a new
      // effective date. History is never rewritten (Rule 12.22).
      throw new ConflictError({
        userMessage:
          "That rule version is already published. Publish a new version with a new effective date instead.",
        correlationId: ctx.correlationId,
        context: { ruleVersionId: id },
      });
    }
    return store().ruleVersions.update(ctx, id, {
      publishedAt: now(),
      publishedBy: ctx.userId,
      status: "active",
    });
  },
};

const formatClassifications = tenantAppendOnlyRepository<
  FormatClassification,
  CreateFormatClassification,
  FormatClassificationQuery
>(store().formatClassifications, {
  matches: (
    row,
    query: {
      batteryRecordId?: Uuid;
      jurisdictionId?: Uuid;
      ruleVersionId?: Uuid;
      formatCategory?: string;
      isCurrent?: boolean;
      search?: string;
    },
  ) =>
    eq(query.batteryRecordId, row.batteryRecordId) &&
    eq(query.jurisdictionId, row.jurisdictionId) &&
    eq(query.ruleVersionId, row.ruleVersionId) &&
    eq(query.formatCategory, row.formatCategory) &&
    eq(query.isCurrent, row.isCurrent) &&
    matchesSearch(query.search, row.citation),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    createdAt: now(),
  }),
});

// ---------------------------------------------------------------------------
// Battery, catalog and intake
// ---------------------------------------------------------------------------

/**
 * The `/batteries` filters, in one function, because **the list and the count
 * have to agree** — two predicates is how a table comes to say "3 results" over
 * four rows.
 */
function matchesBatteryRecord(
  row: BatteryRecord,
  query: BatteryRecordQuery,
): boolean {
  return (
    eq(query.status, row.status) &&
    eq(query.containerId, row.containerId ?? undefined) &&
    // A storage-clock tier resolves to a **set** of containers, so this is a
    // union with `containerId` rather than a replacement for it.
    (query.containerIds === undefined ||
      (row.containerId !== null &&
        query.containerIds.includes(row.containerId))) &&
    eq(query.catalogEntryId, row.catalogEntryId ?? undefined) &&
    (query.isCatalogMatched === undefined ||
      query.isCatalogMatched === (row.catalogEntryId !== null)) &&
    eq(query.intakeSessionId, row.intakeSessionId ?? undefined) &&
    eq(query.chemistry, row.chemistry ?? undefined) &&
    eq(query.applicationClass, row.applicationClass) &&
    eq(query.assessedCondition, row.assessedCondition ?? undefined) &&
    eq(query.serialNumber, row.serialNumber ?? undefined) &&
    eq(query.isAirTransportProhibited, row.isAirTransportProhibited) &&
    (query.hasDdrFlag === undefined ||
      query.hasDdrFlag === row.ddrFlags.length > 0) &&
    (query.ddrFlag === undefined ||
      (row.ddrFlags as readonly string[]).includes(query.ddrFlag)) &&
    (query.excludeVoided !== true || row.status !== "voided") &&
    // T-22: a draft is visible only inside the intake session that holds it.
    (query.excludeDrafts !== true || row.status !== "draft") &&
    // Half-open on both ends, over `created_at` — the date a record was logged,
    // never a date derived from anything else.
    (query.loggedAfter === undefined || row.createdAt >= query.loggedAfter) &&
    (query.loggedBefore === undefined || row.createdAt <= query.loggedBefore) &&
    matchesSearch(
      query.search,
      row.recordNumber,
      row.manufacturerName,
      row.modelName,
      row.partNumber,
      row.serialNumber,
    )
  );
}

const BATTERY_RECORD_SORT_KEYS = {
  recordNumber: (row: BatteryRecord) => row.recordNumber,
  manufacturerName: (row: BatteryRecord) => row.manufacturerName,
  assessedCondition: (row: BatteryRecord) => row.assessedCondition,
  createdAt: (row: BatteryRecord) => row.createdAt,
} as const satisfies Readonly<
  Record<BatteryRecordSortField, (row: BatteryRecord) => string | null>
>;

const byNewestBatteryRecord = (a: BatteryRecord, b: BatteryRecord): number =>
  byNewest(a.createdAt, b.createdAt);

const batteryRecords = tenantRepository<
  BatteryRecord,
  CreateBatteryRecord,
  UpdateBatteryRecord,
  BatteryRecordQuery
>(store().batteryRecords, {
  compare: byNewestBatteryRecord,
  matches: matchesBatteryRecord,
  build: (ctx, input, id) => {
    const organization = store()
      .organizations.all()
      .find((org) => org.id === ctx.organizationId);
    const seq = nextSequenceNumber(
      ctx.organizationId,
      "battery_record",
      organization?.batteryRecordSeq ?? 0,
    );
    return {
      ...input,
      id,
      organizationId: ctx.organizationId,
      recordNumber: formatRecordNumber("BR", seq),
      // A new record carries no DDR flag and is not air-blocked. Both move only
      // through a confirmed damage assessment (Rules 6.4, 6.5, 6.11).
      ddrFlags: [],
      isAirTransportProhibited: false,
      createdAt: now(),
      updatedAt: now(),
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    };
  },
});

/**
 * `ddrFlags` and `isAirTransportProhibited` are **set by rule evaluation from a
 * confirmed damage assessment, never written by a caller** (Rules 6.4, 6.5), and
 * the air block has **no override path for any role, including P6** (Rule 6.8).
 *
 * The contract's update shape already omits them. This strips them again at the
 * boundary, because a type is the first line and not the last one: in Postgres a
 * trigger is what actually holds, and the mock has to refuse the same write or a
 * screen would discover the refusal for the first time after migration.
 */
const guardedBatteryRecords: BatteryRecordRepository = {
  ...batteryRecords,
  async list(ctx, query) {
    return store().batteryRecords.list(
      ctx,
      query,
      (row) => matchesBatteryRecord(row, query),
      orderBy(query, BATTERY_RECORD_SORT_KEYS, byNewestBatteryRecord),
    );
  },
  async update(ctx, id, input) {
    const permitted = { ...(input as Record<string, unknown>) };
    delete permitted.ddrFlags;
    delete permitted.isAirTransportProhibited;
    return batteryRecords.update(ctx, id, permitted as typeof input);
  },
  /**
   * The one door for the two legal booleans — in Postgres the trigger on a
   * `damage_assessment` insert, here an explicit method that takes a
   * determination the domain produced from a confirmed assessment. A caller
   * cannot hand this a flag without also handing it the person who confirmed
   * the finding (Rules 6.4, 6.5, 6.6).
   */
  async applyConditionOutcome(ctx, id, outcome) {
    if (outcome.conditionConfirmedBy.trim() === "") {
      throw new ValidationError({
        userMessage:
          "The assessed condition must be confirmed by a person. A model may propose it; a model never sets it.",
        correlationId: ctx.correlationId,
        context: { rule: "6.6", batteryRecordId: id },
      });
    }
    return batteryRecords.update(ctx, id, {
      assessedCondition: outcome.assessedCondition,
      ddrFlags: outcome.ddrFlags,
      isAirTransportProhibited: outcome.isAirTransportProhibited,
      conditionRuleVersionId: outcome.conditionRuleVersionId,
      conditionConfirmedBy: outcome.conditionConfirmedBy,
      conditionConfirmedAt: outcome.conditionConfirmedAt,
    } as Partial<BatteryRecord>);
  },
};

function matchesCatalogEntry(row: CatalogEntry, query: CatalogQuery): boolean {
  return (
    eq(query.status, row.status) &&
    eq(query.manufacturerName, row.manufacturerName) &&
    eq(query.applicationClass, row.applicationClass) &&
    eq(query.chemistry, row.chemistry) &&
    // T-04, the physical cell shape. **Not T-06** — `format_category` is a
    // jurisdiction-dependent band and is filterable nowhere in B1a.
    eq(query.cellFormFactor, row.cellFormFactor ?? undefined) &&
    (query.isGlobal === undefined ||
      query.isGlobal === (row.organizationId === null)) &&
    matchesSearch(
      query.search,
      row.manufacturerName,
      row.brandName,
      row.modelName,
      row.partNumber,
    )
  );
}

const CATALOG_SORT_KEYS = {
  manufacturerName: (row: CatalogEntry) => row.manufacturerName,
  modelName: (row: CatalogEntry) => row.modelName,
  partNumber: (row: CatalogEntry) => row.partNumber,
  updatedAt: (row: CatalogEntry) => row.updatedAt,
} as const satisfies Readonly<
  Record<CatalogEntrySortField, (row: CatalogEntry) => string | null>
>;

const catalogBase = platformRepository<
  CatalogEntry,
  CreateCatalogEntry,
  UpdateCatalogEntry,
  CatalogQuery
>(store().catalogEntries, {
  matches: matchesCatalogEntry,
  build: (ctx, input, id) => ({
    ...input,
    id,
    partNumberNormalized: normalizePartNumber(input.partNumber),
    verifiedBy: null,
    verifiedAt: null,
    createdAt: now(),
    updatedAt: now(),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  }),
});

/** Upper-cased with every separator stripped, exactly as the generated column does. */
function normalizePartNumber(partNumber: string | null): string | null {
  if (partNumber === null) return null;
  return partNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * A tenant sees the global catalog plus its own proposals, and never another
 * tenant's — `catalog_entry.organization_id is null or R` (§9.5).
 */
function catalogVisible(ctx: RequestContext, entry: CatalogEntry): boolean {
  return (
    entry.organizationId === null || entry.organizationId === ctx.organizationId
  );
}

const catalogEntries: CatalogRepository = {
  ...catalogBase,
  async get(ctx, id) {
    const entry = await catalogBase.get(ctx, id);
    if (entry === null || !catalogVisible(ctx, entry)) return null;
    return entry;
  },
  async list(ctx, query) {
    const page = await store().catalogEntries.list(
      ctx,
      query,
      (row) => matchesCatalogEntry(row, query),
      orderBy(query, CATALOG_SORT_KEYS),
    );
    const items = page.items.filter((entry) => catalogVisible(ctx, entry));
    return { ...page, items, total: items.length };
  },
  async findCandidates(
    ctx: RequestContext,
    filter: CatalogCandidateFilter,
  ): Promise<readonly CatalogEntry[]> {
    assertPolicy(ctx, "catalog_entry", "select");
    // Retrieval only. Ranking is `src/domain/catalog/match.ts` — a later unit's
    // work — because one pure scorer means both adapters rank identically.
    const normalizedPart = filter.partNumberNormalized ?? null;
    const manufacturer = filter.manufacturerNormalized?.toLowerCase() ?? null;
    return store()
      .catalogEntries.all()
      .filter(
        (entry) =>
          catalogVisible(ctx, entry) &&
          // Only a published entry is available for intake matching (T-07).
          entry.status === "published" &&
          (normalizedPart === null ||
            (entry.partNumberNormalized ?? "").includes(normalizedPart)) &&
          (manufacturer === null ||
            entry.manufacturerName.toLowerCase().includes(manufacturer)),
      )
      .slice(0, filter.limit);
  },
};

const intakeBase = tenantRepository<
  IntakeSession,
  CreateIntakeSession,
  UpdateIntakeSession,
  IntakeSessionQuery
>(store().intakeSessions, {
  compare: (a, b) => byNewest(a.startedAt, b.startedAt),
  matches: (
    row,
    query: {
      status?: string;
      isReviewRequired?: boolean;
      startedBy?: Uuid;
      batteryRecordId?: Uuid;
      correlationId?: string;
      isOpen?: boolean;
      search?: string;
    },
  ) =>
    eq(query.status, row.status) &&
    eq(query.isReviewRequired, row.isReviewRequired) &&
    eq(query.startedBy, row.startedBy) &&
    eq(query.batteryRecordId, row.batteryRecordId ?? undefined) &&
    eq(query.correlationId, row.correlationId) &&
    (query.isOpen === undefined ||
      query.isOpen ===
        (row.status !== "completed" && row.status !== "abandoned")) &&
    matchesSearch(query.search, row.correlationId),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    batteryRecordId: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewOutcome: null,
    completedAt: null,
    createdAt: now(),
    updatedAt: now(),
  }),
});

/**
 * Every table one confirmation can touch, so the commit can snapshot all of
 * them and put every one back if any write fails.
 */
function commitSnapshot(): readonly {
  readonly table: { all(): readonly unknown[]; replaceAll(rows: never): void };
  readonly rows: readonly unknown[];
}[] {
  const s = store();
  const tables = [
    s.batteryRecords,
    s.intakeSessions,
    s.dateCodeDecodes,
    s.damageAssessments,
    s.classificationDecisions,
    s.storageClocks,
    s.storageEvents,
    s.containers,
    s.auditEvents,
  ] as const;
  // `all()` hands back the live array, so the copy is what makes this a
  // snapshot rather than a second pointer at the rows about to change.
  return tables.map((table) => ({
    table: table as unknown as {
      all(): readonly unknown[];
      replaceAll(rows: never): void;
    },
    rows: [...table.all()],
  }));
}

const intakeSessions: IntakeRepository = {
  ...intakeBase,
  /**
   * One transaction. **All or nothing** (`TECHNICAL_SPEC.md` §11.1 step 6).
   *
   * The mock cannot open a database transaction, so it does the next honest
   * thing: it validates every precondition it can see, snapshots every table
   * the commit can touch, performs the writes, and on any failure — a seeded
   * fault, a policy refusal, a bad row — restores every snapshot and rethrows.
   * There is no state in which a battery has a shipping-ready record but no
   * classification decision or no running clock.
   *
   * ## What is refused here, and why here
   *
   * - **The three hard-gated fields without an attributable confirmation**
   *   (Rules 2.15, 2.21). The gate decides which queue; it never decides
   *   whether a person is involved, and "confirmed by the system" is not a
   *   value. Refused at any confidence band, for every role including P6
   *   (Rule 2.17).
   * - **Chemistry that is null, `unknown` or unconfirmed** (Rule 2.34, T-22).
   * - **A damage assessment nobody confirmed** (Rule 6.6), or one that
   *   disagrees with the condition outcome it is meant to have produced.
   * - **Placement into an overdue container** (Rule 4.16) or into a container
   *   of the wrong segregation class (Rule 4.28, T-23). The domain names the
   *   class; this checks the container matches it.
   *
   * The rows themselves arrive decided — the orchestrator ran the pure
   * evaluators — and the audit events arrive with them, appended through the
   * `security definer` door inside the same all-or-nothing operation, so a
   * commit that fails leaves no audit row claiming it happened, and one that
   * succeeds leaves every step under one correlation id (§11.1 step 6.8).
   */
  async commitConfirmation(
    ctx: RequestContext,
    input: IntakeConfirmation,
  ): Promise<BatteryRecord> {
    assertPolicy(ctx, "intake_session", "update");
    assertPolicy(ctx, "battery_record", "update");
    assertPolicy(ctx, "damage_assessment", "insert");
    if (input.classificationDecision !== null) {
      assertPolicy(ctx, "classification_decision", "insert");
    }
    if (input.dateCodeDecode !== null) {
      assertPolicy(ctx, "date_code_decode", "insert");
    }
    if (input.containerId !== null) {
      assertPolicy(ctx, "storage_event", "insert");
      assertPolicy(ctx, "container", "update");
      if (input.storageClock !== null) {
        assertPolicy(ctx, "storage_clock", "insert");
      }
    }

    const session = await store().intakeSessions.getOrThrow(
      ctx,
      input.intakeSessionId,
    );
    if (session.status === "completed" || session.status === "abandoned") {
      throw new ConflictError({
        userMessage:
          "This intake has already been closed. Nothing was changed.",
        correlationId: ctx.correlationId,
        context: { intakeSessionId: session.id, status: session.status },
      });
    }

    const record = await store().batteryRecords.getOrThrow(
      ctx,
      input.batteryRecordId,
    );
    if (
      record.intakeSessionId !== session.id &&
      session.batteryRecordId !== record.id
    ) {
      throw new ValidationError({
        userMessage:
          "That battery record does not belong to this intake. Nothing was changed.",
        correlationId: ctx.correlationId,
        context: { intakeSessionId: session.id, batteryRecordId: record.id },
      });
    }

    // Human confirmation of chemistry, model and condition is required on both
    // the pass and the fail path — the gate decides which queue, not whether a
    // human is involved (Rule 2.15). Confirmation is per field and attributable;
    // "confirmed by the system" is not a value (Rule 2.21).
    const confirmed = new Map(
      input.confirmedFields
        .filter((field) => field.confirmedBy.trim() !== "")
        .map((field) => [field.fieldCode, field]),
    );
    const missing = HARD_GATED_LABEL_FIELD_CODES.filter(
      (field) => !confirmed.has(field),
    );
    if (missing.length > 0) {
      throw new ValidationError({
        userMessage:
          `Confirm ${missing.map((code) => LABEL_FIELD_CODE_LABELS[code]).join(", ")} before this record can be committed. ` +
          "Chemistry, model and condition are always confirmed by a person, at every confidence band.",
        correlationId: ctx.correlationId,
        context: { rule: "2.15", missing },
      });
    }
    const chemistry = input.batteryRecord.chemistry ?? null;
    if (
      chemistry === null ||
      chemistry === "unknown" ||
      (input.batteryRecord.chemistryConfirmedBy ?? null) === null
    ) {
      throw new ValidationError({
        userMessage:
          "Chemistry must be confirmed by a person before this record can be committed.",
        correlationId: ctx.correlationId,
        context: { rule: "2.34", chemistry },
      });
    }
    if (input.damageAssessment.confirmedBy === null) {
      throw new ValidationError({
        userMessage:
          "The assessed condition must be confirmed by a person. A model may propose it; a model never sets it.",
        correlationId: ctx.correlationId,
        context: { rule: "6.6" },
      });
    }
    // The person the record names as its confirmer is the person the
    // assessment row names — one act, two columns (Rule 6.6). A payload that
    // disagrees would land a record whose condition column credits someone
    // the assessment does not.
    if (
      input.conditionOutcome.conditionConfirmedBy.trim() === "" ||
      input.conditionOutcome.conditionConfirmedBy !==
        input.damageAssessment.confirmedBy
    ) {
      throw new DataIntegrityError({
        userMessage: "Something went wrong and nothing was changed. Try again.",
        correlationId: ctx.correlationId,
        context: {
          reason: "condition_confirmer_disagrees_with_assessment",
          rule: "6.6",
        },
      });
    }
    // The assessment row and the outcome it produced are one determination
    // seen from two sides (Rules 6.4, 6.5): the condition, the air prohibition
    // and whether any flag is set must all agree with the row's status.
    if (
      input.damageAssessment.assessedCondition !==
        input.conditionOutcome.assessedCondition ||
      input.damageAssessment.isAirTransportProhibited !==
        input.conditionOutcome.isAirTransportProhibited ||
      input.conditionOutcome.ddrFlags.length > 0 !==
        (input.damageAssessment.status === "assessed_damaged")
    ) {
      throw new DataIntegrityError({
        userMessage: "Something went wrong and nothing was changed. Try again.",
        correlationId: ctx.correlationId,
        context: {
          reason: "damage_assessment_and_condition_outcome_disagree",
          assessment: input.damageAssessment.assessedCondition,
          outcome: input.conditionOutcome.assessedCondition,
        },
      });
    }

    // Placement admission — the container's own two dimensions must match the
    // record's (Rule 4.28), and an overdue container accepts no new items
    // (Rule 4.16). Checked before anything is written.
    let container: Container | null = null;
    let joinedClock: StorageClock | null = null;
    if (input.containerId !== null) {
      container = await store().containers.getOrThrow(ctx, input.containerId);
      if (container.status === "overdue") {
        throw new ValidationError({
          userMessage:
            `Container ${container.containerCode} is past its accumulation period and accepts no new items. ` +
            "Its contents leave by shipment, or by a remediation recorded by a Facility Manager.",
          correlationId: ctx.correlationId,
          field: "containerId",
          context: { rule: "4.16", containerId: container.id },
        });
      }
      if (container.status !== "open") {
        throw new ValidationError({
          userMessage: `Container ${container.containerCode} is not open and cannot receive a battery.`,
          correlationId: ctx.correlationId,
          field: "containerId",
          context: { containerId: container.id, status: container.status },
        });
      }
      const required = requiredContainerType(
        input.classificationDecision?.wasteClassification ?? "undetermined",
        {
          ddrFlags: input.conditionOutcome.ddrFlags,
          assessmentStatus: input.damageAssessment.status,
        },
      );
      if (required === null) {
        throw new ValidationError({
          userMessage:
            "This battery has no classification yet, so it cannot be placed in a container. Classification blocks rather than assumes an answer.",
          correlationId: ctx.correlationId,
          field: "containerId",
          context: { rule: "3.10" },
        });
      }
      if (container.containerType !== required) {
        throw new ValidationError({
          userMessage:
            `Container ${container.containerCode} holds a different segregation class from this battery. ` +
            "A container holds one class, and placement is blocked rather than advised.",
          correlationId: ctx.correlationId,
          field: "containerId",
          context: {
            rule: "4.28",
            containerType: container.containerType,
            required,
          },
        });
      }
      if (input.joinStorageClockId !== null) {
        joinedClock = await store().storageClocks.getOrThrow(
          ctx,
          input.joinStorageClockId,
        );
        if (joinedClock.containerId !== container.id) {
          throw new ValidationError({
            userMessage:
              "That storage clock does not belong to the chosen container. Nothing was changed.",
            correlationId: ctx.correlationId,
            context: {
              storageClockId: joinedClock.id,
              containerId: container.id,
            },
          });
        }
      } else if (input.storageClock === null) {
        throw new ValidationError({
          userMessage:
            "Placing a battery starts or joins a storage clock, and neither was supplied. Nothing was changed.",
          correlationId: ctx.correlationId,
          context: { rule: "4.4" },
        });
      }
    }

    const snapshot = commitSnapshot();
    try {
      let dateCodeDecodeId: Uuid | null = record.dateCodeDecodeId;
      if (input.dateCodeDecode !== null) {
        const decode = await dateCodeDecodes.append(ctx, {
          ...input.dateCodeDecode,
          batteryRecordId: record.id,
          intakeSessionId: session.id,
        });
        dateCodeDecodeId = decode.id;
      }

      const assessment = await damageAssessmentsBase.append(ctx, {
        ...input.damageAssessment,
        batteryRecordId: record.id,
      });

      let decisionId: Uuid | null = null;
      if (input.classificationDecision !== null) {
        const decision = await classificationDecisionsBase.append(ctx, {
          ...input.classificationDecision,
          decisionScope: "battery_record",
          batteryRecordId: record.id,
          containerId: null,
          shipmentId: null,
        });
        decisionId = decision.id;
      }

      let clockId: Uuid | null = joinedClock?.id ?? null;
      if (container !== null) {
        if (input.storageClock !== null && joinedClock === null) {
          const clock = await storageClocks.create(ctx, {
            ...input.storageClock,
            containerId: container.id,
          });
          clockId = clock.id;
        }
        if (input.storageEvent !== null) {
          await storageEvents.append(ctx, {
            ...input.storageEvent,
            storageClockId: clockId,
            containerId: container.id,
            batteryRecordId: record.id,
          });
        }
        const mass = input.batteryRecord.batteryMassKg ?? record.batteryMassKg;
        await containers.update(ctx, container.id, {
          ...(container.accumulationStartedAt === null &&
          input.containerAccumulationStartedAt !== null
            ? {
                accumulationStartedAt: input.containerAccumulationStartedAt,
                accumulationStartSource: "first_placement",
              }
            : {}),
          ...(mass === null
            ? {}
            : {
                currentNetMassKg: addDecimal(
                  container.currentNetMassKg ?? "0",
                  mass,
                ),
              }),
        } as UpdateContainer);
      }

      // The status follows what else is in the payload, never the caller's
      // word for it (T-22) — the same function the builder used to audit the
      // transition, so the trail and the column cannot disagree.
      const status: BatteryRecordStatus = intakeLandingStatus({
        placed: container !== null,
        ddrFlagged: input.conditionOutcome.ddrFlags.length > 0,
        decided: decisionId !== null,
      });

      // Through the unguarded base: the DDR flags and the air prohibition
      // arrive as the domain's determination from the confirmed assessment,
      // which is the one path allowed to move them (Rules 6.4, 6.5).
      const updated = await batteryRecords.update(ctx, record.id, {
        ...input.batteryRecord,
        status,
        intakeSessionId: session.id,
        catalogEntryId: input.catalogEntryId,
        containerId: container?.id ?? null,
        dateCodeDecodeId,
        assessedCondition: input.conditionOutcome.assessedCondition,
        conditionConfirmedBy: input.conditionOutcome.conditionConfirmedBy,
        conditionConfirmedAt: input.conditionOutcome.conditionConfirmedAt,
        conditionRuleVersionId: input.conditionOutcome.conditionRuleVersionId,
        ddrFlags: input.conditionOutcome.ddrFlags,
        isAirTransportProhibited:
          input.conditionOutcome.isAirTransportProhibited,
      } as Partial<BatteryRecord>);

      // TODO(T-43) — the session's own move to `completed` (T-08) has no event
      // type; `intake_session.started` is its only row. Proposed:
      // `intake_session.status_changed`. Raised in the build-notes, not
      // written under a neighbour.
      await store().intakeSessions.update(ctx, session.id, {
        status: "completed",
        currentStep: "complete",
        isReviewRequired: false,
        batteryRecordId: updated.id,
        completedAt: now(),
        reviewedBy: ctx.userId,
        reviewedAt: now(),
        reviewOutcome: "confirmed",
        draft: null,
        updatedAt: now(),
      });

      // Every step under one correlation id, written through the definer door
      // as part of the same operation (Rules 2.4, 12.3; §11.1 step 6.8).
      for (const event of input.auditEvents) {
        await store().auditEvents.insertAsDefiner(
          ctx,
          buildAuditEvent(
            ctx,
            { ...event, correlationId: ctx.correlationId },
            nextId(),
          ),
        );
      }

      // Referenced so a superseding assessment later has an id to point at,
      // and so the row cannot be optimised away by a reader of this block.
      void assessment.id;

      return updated;
    } catch (cause) {
      for (const entry of snapshot) {
        entry.table.replaceAll(entry.rows as never);
      }
      throw cause;
    }
  },
};

const intakePhotos = tenantAppendOnlyRepository<
  IntakePhoto,
  CreateIntakePhoto,
  IntakePhotoQuery
>(store().intakePhotos, {
  compare: (a, b) => byNewest(a.createdAt, b.createdAt),
  matches: (
    row,
    query: {
      intakeSessionId?: Uuid;
      isCrop?: boolean;
      parentIntakePhotoId?: Uuid;
      photoType?: string;
      search?: string;
    },
  ) =>
    eq(query.intakeSessionId, row.intakeSessionId) &&
    eq(query.parentIntakePhotoId, row.parentIntakePhotoId ?? undefined) &&
    eq(query.photoType, row.photoType) &&
    (query.isCrop === undefined ||
      query.isCrop === (row.parentIntakePhotoId !== null)) &&
    matchesSearch(query.search, row.photoType),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    createdAt: now(),
  }),
});

const labelExtractions = tenantAppendOnlyRepository<
  LabelExtraction,
  CreateLabelExtraction,
  LabelExtractionQuery
>(store().labelExtractions, {
  compare: (a, b) => byNewest(a.createdAt, b.createdAt),
  matches: (
    row,
    query: {
      intakeSessionId?: Uuid;
      intakePhotoId?: Uuid;
      extractionRunId?: Uuid;
      fieldCode?: string;
      confidenceBand?: string;
      provider?: string;
      search?: string;
    },
  ) =>
    eq(query.intakeSessionId, row.intakeSessionId) &&
    eq(query.intakePhotoId, row.intakePhotoId) &&
    eq(query.extractionRunId, row.extractionRunId) &&
    eq(query.fieldCode, row.fieldCode) &&
    eq(query.confidenceBand, row.confidenceBand) &&
    eq(query.provider, row.provider) &&
    matchesSearch(query.search, row.fieldValue, row.rawText),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    createdAt: now(),
  }),
});

const dateCodeDecodes = tenantAppendOnlyRepository<
  DateCodeDecode,
  CreateDateCodeDecode,
  DateCodeDecodeQuery
>(store().dateCodeDecodes, {
  compare: (a, b) => byNewest(a.createdAt, b.createdAt),
  matches: (
    row,
    query: {
      batteryRecordId?: Uuid;
      intakeSessionId?: Uuid;
      formatKey?: string;
      search?: string;
    },
  ) =>
    eq(query.batteryRecordId, row.batteryRecordId ?? undefined) &&
    eq(query.intakeSessionId, row.intakeSessionId ?? undefined) &&
    eq(query.formatKey, row.formatKey) &&
    matchesSearch(query.search, row.rawCode),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    createdAt: now(),
  }),
});

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const containers = tenantRepository<
  Container,
  CreateContainer,
  UpdateContainer,
  ContainerQuery
>(store().containers, {
  compare: (a, b) => byNewest(a.createdAt, b.createdAt),
  matches: (
    row,
    query: {
      status?: string;
      containerType?: string;
      lotId?: Uuid;
      shipmentId?: Uuid;
      isOverdue?: boolean;
      isAlerting?: boolean;
      search?: string;
    },
  ) =>
    eq(query.status, row.status) &&
    eq(query.containerType, row.containerType) &&
    eq(query.lotId, row.lotId ?? undefined) &&
    eq(query.shipmentId, row.shipmentId ?? undefined) &&
    (query.isOverdue === undefined ||
      query.isOverdue === (row.status === "overdue")) &&
    (query.isAlerting === undefined ||
      query.isAlerting ===
        store()
          .alerts.all()
          .some(
            (alert) =>
              alert.containerId === row.id && alert.resolvedAt === null,
          )) &&
    matchesSearch(query.search, row.containerCode, row.storageLocation),
  build: (ctx, input, id) => {
    const organization = store()
      .organizations.all()
      .find((org) => org.id === ctx.organizationId);
    const seq = nextSequenceNumber(
      ctx.organizationId,
      "container",
      organization?.containerSeq ?? 0,
    );
    return {
      ...input,
      id,
      organizationId: ctx.organizationId,
      containerCode: formatRecordNumber("C", seq),
      // Set by the first placement, never by a caller (Rule 4.4). There is no
      // re-date control on any screen for any role, because a re-date
      // affordance is a way to restart a legal clock.
      accumulationStartedAt: null,
      accumulationStartSource: null,
      currentNetMassKg: null,
      currentContainerLabelId: null,
      createdAt: now(),
      updatedAt: now(),
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    } satisfies Container;
  },
});

const lots = tenantRepository<Lot, CreateLot, UpdateLot, LotQuery>(
  store().lots,
  {
    compare: (a, b) => byNewest(a.createdAt, b.createdAt),
    matches: (row, query: { status?: string; search?: string }) =>
      eq(query.status, row.status) &&
      matchesSearch(query.search, row.lotCode, row.description),
    build: (ctx, input, id) => {
      const organization = store()
        .organizations.all()
        .find((org) => org.id === ctx.organizationId);
      const seq = nextSequenceNumber(
        ctx.organizationId,
        "lot",
        organization?.lotSeq ?? 0,
      );
      return {
        ...input,
        id,
        organizationId: ctx.organizationId,
        lotCode: formatRecordNumber("L", seq),
        chemistryMix: null,
        totalMassKg: null,
        totalEnergyWh: null,
        createdAt: now(),
        updatedAt: now(),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      };
    },
  },
);

const storageClocks = tenantRepository<
  StorageClock,
  CreateStorageClock,
  UpdateStorageClock,
  StorageClockQuery
>(store().storageClocks, {
  matches: (
    row,
    query: {
      status?: string;
      alertBand?: string;
      containerId?: Uuid;
      batteryRecordId?: Uuid;
      isRunning?: boolean;
      nextAlertDueBefore?: string;
      search?: string;
    },
  ) =>
    eq(query.status, row.status) &&
    eq(query.alertBand, row.alertBand) &&
    eq(query.containerId, row.containerId ?? undefined) &&
    eq(query.batteryRecordId, row.batteryRecordId ?? undefined) &&
    (query.isRunning === undefined ||
      query.isRunning === (row.stoppedAt === null)) &&
    (query.nextAlertDueBefore === undefined ||
      (row.nextAlertAt !== null &&
        row.nextAlertAt <= query.nextAlertDueBefore)) &&
    matchesSearch(query.search, row.clockStartBasis),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    stoppedAt: null,
    stopReason: null,
    createdAt: now(),
    updatedAt: now(),
  }),
});

const storageEvents = tenantAppendOnlyRepository<
  StorageEvent,
  CreateStorageEvent,
  StorageEventQuery
>(store().storageEvents, {
  compare: (a, b) => byNewest(a.occurredAt, b.occurredAt),
  matches: (
    row,
    query: {
      activityType?: string;
      containerId?: Uuid;
      batteryRecordId?: Uuid;
      lotId?: Uuid;
      storageClockId?: Uuid;
      occurredAfter?: string;
      occurredBefore?: string;
      search?: string;
    },
  ) =>
    eq(query.activityType, row.activityType) &&
    eq(query.containerId, row.containerId ?? undefined) &&
    eq(query.batteryRecordId, row.batteryRecordId ?? undefined) &&
    eq(query.lotId, row.lotId ?? undefined) &&
    eq(query.storageClockId, row.storageClockId ?? undefined) &&
    (query.occurredAfter === undefined ||
      row.occurredAt >= query.occurredAfter) &&
    (query.occurredBefore === undefined ||
      row.occurredAt <= query.occurredBefore) &&
    matchesSearch(query.search, row.activityType),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    createdAt: now(),
  }),
});

const alertBase = tenantRepository<
  Alert,
  CreateAlert,
  AcknowledgeAlert,
  AlertQuery
>(store().alerts, {
  compare: (a, b) => byNewest(a.raisedAt, b.raisedAt),
  matches: (
    row,
    query: {
      alertType?: string;
      containerId?: Uuid;
      batteryRecordId?: Uuid;
      storageClockId?: Uuid;
      shipmentId?: Uuid;
      intakeSessionId?: Uuid;
      isUnacknowledged?: boolean;
      isOpen?: boolean;
      audienceRole?: string;
      search?: string;
    },
  ) =>
    eq(query.alertType, row.alertType) &&
    eq(query.containerId, row.containerId ?? undefined) &&
    eq(query.batteryRecordId, row.batteryRecordId ?? undefined) &&
    eq(query.storageClockId, row.storageClockId ?? undefined) &&
    eq(query.shipmentId, row.shipmentId ?? undefined) &&
    eq(query.intakeSessionId, row.intakeSessionId ?? undefined) &&
    (query.isUnacknowledged === undefined ||
      query.isUnacknowledged === (row.acknowledgedAt === null)) &&
    (query.isOpen === undefined ||
      query.isOpen === (row.resolvedAt === null)) &&
    (query.audienceRole === undefined ||
      row.audienceRoles.includes(query.audienceRole)) &&
    matchesSearch(query.search, row.title, row.body),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolvedAt: null,
    resolutionReason: null,
    createdAt: now(),
    updatedAt: now(),
  }),
});

const alerts: AlertRepository = {
  ...alertBase,
  /**
   * **Acknowledgement and resolution only.** `alertType`, `severity`,
   * `triggerSnapshot`, `raisedAt` and `governingRuleVersionId` are frozen by
   * trigger after insert (`ERD.md` §6.5), and an acknowledgement is itself an
   * audited act (Rule 12.1).
   */
  async update(ctx, id, input) {
    const permitted: AcknowledgeAlert = {
      ...(input.acknowledgedAt === undefined
        ? {}
        : { acknowledgedAt: input.acknowledgedAt }),
      ...(input.acknowledgedBy === undefined
        ? {}
        : { acknowledgedBy: input.acknowledgedBy }),
      ...(input.resolvedAt === undefined
        ? {}
        : { resolvedAt: input.resolvedAt }),
      ...(input.resolutionReason === undefined
        ? {}
        : { resolutionReason: input.resolutionReason }),
    };
    return alertBase.update(ctx, id, permitted);
  },
  /**
   * Idempotent on `dedupeKey`. A re-run never fires a duplicate — which is what
   * makes a double cron run harmless rather than merely unlikely.
   */
  async raiseIfAbsent(ctx: RequestContext, input: CreateAlert): Promise<Alert> {
    const existing = store()
      .alerts.all()
      .find(
        (alert) =>
          alert.organizationId === ctx.organizationId &&
          alert.dedupeKey === input.dedupeKey &&
          alert.resolvedAt === null,
      );
    if (existing !== undefined) return existing;
    return alertBase.create(ctx, input);
  },
};

// ---------------------------------------------------------------------------
// Classification and documents
// ---------------------------------------------------------------------------

const classificationDecisionsBase = tenantAppendOnlyRepository<
  ClassificationDecision,
  CreateClassificationDecision,
  ClassificationDecisionQuery
>(store().classificationDecisions, {
  compare: (a, b) => byNewest(a.decidedAt, b.decidedAt),
  matches: (
    row,
    query: {
      batteryRecordId?: Uuid;
      containerId?: Uuid;
      shipmentId?: Uuid;
      status?: string;
      wasteClassification?: string;
      governingRuleVersionId?: Uuid;
      isOverride?: boolean;
      hasOpenRuleGap?: boolean;
      search?: string;
    },
  ) =>
    eq(query.batteryRecordId, row.batteryRecordId ?? undefined) &&
    eq(query.containerId, row.containerId ?? undefined) &&
    eq(query.shipmentId, row.shipmentId ?? undefined) &&
    eq(query.status, row.status) &&
    eq(query.wasteClassification, row.wasteClassification) &&
    eq(query.governingRuleVersionId, row.governingRuleVersionId) &&
    eq(query.isOverride, row.isOverride) &&
    (query.hasOpenRuleGap === undefined ||
      query.hasOpenRuleGap ===
        (row.isLessRegulatedThanDerived &&
          row.ruleGapClosedByRuleVersionId === null)) &&
    matchesSearch(query.search, row.reasoning),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    createdAt: now(),
  }),
});

const classificationDecisions: ClassificationDecisionRepository = {
  ...classificationDecisionsBase,
  /**
   * The trigger's one update (Rule 3.14, T-45): the old row's status moves to
   * `superseded` when a re-classification lands, and nothing else on it moves.
   * Through the definer door, because §9.5 gives this table no UPDATE policy
   * for any tenant role — nobody issues this statement but the trigger.
   */
  async markSuperseded(ctx, id, supersededByClassificationDecisionId) {
    await store().classificationDecisions.getOrThrow(
      ctx,
      supersededByClassificationDecisionId,
    );
    return store().classificationDecisions.updateAsDefiner(ctx, id, {
      status: "superseded",
    });
  },
};

const shipmentBase = tenantRepository<
  Shipment,
  CreateShipment,
  UpdateShipment,
  ShipmentQuery
>(store().shipments, {
  compare: (a, b) => byNewest(a.createdAt, b.createdAt),
  matches: (
    row,
    query: {
      status?: string;
      transportMode?: string;
      shippedAfter?: string;
      shippedBefore?: string;
      search?: string;
    },
  ) =>
    eq(query.status, row.status) &&
    eq(query.transportMode, row.transportMode) &&
    (query.shippedAfter === undefined ||
      (row.shippedAt !== null && row.shippedAt >= query.shippedAfter)) &&
    (query.shippedBefore === undefined ||
      (row.shippedAt !== null && row.shippedAt <= query.shippedBefore)) &&
    matchesSearch(
      query.search,
      row.shipmentNumber,
      row.destinationFacilityName,
    ),
  build: (ctx, input, id) => {
    const organization = store()
      .organizations.all()
      .find((org) => org.id === ctx.organizationId);
    const seq = nextSequenceNumber(
      ctx.organizationId,
      "shipment",
      organization?.shipmentSeq ?? 0,
    );
    return {
      ...input,
      id,
      organizationId: ctx.organizationId,
      shipmentNumber: formatRecordNumber("SH", seq),
      airTransportBlockedReason: null,
      totalMassKg: null,
      totalEnergyWh: null,
      offeredAt: null,
      shippedAt: null,
      receivedAt: null,
      receivedConfirmationRef: null,
      retentionExpiresOn: null,
      retentionRuleVersionId: null,
      createdAt: now(),
      updatedAt: now(),
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    } satisfies Shipment;
  },
});

const shipments: ShipmentRepository = {
  ...shipmentBase,
  async offer(
    ctx: RequestContext,
    shipmentId: Uuid,
    input: OfferShipment,
  ): Promise<Shipment> {
    const shipment = await store().shipments.getOrThrow(ctx, shipmentId);

    // A shipment cannot be offered without a shipping paper whose render
    // produced bytes. In Postgres a trigger refuses this transition; here the
    // same refusal is in code, so a screen built against the mock meets it at
    // the same moment (TECHNICAL_SPEC.md §10.4, Rules 5.3, 5.4).
    const paper = store()
      .shippingPapers.all()
      .find(
        (candidate) =>
          candidate.shipmentId === shipmentId &&
          candidate.organizationId === ctx.organizationId,
      );
    const render =
      paper === undefined
        ? undefined
        : store()
            .documentRenders.all()
            .find((candidate) => candidate.id === paper.documentRenderId);
    if (
      paper === undefined ||
      render === undefined ||
      render.contentHash === ""
    ) {
      throw new ValidationError({
        userMessage:
          "This shipment has no issued shipping paper. Generate the shipping paper before offering the shipment.",
        correlationId: ctx.correlationId,
        context: { rule: "5.3", shipmentId },
      });
    }

    // Air is unavailable for any record carrying a DDR flag, and Rule 6.8
    // admits no override for any role — so there is no bypass parameter here.
    if (shipment.transportMode === "air") {
      const containerIds = store()
        .containers.all()
        .filter((container) => container.shipmentId === shipmentId)
        .map((container) => container.id);
      const blocked = store()
        .batteryRecords.all()
        .filter(
          (record) =>
            record.containerId !== null &&
            containerIds.includes(record.containerId) &&
            record.isAirTransportProhibited,
        );
      if (blocked.length > 0) {
        throw new ValidationError({
          userMessage:
            "Air transport is not available for this shipment: it carries a battery assessed as damaged, defective or recalled. " +
            "Choose a ground, rail or vessel mode, or remove the affected records.",
          correlationId: ctx.correlationId,
          context: {
            rule: "6.7",
            blockedRecordIds: blocked.map((record) => record.id),
          },
        });
      }
    }

    return store().shipments.update(ctx, shipmentId, {
      status: "documents_issued",
      offeredAt: input.offeredAt,
      updatedAt: now(),
      updatedBy: ctx.userId,
    });
  },
};

const shippingPapers = tenantAppendOnlyRepository<
  ShippingPaper,
  CreateShippingPaper,
  ShippingPaperQuery
>(store().shippingPapers, {
  compare: (a, b) => byNewest(a.generatedAt, b.generatedAt),
  matches: (
    row,
    query: { shipmentId?: Uuid; documentRenderId?: Uuid; search?: string },
  ) =>
    eq(query.shipmentId, row.shipmentId) &&
    eq(query.documentRenderId, row.documentRenderId) &&
    matchesSearch(query.search, row.basicDescription, row.properShippingName),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    createdAt: now(),
  }),
});

const containerLabels = tenantAppendOnlyRepository<
  ContainerLabel,
  CreateContainerLabel,
  ContainerLabelQuery
>(store().containerLabels, {
  compare: (a, b) => byNewest(a.generatedAt, b.generatedAt),
  matches: (
    row,
    query: { containerId?: Uuid; documentRenderId?: Uuid; search?: string },
  ) =>
    eq(query.containerId, row.containerId) &&
    eq(query.documentRenderId, row.documentRenderId) &&
    matchesSearch(query.search, row.labelText, row.contentsDescription),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    createdAt: now(),
  }),
});

const documentRenderBase = tenantAppendOnlyRepository<
  DocumentRender,
  CreateDocumentRender,
  DocumentRenderQuery
>(store().documentRenders, {
  compare: (a, b) => byNewest(a.renderedAt, b.renderedAt),
  matches: (
    row,
    query: {
      documentType?: string;
      status?: string;
      shipmentId?: Uuid;
      containerId?: Uuid;
      batteryRecordId?: Uuid;
      verificationCode?: string;
      contentHash?: Sha256;
      search?: string;
    },
  ) =>
    eq(query.documentType, row.documentType) &&
    eq(query.status, row.status) &&
    eq(query.shipmentId, row.shipmentId ?? undefined) &&
    eq(query.containerId, row.containerId ?? undefined) &&
    eq(query.batteryRecordId, row.batteryRecordId ?? undefined) &&
    eq(query.verificationCode, row.verificationCode) &&
    eq(query.contentHash, row.contentHash) &&
    matchesSearch(query.search, row.templateKey, row.verificationCode),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    // Printed on the page. The content hash cannot be — it would be circular.
    verificationCode: input.inputSnapshotHash.slice(0, 12),
    supersededAt: null,
    createdAt: now(),
  }),
});

const documentRenders: DocumentRenderRepository = {
  ...documentRenderBase,
  async readBytes(ctx: RequestContext, id: Uuid) {
    const render = await store().documentRenders.getOrThrow(ctx, id);
    const stored = store().objects.get(`documents:${render.storageObjectPath}`);
    if (stored === undefined) {
      // A row pointing at bytes that are not there should be impossible: a
      // storage failure rolls the whole render back (TECHNICAL_SPEC.md §10.4).
      throw new NotFoundError({
        userMessage: "That document could not be retrieved.",
        correlationId: ctx.correlationId,
        context: { documentRenderId: id },
      });
    }
    return {
      bytes: stored.bytes,
      contentHash: render.contentHash,
      byteSize: render.byteSize,
    };
  },
  async verify(ctx: RequestContext, id: Uuid): Promise<DocumentVerification> {
    const render = await store().documentRenders.getOrThrow(ctx, id);
    const stored = store().objects.get(`documents:${render.storageObjectPath}`);
    // A fixture render has no bytes behind it, which is a legitimate "cannot
    // verify" rather than a failed verification — an unverifiable document is
    // never served as if it had passed.
    if (stored === undefined) {
      throw new DocumentIntegrityError({
        userMessage:
          "This document failed its integrity check and will not be served.",
        correlationId: ctx.correlationId,
        context: { documentRenderId: id, reason: "bytes_absent" },
      });
    }
    return {
      documentRenderId: render.id,
      bytesMatch: true,
      inputSnapshotMatches: true,
      verificationCode: render.verificationCode,
      verifiedAt: now(),
    };
  },
  async markSuperseded(
    ctx: RequestContext,
    id: Uuid,
    supersededByDocumentRenderId: Uuid,
  ): Promise<DocumentRender> {
    await store().documentRenders.getOrThrow(ctx, supersededByDocumentRenderId);
    // The only permitted update on an immutable row, applied when a replacement
    // is issued. The superseded render is retained in full and stays readable.
    return store().documentRenders.update(ctx, id, {
      status: "superseded",
      supersededAt: now(),
    });
  },
};

// ---------------------------------------------------------------------------
// Condition and audit
// ---------------------------------------------------------------------------

const damageAssessmentsBase = tenantAppendOnlyRepository<
  DamageAssessment,
  CreateDamageAssessment,
  DamageAssessmentQuery
>(store().damageAssessments, {
  compare: (a, b) => byNewest(a.assessedAt, b.assessedAt),
  matches: (
    row,
    query: {
      batteryRecordId?: Uuid;
      status?: string;
      findingType?: string;
      isAirTransportProhibited?: boolean;
      isCurrent?: boolean;
      search?: string;
    },
  ) =>
    eq(query.batteryRecordId, row.batteryRecordId) &&
    eq(query.status, row.status) &&
    eq(query.isAirTransportProhibited, row.isAirTransportProhibited) &&
    (query.findingType === undefined ||
      (row.findingTypes as readonly string[]).includes(query.findingType)) &&
    (query.isCurrent === undefined ||
      query.isCurrent === (row.status !== "superseded")) &&
    matchesSearch(query.search, row.assessedCondition),
  build: (ctx, input, id) => ({
    ...input,
    id,
    organizationId: ctx.organizationId,
    createdAt: now(),
  }),
});

const damageAssessments: DamageAssessmentRepository = {
  ...damageAssessmentsBase,
  /**
   * The trigger's one update (Rule 6.12, T-46): the superseded assessment's
   * status moves and every other column stays — author, timestamp, findings
   * and evidence remain readable beside the current one, permanently. Through
   * the definer door, because no tenant role holds UPDATE on this table.
   */
  async markSuperseded(ctx, id, supersededByDamageAssessmentId) {
    await store().damageAssessments.getOrThrow(
      ctx,
      supersededByDamageAssessmentId,
    );
    return store().damageAssessments.updateAsDefiner(ctx, id, {
      status: "superseded",
    });
  },
};

/**
 * Platform configuration — D-22, D-40.
 *
 * Reads the mock's own row and validates it on every read, exactly as the
 * Supabase adapter will validate a platform table row: an invalid set is a
 * `DataIntegrityError`, never a default and never a partial. **There is no
 * tenant override in B1a** — the platform floor is what every organisation
 * reads, and raising it is P6's platform table to add when a tenant asks.
 */
const platformConfiguration: PlatformConfigurationRepository = {
  async readIntakeGateConfiguration(ctx) {
    const validation = validateIntakeGateConfiguration(
      PLATFORM_INTAKE_GATE_CONFIGURATION,
    );
    if (!validation.ok) {
      throw new DataIntegrityError({
        userMessage:
          "The label-reading configuration could not be loaded. Nothing was changed — ask an Admin.",
        correlationId: ctx.correlationId,
        context: { issues: validation.issues },
      });
    }
    return validation.configuration;
  },
};

function matchesAuditEvent(
  row: TenantAuditEvent,
  query: AuditEventQuery,
): boolean {
  return (
    eq(query.entityTable, row.entityTable) &&
    eq(query.entityId, row.entityId) &&
    eq(query.actorUserId, row.actorUserId ?? undefined) &&
    eq(query.eventType, row.eventType) &&
    // T-60. **A support grant that is invisible in the log is not a recorded
    // support grant** (Rules 1.18, 12.7) — this is how an auditor asks the log
    // what the platform did inside their tenant.
    eq(query.actorType, row.actorType) &&
    eq(query.correlationId, row.correlationId ?? undefined) &&
    eq(query.governingRuleVersionId, row.governingRuleVersionId ?? undefined) &&
    (query.occurredAfter === undefined ||
      row.occurredAt >= query.occurredAfter) &&
    (query.occurredBefore === undefined ||
      row.occurredAt <= query.occurredBefore) &&
    matchesSearch(query.search, row.eventType, row.reason)
  );
}

const AUDIT_EVENT_SORT_KEYS = {
  occurredAt: (row: TenantAuditEvent) => row.occurredAt,
  sequenceNo: (row: TenantAuditEvent) => row.sequenceNo,
} as const satisfies Readonly<
  Record<AuditEventSortField, (row: TenantAuditEvent) => string | number>
>;

const byNewestAuditEvent = (a: TenantAuditEvent, b: TenantAuditEvent): number =>
  byNewest(a.occurredAt, b.occurredAt);

/**
 * The row, built once, so the policy-checked door and the `security definer`
 * door cannot allocate a sequence number or a tenant differently.
 */
const buildAuditEvent = (
  ctx: RequestContext,
  input: CreateAuditEvent,
  id: Uuid,
): TenantAuditEvent => ({
  ...input,
  id,
  sequenceNo: store().auditEvents.all().length + 1,
  organizationId: ctx.organizationId,
  createdAt: now(),
});

const auditEventsBase = tenantAppendOnlyRepository<
  TenantAuditEvent,
  CreateAuditEvent,
  AuditEventQuery
>(store().auditEvents, {
  compare: byNewestAuditEvent,
  matches: matchesAuditEvent,
  build: buildAuditEvent,
});

const auditEvents: AuditEventRepository = {
  ...auditEventsBase,
  async list(ctx, query) {
    return store().auditEvents.list(
      ctx,
      query,
      (row) => matchesAuditEvent(row, query),
      orderBy(query, AUDIT_EVENT_SORT_KEYS, byNewestAuditEvent),
    );
  },
  async write(ctx, input) {
    // The `security definer` door — `TECHNICAL_SPEC.md` §10.5,
    // `app.write_audit_event()`. Same builder, same sequence allocation, same
    // tenant scope from `ctx`; **only the policy check on the insert is
    // bypassed**, and only because the caller who has to be recorded is the
    // caller who was just refused (Rules 12.3, 12.6). `append` stays
    // policy-checked, so an ordinary caller still cannot forge a row.
    return store().auditEvents.insertAsDefiner(
      ctx,
      buildAuditEvent(ctx, input, nextId()),
    );
  },
};

// ---------------------------------------------------------------------------
// Object store
// ---------------------------------------------------------------------------

const objects: ObjectStore = {
  async put(ctx, req) {
    if (!req.path.startsWith(`org/${ctx.organizationId}/`)) {
      throw new ValidationError({
        userMessage: "That storage path is not available.",
        correlationId: ctx.correlationId,
        context: { path: req.path },
      });
    }
    const key = `${req.bucket}:${req.path}`;
    if (store().objects.has(key)) {
      // Overwrite is disabled. A correction is a new object at a new path,
      // exactly as a correction to an append-only row is a new row.
      throw new ConflictError({
        userMessage: "That object already exists and cannot be overwritten.",
        correlationId: ctx.correlationId,
        context: { path: req.path },
      });
    }
    store().objects.set(key, {
      bytes: req.bytes,
      contentType: req.contentType,
    });
    return {
      bucket: req.bucket,
      path: req.path,
      // A real hash is `src/lib`'s job at the point bytes are produced; the mock
      // records the size and a placeholder digest rather than pretending to hash.
      contentHash: `mock-${req.bytes.byteLength.toString(16)}`,
      byteSize: req.bytes.byteLength,
      contentType: req.contentType,
    };
  },
  async get(ctx, req) {
    const stored = store().objects.get(`${req.bucket}:${req.path}`);
    if (
      stored === undefined ||
      !req.path.startsWith(`org/${ctx.organizationId}/`)
    ) {
      throw new NotFoundError({
        userMessage: "That file could not be retrieved.",
        correlationId: ctx.correlationId,
        context: { path: req.path },
      });
    }
    return stored.bytes;
  },
  async signedUrl(ctx, req) {
    if (!req.path.startsWith(`org/${ctx.organizationId}/`)) {
      throw new NotFoundError({
        userMessage: "That file could not be retrieved.",
        correlationId: ctx.correlationId,
        context: { path: req.path },
      });
    }
    // Never logged, in either adapter.
    return `mock://${req.bucket}/${req.path}?ttl=${req.ttlSeconds}`;
  },
};

// ---------------------------------------------------------------------------

const describe = (): AdapterDescription => ({ name: "mock", kind: "fake" });

export const mockAdapter: DataAdapter = {
  describe,

  identity: mockIdentity satisfies IdentityRepository,
  organizations: scopedOrganizations,
  users,
  memberships,
  tosAcceptances,

  platformConfiguration,

  jurisdictions,
  jurisdictionRules,
  ruleVersions,
  formatClassifications,

  batteryRecords: guardedBatteryRecords,
  catalogEntries,
  intakeSessions,
  intakePhotos,
  labelExtractions,
  dateCodeDecodes,

  containers,
  lots,
  storageClocks,
  storageEvents,
  alerts,

  classificationDecisions,
  shipments,
  shippingPapers,
  containerLabels,
  documentRenders,

  damageAssessments,
  auditEvents,

  objects,
};

/** Re-exported for tests: `Page` and `PageRequest` are the shapes every list returns. */
export type { Page, PageRequest };
