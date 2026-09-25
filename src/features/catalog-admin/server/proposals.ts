import { data } from "@/data";
import type { CreateAlert, RequestContext } from "@/data/contracts";
import { rematchCandidates } from "@/domain/catalog/rematch";
import {
  rematchDedupeKey,
  rematchTriggerSnapshot,
} from "@/domain/review/queue";
import { ALERT_TYPE_DEFAULT_AUDIENCE } from "@/domain/taxonomy/alert-type";
import {
  APPLICATION_CLASS_LABELS,
  APPLICATION_CLASSES,
} from "@/domain/taxonomy/application-class";
import {
  CATALOG_ENTRY_SOURCE_TYPE_LABELS,
  CATALOG_ENTRY_SOURCE_TYPES,
} from "@/domain/taxonomy/catalog-entry-source-type";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { INTAKE_PHOTO_TYPE_LABELS } from "@/domain/taxonomy/intake-photo-type";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import { ROLE_CODES, ROLE_PERSONA_IDS } from "@/domain/taxonomy/role";
import { resolveUserNames } from "@/features/battery-record/user-names";
import {
  catalogEntryTitle,
  measurement,
} from "@/features/catalog/catalog-entry-display";
import { formatInstant } from "@/components/extraction-review";
import {
  userEvent,
  type RequestAttribution,
} from "@/features/intake/server/audit";
import { ConflictError, DataIntegrityError, NotFoundError } from "@/lib/errors";
import type { CatalogEntry } from "@/types/catalog";
import type { IsoTimestamp, Uuid } from "@/types/common";

import {
  PROPOSAL_NOT_OPEN,
  rematchAlertBody,
  rematchAlertTitle,
} from "../catalog-admin-copy";

/**
 * Catalog proposals, read and decided — `UX_SPEC.md` §3.19;
 * `SITE_ARCHITECTURE.md` Flow F; Rule 2.20; T-07, T-43 (D-45), T-61.
 *
 * **Approval changes no battery record.** It publishes the entry — searchable
 * at `/catalog` and available to intake matching from then on (T-07) — and
 * raises every record committed unmatched against the same identifying
 * fields on `/review` for a person to confirm (Flow F step 4). A confirmed
 * chemistry is never replaced by this module: the raise is a question, and the
 * answer is a person's, on the queue (EC-13).
 *
 * **Rejection is terminal** (T-07): a rejected entry never becomes available
 * for matching, and a corrected product is a new entry. The record the
 * proposal came from is already logged on the manual path (E-5) and is not
 * touched.
 *
 * Both are audited under D-45's `catalog_entry.status_changed`, with the
 * stated reason; a proposal is `catalog_entry.proposed` where it is made
 * (`features/intake/actions.ts`).
 */

const LIST_LIMIT = 200;
const PHOTO_LIMIT = 50;
const RECORD_LIMIT = 500;

export interface ProposalPhoto {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export interface ProposalView {
  readonly id: Uuid;
  readonly title: string;
  readonly proposedByName: string | null;
  readonly proposedAtLabel: string;
  readonly photo: ProposalPhoto | null;
  readonly crop: ProposalPhoto | null;
  /** Label and value, in the order the entry states them. Values are the entry's own, never derived. */
  readonly fields: readonly {
    readonly label: string;
    readonly value: string | null;
  }[];
}

export interface EntryRowView {
  readonly id: Uuid;
  readonly title: string;
  readonly statusValue: string;
  /** T-61 as stored — `CatalogSourceType` renders an unrecognised value as stored. */
  readonly sourceType: string;
  readonly isPlatformEntry: boolean;
}

function labelOf<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
  stored: string,
): string {
  const read = readTaxonomyValue(values, labels, stored);
  return read.recognised ? read.label : read.storedValue;
}

