import type { RequestContext } from "@/data/contracts/context";
import type {
  ComposedDocument,
  ContainerLabelIssue,
  DocumentDraftRender,
  DocumentRenderIdentity,
  DocumentComposer,
  IssuedContainerLabel,
} from "@/data/contracts/documents";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import type { IsoTimestamp, JsonObject, JsonValue, Uuid } from "@/types/common";
import type { ContainerLabel, DocumentRender } from "@/types/documents";
import type { RenderedDocumentType } from "@/domain/documents/document-identity";
import { canonicalJson, verificationCodeOf } from "@/domain/documents/snapshot";
import { labelInForce } from "@/domain/storage/container-label-flags";
import {
  ConflictError,
  DocumentRenderError,
  ValidationError,
  isAppError,
} from "@/lib/errors";
import { sha256HexOfText } from "@/lib/hash/sha256";

import { writeTriggerAudit as audit } from "./audit-row";
import { now } from "./factory";
import { nextId } from "./ids";
import { mockObjects, snapshotObjects } from "./object-store";
import { assertPolicy } from "./policy";
import { mockStore } from "./store";
import { contentsOf } from "./storage-writes";

/**
 * The document writes — `TECHNICAL_SPEC.md` §8.2: **compose, hash, store the
 * bytes where nothing can overwrite them, append the rows, as one
 * operation.**
 *
 * {@link writeRender} is the one door every issued or draft render goes
 * through, the shipping paper's included: it mints the render id, has the
 * document engine compose for that id, **re-hashes the snapshot it was
 * handed** (a composer that hashed one thing and rendered another is caught
 * here, not in an audit two years later), hashes the bytes, puts them at
 * `org/{org}/{document_type}/{render_id}.pdf` with overwrite disabled, and
 * appends the row. It runs inside the caller's all-or-nothing block, so a
 * failure anywhere after it leaves neither a row nor bytes behind.
 *
 * **Rows exist only on a successful render.** A failed render is an
 * `audit_event` (`document.render_failed`), written **outside** the rolled-back
 * block so the record of the failure survives the rollback (§10.4).
 */

const store = () => mockStore();

export const DOCUMENTS_BUCKET = "documents";
const PDF_CONTENT_TYPE = "application/pdf";
/** Every PDF opens with this header; bytes that do not are not a document. */
const PDF_SIGNATURE = "%PDF-";

export function documentObjectPath(
  organizationId: Uuid,
  documentType: RenderedDocumentType,
  documentRenderId: Uuid,
): string {
  return `org/${organizationId}/${documentType}/${documentRenderId}.pdf`;
}

/** Snapshot every table a document write touches, and the stored objects. */
function snapshot(): () => void {
  const s = store();
  const tables = [
    s.containers,
    s.containerLabels,
    s.documentRenders,
    s.auditEvents,
  ] as const;
  const saved = tables.map((table) => [...table.all()]);
  const restoreObjects = snapshotObjects();
  return () => {
    tables.forEach((table, index) => {
      (table.replaceAll as (rows: readonly unknown[]) => void)(
        saved[index] ?? [],
      );
    });
    restoreObjects();
  };
}

async function atomically<T>(write: () => Promise<T>): Promise<T> {
  const restore = snapshot();
  try {
    return await write();
  } catch (cause) {
    restore();
    throw cause;
  }
}

