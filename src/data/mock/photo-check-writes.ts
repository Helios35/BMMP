import type { RequestContext } from "@/data/contracts/context";
import {
  PLATFORM_BUCKET,
  PLATFORM_PATH_PREFIX,
} from "@/data/contracts/object-store";
import type {
  CatalogReferencePhotoQuery,
  CatalogReferencePhotoRepository,
  CatalogReferencePhotoSetting,
  PhotoCheckQuery,
  PhotoCheckRecording,
  PhotoCheckRepository,
} from "@/data/contracts/photo-checks";
import type { Page } from "@/data/contracts/repository";
import {
  mayTakePhotoCheckAction,
  rolesForPhotoCheckAction,
  type PhotoCheckAction,
} from "@/domain/access/photo-check-actions";
import { PHOTO_CHECK_OUTCOMES_BY_KIND } from "@/domain/taxonomy/photo-check-outcome";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import { NotFoundError, PermissionError, ValidationError } from "@/lib/errors";
import type { JsonObject } from "@/types/common";
import type { CatalogReferencePhoto, PhotoCheck } from "@/types/photo-check";

import { writeSystemAudit, writeTriggerAudit } from "./audit-row";
import { now } from "./factory";
import { nextId } from "./ids";
import { mockObjects, snapshotObjects } from "./object-store";
import { mockStore } from "./store";

/**
 * The photo checks, written — `PhotoCheckRepository` and
 * `CatalogReferencePhotoRepository`; Rules 2.36, 2.37, 6.25, 6.26; T-43,
 * T-65, T-66; D-75.
 *
 * **A check run is the system step's row** (Rule 12.5): it goes in through the
 * definer door with a `system` audit row naming the step, never a person —
 * the person's act (the upload, the pick) is on its own row. It is refused for
 * a role that cannot set a check running, P5 above all (Rule 1.16).
 *
 * **A reference photo is P6's act** (D-75 #2), on a platform table and in the
 * platform bucket, with its `catalog_entry.reference_photo_set` row. The
 * replaced one is stamped superseded and stays on the history (Rule 2.36).
 *
 * **No number about a photo is written anywhere here** (D-75 #5): a run
 * records its closed outcome, the findings or photos it names, and the call's
 * metering.
 */

const store = () => mockStore();

const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function refuse(ctx: RequestContext, action: PhotoCheckAction): never {
  const who = rolesForPhotoCheckAction(action)
    .map((role) => ROLE_LABELS[role])
    .join(", ");
  const what =
    action === "set_reference_photo"
      ? "set a catalog reference photo"
      : action === "decide_proposal"
        ? "decide an AI suggestion"
        : "run a photo check";
  throw new PermissionError({
    userMessage: `Your role cannot ${what}. ${who} can.`,
    correlationId: ctx.correlationId,
    context: { action, role: ctx.role, rule: "2.36, 6.25" },
  });
}

async function atomically<T>(write: () => Promise<T>): Promise<T> {
  const s = store();
  const tables = [
    s.photoChecks,
    s.catalogReferencePhotos,
    s.auditEvents,
  ] as const;
  const saved = tables.map((table) => [...table.all()]);
  const restoreObjects = snapshotObjects();
  try {
    return await write();
  } catch (cause) {
    tables.forEach((table, index) => {
      (table.replaceAll as (rows: readonly unknown[]) => void)(
        saved[index] ?? [],
      );
    });
    restoreObjects();
    throw cause;
  }
}

function invalid(ctx: RequestContext, detail: string): never {
  throw new ValidationError({
    userMessage: "The photo check could not be recorded. Nothing was changed.",
    correlationId: ctx.correlationId,
    context: { detail },
  });
}