export async function readCatalogProposals(
  ctx: RequestContext,
  timeZone: string,
): Promise<readonly ProposalView[]> {
  const page = await data.catalogEntries.list(ctx, {
    status: "proposed",
    limit: LIST_LIMIT,
  });
  const names = await resolveUserNames(
    ctx,
    page.items.map((entry) => entry.createdBy),
  );

  const views: ProposalView[] = [];
  for (const entry of page.items) {
    const sessionId = entry.proposedFromIntakeSessionId ?? null;
    const photos =
      sessionId === null
        ? []
        : (
            await data.intakePhotos.list(ctx, {
              intakeSessionId: sessionId,
              limit: PHOTO_LIMIT,
            })
          ).items;
    const original =
      photos.find(
        (photo) =>
          photo.photoType === "label" && photo.parentIntakePhotoId === null,
      ) ?? null;
    const crop =
      photos.find((photo) => photo.photoType === "label_crop") ?? null;

    views.push({
      id: entry.id,
      title: catalogEntryTitle(entry),
      proposedByName:
        entry.createdBy === null ? null : (names.get(entry.createdBy) ?? null),
      proposedAtLabel: formatInstant(entry.createdAt, timeZone),
      photo:
        original === null
          ? null
          : {
              label: INTAKE_PHOTO_TYPE_LABELS.label,
              width: original.widthPx,
              height: original.heightPx,
            },
      crop:
        crop === null
          ? null
          : {
              label: INTAKE_PHOTO_TYPE_LABELS.label_crop,
              width: crop.widthPx,
              height: crop.heightPx,
            },
      fields: [
        { label: "Manufacturer", value: entry.manufacturerName },
        { label: "Model", value: entry.modelName },
        { label: "Part number", value: entry.partNumber },
        {
          label: "Chemistry",
          value: labelOf(CHEMISTRIES, CHEMISTRY_LABELS, entry.chemistry),
        },
        {
          label: "Battery class",
          value: labelOf(
            APPLICATION_CLASSES,
            APPLICATION_CLASS_LABELS,
            entry.applicationClass,
          ),
        },
        {
          label: "Nominal voltage",
          value: measurement(entry.nominalVoltageV, "V"),
        },
        {
          label: "Rated capacity",
          value: measurement(entry.ratedCapacityAh, "Ah"),
        },
        {
          label: "Rated energy",
          value: measurement(entry.ratedEnergyWh, "Wh"),
        },
        {
          label: "Source type",
          value: labelOf(
            CATALOG_ENTRY_SOURCE_TYPES,
            CATALOG_ENTRY_SOURCE_TYPE_LABELS,
            entry.sourceType,
          ),
        },
      ],
    });
  }
  return views;
}

/** Every entry that is not waiting on a decision — the "All entries" list (§3.19). */
export async function readCatalogEntries(
  ctx: RequestContext,
): Promise<readonly EntryRowView[]> {
  const page = await data.catalogEntries.list(ctx, {
    limit: LIST_LIMIT,
    sortBy: "manufacturerName",
  });
  return page.items
    .filter((entry) => entry.status !== "proposed")
    .map((entry) => ({
      id: entry.id,
      title: catalogEntryTitle(entry),
      statusValue: entry.status,
      sourceType: entry.sourceType,
      isPlatformEntry: entry.organizationId === null,
    }));
}

// --- the decision -------------------------------------------------------------------

async function loadProposal(
  ctx: RequestContext,
  entryId: Uuid,
): Promise<CatalogEntry> {
  const entry = await data.catalogEntries.get(ctx, entryId);
  if (entry === null) {
    throw new NotFoundError({
      userMessage: PROPOSAL_NOT_OPEN,
      correlationId: ctx.correlationId,
      context: { catalogEntryId: entryId },
    });
  }
  if (entry.status !== "proposed") {
    // T-07 — `rejected` is terminal and `published` is decided; a second
    // decision on either is refused, never applied over the first.
    throw new ConflictError({
      userMessage: PROPOSAL_NOT_OPEN,
      correlationId: ctx.correlationId,
      context: { catalogEntryId: entryId, status: entry.status },
    });
  }
  return entry;
}