function renderFailure(
  ctx: RequestContext,
  reason: string,
  cause?: unknown,
): DocumentRenderError {
  return new DocumentRenderError({
    userMessage:
      "This document couldn't be generated, so nothing was issued and nothing was stored. Try again; if it fails again, quote the reference below.",
    correlationId: ctx.correlationId,
    context: { reason },
    cause,
  });
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function composeOrRefuse(
  ctx: RequestContext,
  compose: DocumentComposer,
  identity: DocumentRenderIdentity,
): Promise<ComposedDocument> {
  try {
    return await compose(identity);
  } catch (error) {
    // A refusal the engine stated (a payload missing a field it must carry)
    // keeps its own words; anything else is the renderer failing.
    if (isAppError(error)) throw error;
    throw renderFailure(ctx, "renderer_failed", error);
  }
}

/**
 * Compose one render for a freshly minted identity, check it, store its
 * bytes and append its row. **Inside an all-or-nothing block only.**
 */
export async function writeRender(
  ctx: RequestContext,
  input: {
    readonly compose: DocumentComposer;
    readonly status: DocumentRenderIdentity["status"];
    readonly at: IsoTimestamp;
    readonly documentType: RenderedDocumentType;
    readonly subject:
      { readonly shipmentId: Uuid } | { readonly containerId: Uuid };
    readonly supersedesDocumentRenderId: Uuid | null;
  },
): Promise<DocumentRender> {
  assertPolicy(ctx, "document_render", "insert");
  const identity: DocumentRenderIdentity = {
    documentRenderId: nextId(),
    renderedAt: input.at,
    status: input.status,
  };
  const composed = await composeOrRefuse(ctx, input.compose, identity);

  // The render answers for exactly the identity it was minted, and its
  // snapshot hashes to what the engine said it hashed before rendering.
  const stamped = composed.inputSnapshot.document;
  if (
    composed.documentType !== input.documentType ||
    !isObject(stamped) ||
    stamped.documentRenderId !== identity.documentRenderId ||
    stamped.status !== identity.status ||
    stamped.renderedAt !== identity.renderedAt
  ) {
    throw renderFailure(ctx, "snapshot_names_another_render");
  }
  const recomputed = await sha256HexOfText(
    canonicalJson(composed.inputSnapshot),
  );
  if (recomputed !== composed.inputSnapshotHash) {
    throw renderFailure(ctx, "snapshot_hash_mismatch");
  }
  const signature = new TextDecoder("latin1").decode(
    composed.bytes.subarray(0, PDF_SIGNATURE.length),
  );
  if (signature !== PDF_SIGNATURE || composed.pageCount < 1) {
    throw renderFailure(ctx, "not_a_pdf");
  }

  const path = documentObjectPath(
    ctx.organizationId,
    input.documentType,
    identity.documentRenderId,
  );
  const stored = await mockObjects.put(ctx, {
    bucket: DOCUMENTS_BUCKET,
    path,
    bytes: composed.bytes,
    contentType: PDF_CONTENT_TYPE,
    immutable: true,
  });

  const row: DocumentRender = {
    id: identity.documentRenderId,
    organizationId: ctx.organizationId,
    documentType: input.documentType,
    shipmentId: "shipmentId" in input.subject ? input.subject.shipmentId : null,
    containerId:
      "containerId" in input.subject ? input.subject.containerId : null,
    batteryRecordId: null,
    evidencePackId: null,
    templateKey: composed.templateKey,
    templateVersion: composed.templateVersion,
    rendererName: composed.rendererName,
    rendererVersion: composed.rendererVersion,
    inputSnapshot: composed.inputSnapshot,
    inputSnapshotHash: composed.inputSnapshotHash,
    verificationCode: verificationCodeOf(composed.inputSnapshotHash),
    ruleVersionsApplied: composed.ruleVersionsApplied,
    storageObjectPath: stored.path,
    contentHash: stored.contentHash,
    byteSize: stored.byteSize,
    pageCount: composed.pageCount,
    renderedAt: identity.renderedAt,
    renderedBy: ctx.userId,
    renderDurationMs: composed.renderDurationMs,
    status: identity.status,
    supersedesDocumentRenderId: input.supersedesDocumentRenderId,
    supersededAt: null,
    createdAt: now(),
  };
  return store().documentRenders.insert(ctx, row);
}

/**
 * `document.render_failed` — written after the rollback, so the failure is
 * as auditable as a success (`TECHNICAL_SPEC.md` §10.4). Only a render
 * failure is recorded here; a refused precondition is not a failed render.
 */
export async function recordRenderFailure(
  ctx: RequestContext,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
  failure: {
    readonly error: unknown;
    readonly documentType: RenderedDocumentType;
    readonly subject:
      | { readonly entityTable: "shipment"; readonly entityId: Uuid }
      | { readonly entityTable: "container"; readonly entityId: Uuid };
    readonly inputs: JsonObject;
  },
): Promise<void> {
  if (!(failure.error instanceof DocumentRenderError)) return;
  await audit(ctx, at, attribution, {
    eventType: "document.render_failed",
    entityTable: failure.subject.entityTable,
    entityId: failure.subject.entityId,
    beforeState: null,
    afterState: {
      documentType: failure.documentType,
      code: failure.error.code,
      reason:
        typeof failure.error.context.reason === "string"
          ? failure.error.context.reason
          : null,
      inputs: failure.inputs,
    },
  });
}

/** Run a write that renders; on a render failure, roll back and record it. */
async function renderingAtomically<T>(
  ctx: RequestContext,
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
  failure: Omit<Parameters<typeof recordRenderFailure>[3], "error">,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await atomically(write);
  } catch (error) {
    await recordRenderFailure(ctx, at, attribution, { ...failure, error });
    throw error;
  }
}