/** A run that says what its kind cannot say is a defect, refused rather than stored. */
function assertCoherent(ctx: RequestContext, input: PhotoCheckRecording): void {
  if (!PHOTO_CHECK_OUTCOMES_BY_KIND[input.checkKind].includes(input.outcome)) {
    invalid(ctx, `${input.outcome} is not a ${input.checkKind} outcome`);
  }
  const failed = input.outcome === "failed";
  if (failed !== (input.errorCode !== null && input.errorCode !== "")) {
    invalid(ctx, "a failed run carries its reason code, and only a failed run");
  }
  const proposes = input.checkKind === "damage_proposal";
  if (!proposes && input.proposedFindings.length > 0) {
    invalid(ctx, "only a damage check proposes findings");
  }
  if (
    proposes &&
    (input.outcome === "proposed") !== input.proposedFindings.length > 0
  ) {
    invalid(ctx, "`proposed` names its findings, and only `proposed` does");
  }
  const copies = input.outcome === "copy_found";
  if (copies !== input.matchedPhotoIds.length > 0) {
    invalid(ctx, "`copy_found` names the photos it found, and only it does");
  }
  if (
    input.checkKind !== "label_look" &&
    input.catalogReferencePhotoId !== null
  ) {
    invalid(ctx, "only a label look check names a reference photo");
  }
}

function checkSnapshot(row: PhotoCheck): JsonObject {
  return {
    photoCheckId: row.id,
    intakePhotoId: row.intakePhotoId,
    checkKind: row.checkKind,
    outcome: row.outcome,
    proposedFindings: [...row.proposedFindings],
    catalogEntryId: row.catalogEntryId,
    catalogReferencePhotoId: row.catalogReferencePhotoId,
    matchedPhotoIds: [...row.matchedPhotoIds],
    matchedBatteryRecordIds: [...row.matchedBatteryRecordIds],
    errorCode: row.errorCode,
    provider: row.provider,
    modelIdentifier: row.modelIdentifier,
    promptVersion: row.promptVersion,
    configurationVersion: row.configurationVersion,
  };
}