/** T-44's default routing for `review_queue`, as role codes. Routing, not permission. */
function reviewQueueAudience(): readonly string[] {
  const personas = ALERT_TYPE_DEFAULT_AUDIENCE.review_queue;
  return ROLE_CODES.filter((role) => personas.includes(ROLE_PERSONA_IDS[role]));
}

export interface ApprovalOutcome {
  readonly catalogEntryId: Uuid;
  /** The records raised on `/review`. None of them was changed. */
  readonly raisedRecordIds: readonly Uuid[];
}

export async function approveProposal(
  ctx: RequestContext,
  entryId: Uuid,
  reason: string,
  at: IsoTimestamp,
  attribution: RequestAttribution,
): Promise<ApprovalOutcome> {
  const entry = await loadProposal(ctx, entryId);

  const published = await data.catalogEntries.update(ctx, entry.id, {
    status: "published",
    verifiedBy: ctx.userId,
    verifiedAt: at,
  });

  // Flow F step 4 — every record committed unmatched against the same
  // identifying fields. The domain decides who is asked; nothing is changed.
  const records = await data.batteryRecords.list(ctx, {
    isCatalogMatched: false,
    excludeVoided: true,
    excludeDrafts: true,
    limit: RECORD_LIMIT,
  });
  if (records.cursor !== null) {
    throw new DataIntegrityError({
      userMessage:
        "There are more unmatched records than this approval can check at once. Nothing was raised.",
      correlationId: ctx.correlationId,
      context: { total: records.total, limit: RECORD_LIMIT },
    });
  }
  const candidates = rematchCandidates(records.items, published);
  const byId = new Map(records.items.map((record) => [record.id, record]));

  const raised: Uuid[] = [];
  for (const candidate of candidates) {
    const record = byId.get(candidate.recordId);
    if (record === undefined) continue;
    const alert: CreateAlert = {
      alertType: "review_queue",
      severity: "attention",
      title: rematchAlertTitle(record.recordNumber),
      body: rematchAlertBody(catalogEntryTitle(published)),
      storageClockId: null,
      containerId: record.containerId,
      batteryRecordId: record.id,
      shipmentId: null,
      intakeSessionId: null,
      recallMatchId: null,
      obligationDeadlineId: null,
      siteIdRef: null,
      audienceRoles: [...reviewQueueAudience()],
      governingRuleVersionId: null,
      triggerSnapshot: rematchTriggerSnapshot({
        catalogEntryId: published.id,
        matchedOn: candidate.matchedOn,
      }),
      raisedAt: at,
      dedupeKey: rematchDedupeKey(record.id, published.id),
      deliveredChannels: null,
    };
    await data.alerts.raiseIfAbsent(ctx, alert);
    raised.push(record.id);
  }

  await data.auditEvents.write(
    ctx,
    userEvent(ctx, {
      eventType: "catalog_entry.status_changed",
      entityTable: "catalog_entry",
      entityId: entry.id,
      at,
      beforeState: { status: entry.status },
      afterState: {
        status: published.status,
        verifiedBy: ctx.userId,
        raisedRecordIds: raised,
      },
      changedFields: ["status", "verifiedBy", "verifiedAt"],
      reason,
      attribution,
    }),
  );

  return { catalogEntryId: published.id, raisedRecordIds: raised };
}

export async function rejectProposal(
  ctx: RequestContext,
  entryId: Uuid,
  reason: string,
  at: IsoTimestamp,
  attribution: RequestAttribution,
): Promise<{ readonly catalogEntryId: Uuid }> {
  const entry = await loadProposal(ctx, entryId);
  const rejected = await data.catalogEntries.update(ctx, entry.id, {
    status: "rejected",
  });
  await data.auditEvents.write(
    ctx,
    userEvent(ctx, {
      eventType: "catalog_entry.status_changed",
      entityTable: "catalog_entry",
      entityId: entry.id,
      at,
      beforeState: { status: entry.status },
      afterState: { status: rejected.status },
      changedFields: ["status"],
      reason,
      attribution,
    }),
  );
  return { catalogEntryId: rejected.id };
}
