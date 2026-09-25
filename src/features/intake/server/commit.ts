import { revalidatePath } from "next/cache";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { civilDateInZone } from "@/domain/storage/clock-display";
import {
  ConflictError,
  DataIntegrityError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { IsoTimestamp, Uuid } from "@/types/common";

import {
  CATALOG_ENTRY_NOT_AVAILABLE,
  CONTAINER_NOT_FOUND,
  INTAKE_HAS_NO_RECORD,
} from "../copy";
import { userEvent, type RequestAttribution } from "./audit";
import { resolveIntakeRules } from "./classification-preview";
import { buildIntakeConfirmation } from "./confirmation";
import { draftForSession, latestRunRows, loadOpenIntake } from "./read-intake";

/**
 * **The one commit, and the one void** — `TECHNICAL_SPEC.md` §11.1 step 6;
 * Rules 2.15, 2.21, 2.23; D-42.
 *
 * Two routes end an intake: `/batteries/new` step 3 and a `/review` queue
 * item. Both call these functions and nothing else, so there is exactly one
 * place a battery record is committed from an intake and one place a queue
 * item is voided. **A second commit path is how two screens come to disagree
 * about what a logged battery is.** The Server Actions in
 * `features/intake/actions.ts` and `features/review/actions.ts` are doors with
 * different guards (`./session-action.ts`); the work is here.
 *
 * Neither function checks a role: the door did, and the adapter's policy
 * matrix refuses underneath that (§9.5).
 */

const PHOTO_LIMIT = 50;
const CONTAINER_LIMIT = 100;

export interface CommittedIntake {
  readonly batteryRecordId: Uuid;
  readonly recordNumber: string;
  readonly containerId: Uuid | null;
}

/**
 * Confirm and log the battery.
 *
 * Everything is recomputed from the draft on the server and written as one
 * `IntakeConfirmation`; the adapter refuses without the three attributable
 * confirmations at any confidence band (Rules 2.15, 2.21). **D-42: a session
 * with no stored photo is refused here, on every path, manual entry
 * included**, with the same sentence the card's checklist shows — the photos
 * are read from the session, never taken from the caller's word.
 */
export async function commitIntake(
  ctx: RequestContext,
  sessionId: Uuid,
  attribution: RequestAttribution,
  at: IsoTimestamp,
): Promise<CommittedIntake> {
  const { session, record } = await loadOpenIntake(ctx, sessionId);
  const { draft, extractions } = await draftForSession(ctx, session);

  const [organization, containersPage, photosPage] = await Promise.all([
    data.organizations.get(ctx, ctx.organizationId),
    data.containers.list(ctx, { limit: CONTAINER_LIMIT }),
    data.intakePhotos.list(ctx, {
      intakeSessionId: session.id,
      limit: PHOTO_LIMIT,
    }),
  ]);
  if (organization === null) {
    throw new DataIntegrityError({
      userMessage: INTAKE_HAS_NO_RECORD,
      correlationId: ctx.correlationId,
    });
  }

  const catalogEntry =
    draft.selectedCatalogEntryId === null
      ? null
      : await data.catalogEntries.get(ctx, draft.selectedCatalogEntryId);
  if (draft.selectedCatalogEntryId !== null && catalogEntry === null) {
    throw new ConflictError({
      userMessage: CATALOG_ENTRY_NOT_AVAILABLE,
      correlationId: ctx.correlationId,
    });
  }

  const container =
    draft.containerId === null
      ? null
      : (containersPage.items.find((row) => row.id === draft.containerId) ??
        null);
  if (draft.containerId !== null && container === null) {
    throw new NotFoundError({
      userMessage: CONTAINER_NOT_FOUND,
      correlationId: ctx.correlationId,
      context: { containerId: draft.containerId },
    });
  }
  const runningClock =
    container === null
      ? null
      : ((
          await data.storageClocks.list(ctx, {
            containerId: container.id,
            isRunning: true,
            limit: 5,
          })
        ).items[0] ?? null);

  const rules = await resolveIntakeRules(ctx, {
    organization,
    containers: containersPage.items,
    container,
    intakeStartedAt: session.startedAt,
    applicationClass: catalogEntry?.applicationClass ?? record.applicationClass,
  });

  const dateCodeRow = latestRunRows(extractions, draft.extractionRunId).find(
    (row) => row.fieldCode === "date_code",
  );
  const damagePhoto = photosPage.items.find(
    (photo) => photo.photoType === "damage",
  );

  const built = buildIntakeConfirmation({
    ctx,
    session,
    record,
    draft,
    catalogEntry,
    container,
    runningClock,
    rules,
    organization,
    dateCodeExtractionId: dateCodeRow?.id ?? null,
    damagePhotoId: damagePhoto?.id ?? null,
    hasStoredPhoto: photosPage.items.length > 0,
    today: civilDateInZone(at, rules.site.timeZone),
    at,
    attribution,
  });
  if (!built.ok) {
    throw new ValidationError({
      userMessage: built.message,
      correlationId: ctx.correlationId,
      context: { outstanding: built.outstanding.map((item) => item.kind) },
    });
  }

  const committed = await data.intakeSessions.commitConfirmation(
    ctx,
    built.confirmation,
  );
  revalidatePath("/batteries");
  revalidatePath(`/batteries/${committed.id}`);
  revalidatePath("/review");
  return {
    batteryRecordId: committed.id,
    recordNumber: committed.recordNumber,
    containerId: built.containerId,
  };
}

export interface VoidedIntake {
  readonly sessionId: Uuid;
  readonly batteryRecordId: Uuid;
  readonly recordNumber: string;
}

/**
 * Void the record with a stated reason — Rule 2.23, one of the two ways a
 * record leaves the queue. The record is retained as `voided`, the session
 * closes, and the move is T-43 `battery_record.status_changed` with the
 * reason (D-45). The session, its photos and its extraction are all kept
 * (Rule 2.1).
 */
export async function voidIntake(
  ctx: RequestContext,
  sessionId: Uuid,
  reason: string,
  attribution: RequestAttribution,
  at: IsoTimestamp,
): Promise<VoidedIntake> {
  const { session, record } = await loadOpenIntake(ctx, sessionId);
  await data.batteryRecords.update(ctx, record.id, { status: "voided" });
  await data.intakeSessions.update(ctx, session.id, {
    status: "abandoned",
    abandonedAt: at,
    reviewedBy: ctx.userId,
    reviewedAt: at,
    reviewOutcome: "voided",
  });
  await data.auditEvents.write(
    ctx,
    userEvent(ctx, {
      eventType: "battery_record.status_changed",
      entityTable: "battery_record",
      entityId: record.id,
      at,
      beforeState: { status: record.status },
      afterState: { status: "voided" },
      changedFields: ["status"],
      reason,
      attribution,
    }),
  );
  revalidatePath("/review");
  return {
    sessionId: session.id,
    batteryRecordId: record.id,
    recordNumber: record.recordNumber,
  };
}