export const mockPhotoChecks: PhotoCheckRepository = {
  async list(
    ctx: RequestContext,
    query: PhotoCheckQuery,
  ): Promise<Page<PhotoCheck>> {
    return store().photoChecks.list(
      ctx,
      query,
      (row) =>
        (query.intakeSessionId === undefined ||
          row.intakeSessionId === query.intakeSessionId) &&
        (query.intakePhotoId === undefined ||
          row.intakePhotoId === query.intakePhotoId) &&
        (query.batteryRecordId === undefined ||
          row.batteryRecordId === query.batteryRecordId) &&
        (query.checkKind === undefined || row.checkKind === query.checkKind),
      (a, b) =>
        b.ranAt.localeCompare(a.ranAt) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  },

  async record(ctx: RequestContext, input: PhotoCheckRecording) {
    if (!mayTakePhotoCheckAction(ctx.role, "run_check")) {
      refuse(ctx, "run_check");
    }
    assertCoherent(ctx, input);
    const s = store();
    const photo = s.intakePhotos
      .all()
      .find(
        (row) =>
          row.id === input.intakePhotoId &&
          row.organizationId === ctx.organizationId,
      );
    if (photo === undefined) {
      throw new NotFoundError({
        userMessage: "No intake photo was found.",
        correlationId: ctx.correlationId,
        context: { intakePhotoId: input.intakePhotoId },
      });
    }
    const session = s.intakeSessions
      .all()
      .find(
        (row) =>
          row.id === photo.intakeSessionId &&
          row.organizationId === ctx.organizationId,
      );

    return atomically(async () => {
      const row: PhotoCheck = {
        id: nextId(),
        organizationId: ctx.organizationId,
        intakePhotoId: photo.id,
        intakeSessionId: photo.intakeSessionId,
        batteryRecordId: session?.batteryRecordId ?? null,
        checkKind: input.checkKind,
        outcome: input.outcome,
        proposedFindings: [...input.proposedFindings],
        catalogEntryId: input.catalogEntryId,
        catalogReferencePhotoId: input.catalogReferencePhotoId,
        matchedPhotoIds: [...input.matchedPhotoIds],
        matchedBatteryRecordIds: [...input.matchedBatteryRecordIds],
        errorCode: input.errorCode,
        provider: input.provider,
        modelIdentifier: input.modelIdentifier,
        promptVersion: input.promptVersion,
        costUsd: input.costUsd,
        latencyMs: input.latencyMs,
        configurationVersion: input.configurationVersion,
        ranAt: input.at,
        ranBy: ctx.userId,
        createdAt: now(),
      };
      await s.photoChecks.insertAsDefiner(ctx, row);
      await writeSystemAudit(
        ctx,
        input.at,
        `photo_check:${input.checkKind}`,
        input.attribution,
        {
          eventType:
            input.outcome === "failed"
              ? "photo_check.failed"
              : "photo_check.completed",
          entityTable: "photo_check",
          entityId: row.id,
          beforeState: null,
          afterState: checkSnapshot(row),
          reason: input.errorCode,
        },
      );
      return row;
    });
  },
};

function referenceSnapshot(row: CatalogReferencePhoto | null): JsonObject {
  if (row === null) return { catalogReferencePhotoId: null };
  return {
    catalogReferencePhotoId: row.id,
    contentHash: row.contentHash,
    mimeType: row.mimeType,
    widthPx: row.widthPx,
    heightPx: row.heightPx,
    fileName: row.fileName,
    setBy: row.setBy,
    setAt: row.setAt,
  };
}

function newestFirst(
  a: CatalogReferencePhoto,
  b: CatalogReferencePhoto,
): number {
  return (
    b.setAt.localeCompare(a.setAt) || b.createdAt.localeCompare(a.createdAt)
  );
}

export const mockCatalogReferencePhotos: CatalogReferencePhotoRepository = {
  async current(ctx: RequestContext, catalogEntryId) {
    const page = await store().catalogReferencePhotos.list(
      ctx,
      { limit: 1 },
      (row) =>
        row.catalogEntryId === catalogEntryId && row.supersededAt === null,
      newestFirst,
    );
    return page.items[0] ?? null;
  },

  async get(ctx: RequestContext, id) {
    return store().catalogReferencePhotos.get(ctx, id);
  },

  async list(ctx: RequestContext, query: CatalogReferencePhotoQuery) {
    return store().catalogReferencePhotos.list(
      ctx,
      query,
      (row) => row.catalogEntryId === query.catalogEntryId,
      newestFirst,
    );
  },

  async set(ctx: RequestContext, input: CatalogReferencePhotoSetting) {
    if (
      !ctx.isPlatformAdmin ||
      !mayTakePhotoCheckAction(ctx.role, "set_reference_photo")
    ) {
      refuse(ctx, "set_reference_photo");
    }
    const s = store();
    const entry = s.catalogEntries
      .all()
      .find((row) => row.id === input.catalogEntryId);
    if (entry === undefined) {
      throw new NotFoundError({
        userMessage: "No catalog entry was found.",
        correlationId: ctx.correlationId,
        context: { catalogEntryId: input.catalogEntryId },
      });
    }
    const extension = EXTENSION_BY_MIME_TYPE[input.mimeType];
    if (extension === undefined || input.widthPx <= 0 || input.heightPx <= 0) {
      throw new ValidationError({
        userMessage:
          "The reference photo must be a JPEG, PNG or WebP image whose size can be read.",
        correlationId: ctx.correlationId,
        field: "file",
      });
    }
    const prior = await mockCatalogReferencePhotos.current(ctx, entry.id);

    return atomically(async () => {
      const id = nextId();
      const stored = await mockObjects.put(ctx, {
        bucket: PLATFORM_BUCKET,
        path: `${PLATFORM_PATH_PREFIX}catalog/${entry.id}/${id}.${extension}`,
        bytes: input.bytes,
        contentType: input.mimeType,
        immutable: true,
      });
      if (prior !== null) {
        await s.catalogReferencePhotos.update(ctx, prior.id, {
          supersededAt: input.at,
        });
      }
      const row: CatalogReferencePhoto = {
        id,
        catalogEntryId: entry.id,
        storageObjectPath: stored.path,
        contentHash: stored.contentHash,
        byteSize: stored.byteSize,
        mimeType: input.mimeType,
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        fileName: input.fileName,
        isExifStripped: true,
        setBy: ctx.userId,
        setAt: input.at,
        supersededAt: null,
        supersedesCatalogReferencePhotoId: prior?.id ?? null,
        createdAt: now(),
      };
      await s.catalogReferencePhotos.insert(ctx, row);
      await writeTriggerAudit(ctx, input.at, input.attribution, {
        eventType: "catalog_entry.reference_photo_set",
        entityTable: "catalog_entry",
        entityId: entry.id,
        beforeState: referenceSnapshot(prior),
        afterState: referenceSnapshot(row),
        changedFields: ["referenceLabelPhoto"],
      });
      return row;
    });
  },
};
