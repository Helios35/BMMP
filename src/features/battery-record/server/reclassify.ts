import { data } from "@/data";
import type {
  CreateClassificationDecision,
  RequestContext,
} from "@/data/contracts";
import {
  classifyWasteStream,
  WASTE_STREAM_RULE_KEY,
  type ClassificationMissingInput,
  type ClassificationResult,
  type UnresolvedClassificationRule,
} from "@/domain/classification/waste-stream";
import type { ResolvedRule } from "@/domain/rules/resolve";
import { civilDateInZone } from "@/domain/storage/clock-display";
import type { BatteryRecordStatus } from "@/domain/taxonomy/battery-record-status";
import { organizationSites } from "@/features/settings/sites";
import { ValidationError } from "@/lib/errors";
import type { BatteryRecord } from "@/types/battery-record";
import type { IsoDate, IsoTimestamp, TimeZone, Uuid } from "@/types/common";
import type { ClassificationDecision } from "@/types/documents";
import { systemEvent, writeAuditEvent } from "./audit";

/**
 * Re-classification of one record — Rules 3.14, 3.15, 6.20; T-45.
 *
 * Two edits on `/batteries/[id]` change an input the waste-stream decision was
 * made from: a corrected identification (chemistry from a re-matched catalog
 * entry) and a changed assessed condition (the DDR flags). Both call this one
 * module, because two re-classification paths written in two places is how one
 * of them ends up superseding the wrong decision.
 *
 * **Nothing is edited.** The active decision is left with its inputs, its rule
 * version, its citation and its reasoning intact; a new decision is appended
 * carrying `supersedesClassificationDecisionId`, and the old row's status moves
 * to `superseded` through the one permitted update (Rule 3.14). An auditor can
 * read the decision that governed a shipment years after the rule changed
 * (Rules 12.15, 12.16).
 *
 * **Nothing is defaulted.** No jurisdiction profile, or no version in force on
 * the governing date, yields no decision at all — the record keeps the status
 * it had and the caller is told which input is missing (Rule 3.10, E-13).
 * Chemistry a person has not confirmed yields a `blocked` decision with
 * `undetermined`, which is a recorded fact and not a guess (Rules 3.3, 3.4).
 *
 * ## The governing date
 *
 * Rule 3.6 fixes the intake date as the governing date for the decision made
 * at intake. A re-classification is a new decision made now, from inputs that
 * changed now, so the version in force on the day of the re-classification —
 * in the site's zone (Rule 4.29) — governs it. The date is written into the
 * audit row and the decision's applied version so the choice is visible; if
 * the owner rules that the intake date should govern re-classification too,
 * this is the one line that changes.
 *
 * ## The site
 *
 * There is no `site` entity (`src/features/settings/sites.ts`). A placed
 * record's site is its container's; an unplaced record's is the organisation's
 * primary address. Every derived site inherits
 * `organization.primaryJurisdictionId` today, and that derivation happens in
 * `organizationSites` and nowhere else.
 */

/** Bounded read — an organisation holds well under this many containers in B1a. */
const CONTAINER_SCAN_LIMIT = 100;
/** Bounded read — one record carries a handful of decisions over its life. */
const DECISIONS_PER_RECORD_LIMIT = 50;

export type ReclassificationTrigger = "condition_change" | "catalog_rematch";

export interface RecordSite {
  readonly jurisdictionId: Uuid | null;
  /** The site's own code, for the decision snapshot only — never branched on (Rule 1.23). */
  readonly jurisdictionCode: string | null;
  readonly timeZone: TimeZone;
  /** T-15, carried as the stored string. */
  readonly handlerSizeClass: string;
}

export type ResolvedWasteStreamRule =
  ResolvedRule | UnresolvedClassificationRule | null;

export interface ClassificationRuleContext {
  readonly site: RecordSite;
  readonly resolved: ResolvedWasteStreamRule;
  /** The governing date the version was resolved for, in the site's zone. */
  readonly asOf: IsoDate;
  /** The version that will govern, or null where none resolved. */
  readonly ruleVersionId: Uuid | null;
}

/**
 * The statuses an edit on `/batteries/[id]` may act on.
 *
 * A draft or a record still in review is edited through its intake session,
 * not here; a voided record is retained and never changed (Rule 3.25); a record
 * that has left storage is a shipment's concern.
 */
const EDITABLE_STATUSES: readonly BatteryRecordStatus[] = [
  "confirmed",
  "classified",
  "reclassifying",
  "stored",
  "quarantined",
];

/**
 * Refuse an edit on a record whose status puts it outside this screen's write
 * paths, with the reason stated (Rule 1.26).
 */
export function assertRecordEditable(
  ctx: RequestContext,
  record: BatteryRecord,
): void {
  if (EDITABLE_STATUSES.includes(record.status)) return;

  const userMessage =
    record.status === "voided"
      ? "This record is voided. It is kept for the trail and cannot be changed."
      : record.status === "draft" || record.status === "pending_review"
        ? "Finish this record's intake review before editing it here."
        : "This record has left storage and cannot be edited from this screen.";

  throw new ValidationError({
    userMessage,
    correlationId: ctx.correlationId,
    context: { batteryRecordId: record.id, status: record.status },
  });
}