// --- container labels -----------------------------------------------------------------------

const UNLABELLABLE_STATUSES: readonly string[] = ["shipped", "retired"];

function sameIds(a: readonly Uuid[], b: readonly Uuid[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

export async function issueContainerLabel(
  ctx: RequestContext,
  input: ContainerLabelIssue,
): Promise<IssuedContainerLabel> {
  assertPolicy(ctx, "container_label", "insert");
  assertPolicy(ctx, "document_render", "insert");
  assertPolicy(ctx, "container", "update");
  const s = store();
  const container = await s.containers.getOrThrow(ctx, input.containerId);
  const content = input.label.result;

  if (UNLABELLABLE_STATUSES.includes(container.status)) {
    throw new ConflictError({
      userMessage:
        "This container has left the site or been retired. No label is printed for it.",
      correlationId: ctx.correlationId,
      context: { status: container.status },
    });
  }
  // Rule 4.19 — the label states the container's current start and exactly
  // its current contents, or it is not issued.
  const contents = contentsOf(ctx, container.id);
  if (
    content.containerId !== container.id ||
    container.accumulationStartedAt === null ||
    Date.parse(content.accumulationStartedAt) !==
      Date.parse(container.accumulationStartedAt) ||
    !sameIds(
      content.recordIds,
      contents.map((record) => record.id),
    )
  ) {
    throw new ConflictError({
      userMessage:
        "The container changed while its label was being prepared. Nothing was printed — review it again.",
      correlationId: ctx.correlationId,
      context: { rule: "4.19" },
    });
  }
  const [governing] = input.label.ruleVersionsApplied;
  if (governing === undefined) {
    throw new ValidationError({
      userMessage:
        "No container label rule is on file, so the required wording is unknown. Nothing was printed.",
      correlationId: ctx.correlationId,
      context: { rule: "4.18" },
    });
  }

  const labels = s.containerLabels
    .all()
    .filter(
      (label) =>
        label.organizationId === ctx.organizationId &&
        label.containerId === container.id,
    );
  const previous = labelInForce(container.currentContainerLabelId, labels);
  const previousRender =
    previous === null
      ? undefined
      : s.documentRenders
          .all()
          .find((render) => render.id === previous.documentRenderId);

  return renderingAtomically(
    ctx,
    input.at,
    input.attribution,
    {
      documentType: "container_label",
      subject: { entityTable: "container", entityId: container.id },
      inputs: content,
    },
    async () => {
      const render = await writeRender(ctx, {
        compose: input.compose,
        status: "issued",
        at: input.at,
        documentType: "container_label",
        subject: { containerId: container.id },
        supersedesDocumentRenderId: previousRender?.id ?? null,
      });

      const labelRow: ContainerLabel = {
        id: nextId(),
        organizationId: ctx.organizationId,
        containerId: container.id,
        documentRenderId: render.id,
        labelText: content.labelText,
        contentsDescription: content.contentsDescription,
        accumulationStartedAt: content.accumulationStartedAt,
        handlerIdentifier: content.handlerIdentifier,
        qrPayloadUrl: content.qrPayloadUrl,
        governingRuleVersionId: governing.ruleVersionId,
        evaluationTrace: input.label.ruleVersionsApplied,
        supersedesContainerLabelId: previous?.id ?? null,
        generatedAt: input.at,
        generatedBy: ctx.userId,
        createdAt: now(),
      };
      const containerLabel = await s.containerLabels.insert(ctx, labelRow);
      const updated = await s.containers.update(ctx, container.id, {
        currentContainerLabelId: containerLabel.id,
        updatedAt: now(),
        updatedBy: ctx.userId,
      });

      let supersededDocumentRenderId: Uuid | null = null;
      if (previousRender !== undefined && previousRender.status === "issued") {
        // Rules 4.20, 5.15 — the trigger's one update on the old render: kept
        // in full, readable, marked, and pointed at by its replacement.
        await s.documentRenders.updateAsDefiner(ctx, previousRender.id, {
          status: "superseded",
          supersededAt: input.at,
        });
        supersededDocumentRenderId = previousRender.id;
        await audit(ctx, input.at, input.attribution, {
          eventType: "document_render.superseded",
          entityTable: "document_render",
          entityId: previousRender.id,
          beforeState: { status: previousRender.status },
          afterState: {
            status: "superseded",
            supersededByDocumentRenderId: render.id,
            containerId: container.id,
          },
          changedFields: ["status", "supersededAt"],
        });
      }

      await audit(ctx, input.at, input.attribution, {
        eventType: "document_render.issued",
        entityTable: "document_render",
        entityId: render.id,
        beforeState: null,
        afterState: {
          documentType: render.documentType,
          containerId: container.id,
          containerLabelId: containerLabel.id,
          accumulationStartedAt: containerLabel.accumulationStartedAt,
          contentHash: render.contentHash,
          verificationCode: render.verificationCode,
          supersedesDocumentRenderId: render.supersedesDocumentRenderId,
        },
        governingRuleVersionId: governing.ruleVersionId,
        ruleVersionsApplied: input.label.ruleVersionsApplied,
      });
      // TODO(T-43): pointing `container.current_container_label_id` at the new
      // label is part of the issue above and carried in its row; T-43 has no
      // container type for it, and a near neighbour would misname the act.

      return {
        container: updated,
        containerLabel,
        documentRender: render,
        supersededDocumentRenderId,
      };
    },
  );
}

// --- drafts ----------------------------------------------------------------------------------

/** Statuses a shipment's paper may still be drafted in — before one is issued. */
const DRAFTABLE_SHIPMENT_STATUSES: readonly string[] = ["draft", "ready"];

export async function storeDraftRender(
  ctx: RequestContext,
  input: DocumentDraftRender,
): Promise<DocumentRender> {
  assertPolicy(ctx, "document_render", "insert");
  const shipment = await store().shipments.getOrThrow(ctx, input.shipmentId);
  if (!DRAFTABLE_SHIPMENT_STATUSES.includes(shipment.status)) {
    throw new ConflictError({
      userMessage:
        "This shipment's paper is already issued, or the shipment has departed. Print the issued paper instead of a draft.",
      correlationId: ctx.correlationId,
      context: { status: shipment.status },
    });
  }
  return renderingAtomically(
    ctx,
    input.at,
    input.attribution,
    {
      documentType: input.documentType,
      subject: { entityTable: "shipment", entityId: shipment.id },
      inputs: { shipmentNumber: shipment.shipmentNumber, status: "draft" },
    },
    async () =>
      // TODO(T-43): storing a draft has no T-43 type. The print or download
      // that caused it is audited against the draft's id as it streams
      // (`document.reprinted` / `document.viewed`); the draft itself writes
      // nothing rather than borrow `document_render.issued`.
      writeRender(ctx, {
        compose: input.compose,
        status: "draft",
        at: input.at,
        documentType: input.documentType,
        subject: { shipmentId: shipment.id },
        supersedesDocumentRenderId: null,
      }),
  );
}
