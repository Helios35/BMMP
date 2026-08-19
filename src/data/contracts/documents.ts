import type { RequestContext } from "./context";
import type {
  AppendInput,
  AppendOnlyRepository,
  BaseQuery,
  CreateInput,
  Repository,
  UpdateInput,
} from "./repository";
import type {
  ClassificationDecision,
  ContainerLabel,
  DocumentRender,
  Shipment,
  ShippingPaper,
} from "@/types/documents";
import type { ClassificationDecisionStatus } from "@/domain/taxonomy/classification-decision-status";
import type { DocumentRenderStatus } from "@/domain/taxonomy/document-render-status";
import type { DocumentType } from "@/domain/taxonomy/document-type";
import type { ShipmentStatus } from "@/domain/taxonomy/shipment-status";
import type { TransportMode } from "@/domain/taxonomy/transport-mode";
import type { WasteClassification } from "@/domain/taxonomy/waste-classification";
import type { IsoTimestamp, Sha256, Uuid } from "@/types/common";

/** Classification and document contracts — `ERD.md` §7. */

// --- classification_decision ------------------------------------------------

export type CreateClassificationDecision = AppendInput<ClassificationDecision>;

export interface ClassificationDecisionQuery extends BaseQuery {
  readonly batteryRecordId?: Uuid;
  readonly containerId?: Uuid;
  readonly shipmentId?: Uuid;
  readonly status?: ClassificationDecisionStatus;
  readonly wasteClassification?: WasteClassification;
  readonly governingRuleVersionId?: Uuid;
  /** "Show me every classification a person set by hand" (Rule 3.28) — one indexed query. */
  readonly isOverride?: boolean;
  /** The open rule-gap backlog: overridden toward less regulation, gap not yet closed. */
  readonly hasOpenRuleGap?: boolean;
}

/**
 * Append-only. **Re-deciding inserts a superseding row; nothing is edited**
 * (Rule 3.14), and exactly one row per record sits at `active` — never zero once
 * identified, never two (Rule 3.1).
 */
export type ClassificationDecisionRepository = AppendOnlyRepository<
  ClassificationDecision,
  CreateClassificationDecision,
  ClassificationDecisionQuery
>;

// --- shipment ---------------------------------------------------------------

export type CreateShipment = CreateInput<
  Shipment,
  | "shipmentNumber"
  | "offeredAt"
  | "shippedAt"
  | "receivedAt"
  | "receivedConfirmationRef"
  | "retentionExpiresOn"
  | "retentionRuleVersionId"
  | "airTransportBlockedReason"
  | "totalMassKg"
  | "totalEnergyWh"
>;

/**
 * `offeredAt` is not settable here — see {@link ShipmentRepository.offer}.
 *
 * `retentionExpiresOn` is computed from the resolved retention rule version at
 * ship time and stamped by the adapter. **Three-year retention is a rule
 * payload, never a literal**, and a delete trigger refuses before that date with
 * no override path in application code.
 */
export type UpdateShipment = UpdateInput<
  Shipment,
  | "shipmentNumber"
  | "offeredAt"
  | "retentionExpiresOn"
  | "retentionRuleVersionId"
  | "totalMassKg"
  | "totalEnergyWh"
>;

export interface ShipmentQuery extends BaseQuery {
  readonly status?: ShipmentStatus;
  readonly transportMode?: TransportMode;
  readonly shippedAfter?: IsoTimestamp;
  readonly shippedBefore?: IsoTimestamp;
}

export interface OfferShipment {
  readonly offeredAt: IsoTimestamp;
  readonly shipperSignatureName?: string;
}

export interface ShipmentRepository extends Repository<
  Shipment,
  CreateShipment,
  UpdateShipment,
  ShipmentQuery