/** The site the record sits at, derived the one way `sites.ts` derives it. */
export async function readRecordSite(
  ctx: RequestContext,
  record: BatteryRecord,
): Promise<RecordSite> {
  const organization = await data.organizations.get(ctx, ctx.organizationId);
  if (organization === null) {
    // The id came from the resolved session, not a URL: a missing row is a
    // data defect and must be loud (`src/lib/errors.ts` — nothing swallowed).
    throw new Error(
      `The active organization has no row (correlationId=${ctx.correlationId}).`,
    );
  }

  const container =
    record.containerId === null
      ? null
      : await data.containers.get(ctx, record.containerId);

  const containers =
    container === null
      ? (await data.containers.list(ctx, { limit: CONTAINER_SCAN_LIMIT })).items
      : [container];
  const sites = organizationSites(organization, containers);

  // A placed record is at its container's site; the derivation folds a
  // container with no address into the organisation's own row, so "the site
  // that counted this container" is the right pick either way.
  const site =
    container === null
      ? (sites.find((row) => row.isOrganizationAddress) ?? sites[0])
      : (sites.find(
          (row) =>
            row.containerCount > 0 && row.timeZone === container.siteTimeZone,
        ) ?? sites[0]);

  if (site === undefined) {
    throw new Error(
      `No site could be derived for the organization (correlationId=${ctx.correlationId}).`,
    );
  }

  let jurisdictionCode: string | null = null;
  if (site.jurisdictionId !== null) {
    const jurisdiction = await data.jurisdictions.get(ctx, site.jurisdictionId);
    jurisdictionCode = jurisdiction?.code ?? null;
  }

  return {
    jurisdictionId: site.jurisdictionId,
    jurisdictionCode,
    timeZone: site.timeZone,
    handlerSizeClass: organization.handlerSizeClass,
  };
}

/**
 * Resolve the waste-stream rule version in force for this record at `at`.
 *
 * `null` where the site has no jurisdiction profile; `{ missingInput:
 * "rule_version" }` where it has one and nothing is in force — the two gaps
 * Rule 3.10 names, kept distinct so E-13 can say which.
 */
export async function resolveClassificationRule(
  ctx: RequestContext,
  record: BatteryRecord,
  at: IsoTimestamp,
): Promise<ClassificationRuleContext> {
  const site = await readRecordSite(ctx, record);
  const asOf = civilDateInZone(at, site.timeZone);

  if (site.jurisdictionId === null) {
    return { site, resolved: null, asOf, ruleVersionId: null };
  }

  const resolution = await data.ruleVersions.resolve(ctx, {
    ruleKeys: [WASTE_STREAM_RULE_KEY],
    jurisdictionId: site.jurisdictionId,
    asOf,
    applicationClass: record.applicationClass,
  });

  const rule = resolution.ok
    ? resolution.resolved.rules[WASTE_STREAM_RULE_KEY]
    : resolution.partial.rules[WASTE_STREAM_RULE_KEY];

  if (rule === undefined) {
    return {
      site,
      resolved: { missingInput: "rule_version" },
      asOf,
      ruleVersionId: null,
    };
  }

  return {
    site,
    resolved: rule,
    asOf,
    ruleVersionId: rule.version.ruleVersionId,
  };
}

export interface ReclassificationOutcome {
  readonly kind: ClassificationResult["kind"];
  /** The appended decision, or null where nothing could be decided. */
  readonly decisionId: Uuid | null;
  readonly supersededDecisionIds: readonly Uuid[];
  readonly missingInput: ClassificationMissingInput | null;
  /** The record as it stands after the status settles. */
  readonly record: BatteryRecord;
}

function decisionRow(
  record: BatteryRecord,
  result: Extract<ClassificationResult, { kind: "decided" | "blocked" }>,
  rule: ResolvedRule,
  supersedes: Uuid | null,
  at: IsoTimestamp,
): CreateClassificationDecision {
  return {
    decisionScope: "battery_record",
    batteryRecordId: record.id,
    containerId: null,
    shipmentId: null,
    jurisdictionId: rule.jurisdiction.id,
    status: result.status,
    wasteClassification: result.outcome.result,
    basisCodes: result.basisCodes,
    reasoning: result.outcome.reasoning,
    governingRuleVersionId: rule.version.ruleVersionId,
    evaluationTrace: result.outcome.ruleVersionsApplied,
    inputsSnapshot: result.outcome.inputsSnapshot,
    decidedAt: at,
    // Rule evaluation decided; the person who changed the input is on the
    // audit row that triggered it, never on the decision (Rule 3.7).
    decidedBy: null,
    supersedesClassificationDecisionId: supersedes,
    isOverride: false,
    overrideReason: null,
    overriddenBy: null,
    derivedWasteClassification: null,
    isLessRegulatedThanDerived: false,
    ruleGapReportedAt: null,
    ruleGapClosedByRuleVersionId: null,
  };
}

/**
 * Where the record lands once the decision is in — T-22.
 *
 * A placed record is `stored`, or `quarantined` while it carries a DDR flag
 * (Rule 6.17 — the routing requirement is stated by `DdrBlockAlert`; moving it
 * between containers is `/containers`' write path, unit 04). An unplaced
 * record is `classified` on a decided outcome and `confirmed` on a blocked
 * one — its identification stands, its classification does not.
 */
function settledStatus(
  record: BatteryRecord,
  kind: "decided" | "blocked",
): BatteryRecordStatus {
  if (record.containerId !== null) {
    return record.ddrFlags.length > 0 ? "quarantined" : "stored";
  }
  return kind === "decided" ? "classified" : "confirmed";
}

/**
 * Append a superseding decision and settle the record's status.
 *
 * The status passes through `reclassifying` while the decision is being made.
 * The mock is not transactional, so a throw between the two updates leaves
 * the record saying exactly what happened to it — which is more honest than a
 * record that says `classified` beside a decision that was never written.
 */
export async function reclassifyRecord(
  ctx: RequestContext,
  input: {
    readonly record: BatteryRecord;
    readonly rule: ClassificationRuleContext;
    readonly at: IsoTimestamp;
    readonly trigger: ReclassificationTrigger;
  },
): Promise<ReclassificationOutcome> {
  const { record, rule, at, trigger } = input;
  const statusBefore = record.status;
  const actorLabel = `reclassification:${trigger}`;

  const result = classifyWasteStream(
    {
      chemistry: record.chemistry,
      chemistryConfirmed: record.chemistryConfirmedBy !== null,
      applicationClass: record.applicationClass,
      ddrFlags: record.ddrFlags,
      handlerSizeClass: rule.site.handlerSizeClass,
      jurisdictionCode: rule.site.jurisdictionCode ?? "",
    },
    rule.resolved,
  );

  if (result.kind === "unresolved") {
    // Rule 3.10 — no decision, no default, and the record keeps the status it
    // had. The caller reports which input is missing and who can supply it.
    return {
      kind: "unresolved",
      decisionId: null,
      supersededDecisionIds: [],
      missingInput: result.missingInput,
      record,
    };
  }

  // `resolved` narrowed by the result: an unresolved rule cannot produce a
  // decided or blocked outcome.
  const resolvedRule = rule.resolved;
  if (resolvedRule === null || !("version" in resolvedRule)) {
    throw new Error(
      `A decision was produced without a resolved rule (correlationId=${ctx.correlationId}).`,
    );
  }

  const existing = await data.classificationDecisions.list(ctx, {
    batteryRecordId: record.id,
    limit: DECISIONS_PER_RECORD_LIMIT,
  });
  const live = existing.items.filter((row) => row.status !== "superseded");
  const supersedes = newestDecision(live)?.id ?? null;

  const reclassifying = await data.batteryRecords.update(ctx, record.id, {
    status: "reclassifying",
  });

  const decision = await data.classificationDecisions.append(
    ctx,
    decisionRow(reclassifying, result, resolvedRule, supersedes, at),
  );

  for (const row of live) {
    await data.classificationDecisions.markSuperseded(ctx, row.id, decision.id);
  }

  await writeAuditEvent(
    ctx,
    systemEvent(ctx, actorLabel, {
      eventType: "classification_decision.recorded",
      entityTable: "classification_decision",
      entityId: decision.id,
      occurredAt: at,
      beforeState:
        live.length === 0
          ? null
          : {
              supersededDecisionIds: live.map((row) => row.id),
              wasteClassification:
                newestDecision(live)?.wasteClassification ?? null,
            },
      afterState: {
        wasteClassification: decision.wasteClassification,
        status: decision.status,
        basisCodes: [...decision.basisCodes],
        governingDate: rule.asOf,
        trigger,
      },
      governingRuleVersionId: decision.governingRuleVersionId,
      ruleVersionsApplied: decision.evaluationTrace,
      reason: trigger,
    }),
  );

  const status = settledStatus(reclassifying, result.kind);
  const settled = await data.batteryRecords.update(ctx, record.id, { status });

  if (status !== statusBefore) {
    await writeAuditEvent(
      ctx,
      systemEvent(ctx, actorLabel, {
        eventType: "battery_record.status_changed",
        entityTable: "battery_record",
        entityId: record.id,
        occurredAt: at,
        beforeState: { status: statusBefore },
        afterState: { status },
        changedFields: ["status"],
        governingRuleVersionId: decision.governingRuleVersionId,
        reason: trigger,
      }),
    );
  }

  return {
    kind: result.kind,
    decisionId: decision.id,
    supersededDecisionIds: live.map((row) => row.id),
    missingInput: null,
    record: settled,
  };
}

function newestDecision(
  rows: readonly ClassificationDecision[],
): ClassificationDecision | undefined {
  return [...rows].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
}