> {
  /**
   * Transition a shipment to offered — **only if a `shipping_paper` and its
   * `document_render` exist**.
   *
   * The database enforces this too, with a trigger (`TECHNICAL_SPEC.md` §10.4).
   * The contract makes it a single call so the UI cannot construct the invalid
   * intermediate state, and the trigger holds when the contract has a bug.
   *
   * The same trigger blocks any air mode when any battery in any container on
   * this shipment carries a DDR flag, and **Rule 6.8 admits no override for any
   * role** — there is no bypass parameter here because there is no bypass.
   */
  offer(
    ctx: RequestContext,
    shipmentId: Uuid,
    input: OfferShipment,
  ): Promise<Shipment>;
}

// --- shipping_paper ---------------------------------------------------------

export type CreateShippingPaper = AppendInput<ShippingPaper>;

export interface ShippingPaperQuery extends BaseQuery {
  readonly shipmentId?: Uuid;
  readonly documentRenderId?: Uuid;
}

export type ShippingPaperRepository = AppendOnlyRepository<
  ShippingPaper,
  CreateShippingPaper,
  ShippingPaperQuery
>;

// --- container_label --------------------------------------------------------

export type CreateContainerLabel = AppendInput<ContainerLabel>;

export interface ContainerLabelQuery extends BaseQuery {
  readonly containerId?: Uuid;
  readonly documentRenderId?: Uuid;
}

export type ContainerLabelRepository = AppendOnlyRepository<
  ContainerLabel,
  CreateContainerLabel,
  ContainerLabelQuery
>;

// --- document_render --------------------------------------------------------

/**
 * **Rows exist only on a successful render.** There is no pending or failed
 * render row, because the table is immutable and a failed row could never be
 * corrected. A failure is an `audit_event` with
 * `event_type = 'document.render_failed'` carrying the full input snapshot, the
 * error code and the correlation id — **so a failed render is as auditable as a
 * successful one** (`TECHNICAL_SPEC.md` §10.4).
 */
export type CreateDocumentRender = AppendInput<
  DocumentRender,
  "supersededAt" | "verificationCode"
>;

export interface DocumentRenderQuery extends BaseQuery {
  readonly documentType?: DocumentType;
  readonly status?: DocumentRenderStatus;
  readonly shipmentId?: Uuid;
  readonly containerId?: Uuid;
  readonly batteryRecordId?: Uuid;
  readonly verificationCode?: string;
  readonly contentHash?: Sha256;
}

/** What a verification returns. See {@link DocumentRenderRepository.verify}. */
export interface DocumentVerification {
  readonly documentRenderId: Uuid;
  /** The stored bytes still hash to `content_hash`. */
  readonly bytesMatch: boolean;
  /** The stored `input_snapshot` still hashes to `input_snapshot_hash`. */
  readonly inputSnapshotMatches: boolean;
  readonly verificationCode: string;
  readonly verifiedAt: IsoTimestamp;
}

export interface DocumentRenderRepository extends AppendOnlyRepository<
  DocumentRender,
  CreateDocumentRender,
  DocumentRenderQuery
> {
  /**
   * The stored bytes.
   *
   * **A reprint serves these; it never re-renders** — that is what makes "a
   * reprint proves it is the same document" true (`TECHNICAL_SPEC.md` §8.4). The
   * content hash is re-checked on every read, and a mismatch is a
   * `DOCUMENT_INTEGRITY` failure that alerts immediately rather than a document
   * that gets served anyway. A reprint is an `audit_event`, not a counter on an
   * immutable row.
   */
  readBytes(
    ctx: RequestContext,
    id: Uuid,
  ): Promise<{
    readonly bytes: Uint8Array;
    readonly contentHash: Sha256;
    readonly byteSize: number;
  }>;

  /** Re-hash the stored bytes and the stored input snapshot and compare. */
  verify(ctx: RequestContext, id: Uuid): Promise<DocumentVerification>;

  /**
   * Mark a render superseded by a later one — **the only permitted update**,
   * applied by trigger on the old row when a replacement is issued.
   */
  markSuperseded(
    ctx: RequestContext,
    id: Uuid,
    supersededByDocumentRenderId: Uuid,
  ): Promise<DocumentRender>;
}
