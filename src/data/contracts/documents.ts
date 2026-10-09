import type { RequestContext } from "./context";
import type { StorageWriteAttribution } from "./storage";
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
import type { ContainerLabelContent } from "@/domain/documents/build-container-label-payload";
import type { AppliedRuleVersion, RuleOutcome } from "@/domain/rules/outcome";
import type { ResolvedRule } from "@/domain/rules/resolve";
import type { ShippingPaperPayload } from "@/domain/transport/shipping-paper";
import type { Container } from "@/types/storage";
import type {
  IsoTimestamp,
  JsonObject,
  PostalAddress,
  Sha256,
  Uuid,
} from "@/types/common";

/** Classification and document contracts — `ERD.md` §7. */

// --- rendering, as a write receives it ----------------------------------------

/**
 * The identity the adapter mints for a render **before** it is composed — the
 * render id is printed in the footer and sits in the snapshot, so it must
 * exist before the bytes do (`TECHNICAL_SPEC.md` §8.1, §8.4).
 */
export interface DocumentRenderIdentity {
  readonly documentRenderId: Uuid;
  readonly renderedAt: IsoTimestamp;
  readonly status: Extract<DocumentRenderStatus, "issued" | "draft">;
}

/** One render, composed by the document engine for the identity it was given. */
export interface ComposedDocument {
  readonly documentType: DocumentType;
  /** Everything the render consumed. Its `document` carries the identity it was composed for. */
  readonly inputSnapshot: JsonObject;
  /** SHA-256 of the canonical snapshot, computed before rendering. */
  readonly inputSnapshotHash: Sha256;
  readonly templateKey: string;
  readonly templateVersion: string;
  readonly rendererName: string;
  readonly rendererVersion: string;
  readonly bytes: Uint8Array;
  readonly pageCount: number;
  readonly ruleVersionsApplied: readonly AppliedRuleVersion[];
  readonly renderDurationMs: number | null;
}

/**
 * Renders one document for the identity the adapter minted.
 *
 * **Called inside the write**, so issuing is one operation (§8.2): the adapter
 * mints the id, composes, re-hashes the snapshot it was handed, hashes the
 * bytes, stores them where nothing can overwrite them, and only then appends
 * the rows. The adapter never renders and the composer never writes — the
 * renderer stays in `src/lib`, the data stays behind the seam, and a composer
 * that throws leaves no row and no bytes behind (a failed render is an
 * `audit_event`, never a row — §10.4).
 */
export type DocumentComposer = (
  identity: DocumentRenderIdentity,
) => Promise<ComposedDocument>;

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
export interface ClassificationDecisionRepository extends AppendOnlyRepository<
  ClassificationDecision,
  CreateClassificationDecision,
  ClassificationDecisionQuery
> {
  /**
   * Mark a decision superseded by a later one — **the only permitted update**,
   * applied by trigger on the old row when a re-classification is appended
   * (Rule 3.14; T-45). The old row keeps its inputs, rule version, citation and
   * reasoning intact, which is what lets an auditor read the decision that
   * governed a shipment years after the rule changed (Rules 12.15, 12.16).
   *
   * Refuses when the superseding row does not exist.
   */
  markSuperseded(
    ctx: RequestContext,
    id: Uuid,
    supersededByClassificationDecisionId: Uuid,
  ): Promise<ClassificationDecision>;
}

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
  /** Exact `destination_facility_name` — the `/shipments` destination filter. */
  readonly destinationFacilityName?: string;
  /**
   * Any record in any of the shipment's containers carries a DDR flag or the
   * air prohibition — the containing-damaged-records filter (`UX_SPEC.md`
   * §3.11). Membership derives through the container (`ERD.md` §11.1).
   */
  readonly holdsDamagedRecord?: boolean;
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
   * Transition a shipment to offered — **only if its current `shipping_paper`
   * is issued and its render's bytes are stored**.
   *
   * **One path with {@link ShipmentRepository.issueShippingPaper}**: issuing
   * is the act that offers (it stamps `offeredAt` and `documents_issued` in
   * the same operation), and both read the one predicate — a current issued
   * paper with bytes — that departure reads too. Called on a shipment already
   * offered it changes nothing; called on one without that paper it refuses.
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

  /**
   * **Assemble a shipment** from containers, with its transport details — one
   * operation, all or nothing (Flow B1–B2).
   *
   * The adapter re-runs step 1's refusals on every container
   * (`admitContainerToShipment`: Rules 4.19, 4.22, 5.2, 5.24, 5.25, 6.1, 6.13)
   * and the air block (Rules 6.7, 6.8) against the rows it holds, creates the
   * shipment at `draft`, links each container (`container.shipment_id`, the
   * only membership link), and writes `shipment.created`. An air request
   * holding a damaged, defective or recalled record is refused and the
   * attempt is audited as `denial.recorded` (Rule 12.6).
   */
  assemble(ctx: RequestContext, input: ShipmentAssembly): Promise<Shipment>;

  /**
   * Replace a shipment's containers before departure. **Where a shipping paper
   * is issued, the change voids it immediately** (Rule 5.13): the render is
   * kept and marked void with the reason and the actor (Rule 5.14,
   * `document_render.voided`), and the shipment returns to `draft` for
   * regeneration. Added containers pass step 1's refusals again; an addition
   * that would put a damaged record on an air shipment is refused (Rule 6.13).
   */
  changeContents(
    ctx: RequestContext,
    input: ShipmentContentsChange,
  ): Promise<ShipmentContentsChangeResult>;

  /**
   * Record the mode, carrier and destination (Rules 5.10, 5.16). Frozen once
   * documents are issued (T-18). **Air with a damaged, defective or recalled
   * record in scope is refused, the refusal is recorded on the shipment
   * (`air_transport_blocked_reason`) and audited** — there is no parameter
   * that admits it, for any role (Rule 6.8).
   */
  recordTransport(
    ctx: RequestContext,
    input: ShipmentTransportChange,
  ): Promise<Shipment>;

  /**
   * T-28's derived `ready`: move between `draft` and `ready` to match the
   * Rule 5.3 precondition set the caller just evaluated with
   * `buildShippingPaperPayload`. Refuses every other status. **Not a way to
   * declare a shipment ready** — the caller passes the builder's answer.
   */
  settleReadiness(
    ctx: RequestContext,
    input: ShipmentReadiness,
  ): Promise<Shipment>;

  /**
   * **Issue the shipping paper** — render it, hash it, store the bytes at
   * `org/{org}/shipping_paper/{render_id}.pdf` with overwrite disabled, write
   * the `document_render` with its content hash, byte size, page count, input
   * snapshot and verification code, write the `shipping_paper`, and move the
   * shipment to `documents_issued` with `offeredAt` stamped — **one
   * operation** (Flow B4; `TECHNICAL_SPEC.md` §8.2). A render that fails
   * leaves no row and no bytes, and is audited as `document.render_failed`.
   *
   * The payload is the builder's, recomputed server-side at commit; the
   * adapter refuses one that no longer describes the shipment's contents
   * (Rule 5.13), names a different shipment, or carries a number the
   * organization no longer holds, and re-checks the air block. A paper is
   * never edited and never re-issued over a current one (Rule 5.12) — a
   * correction follows a void and references what it replaces (Rule 5.15).
   */
  issueShippingPaper(
    ctx: RequestContext,
    input: ShippingPaperIssue,
  ): Promise<IssuedShippingPaper>;

  /**
   * **Void the issued paper, with a reason** (D-58 item 8; Rules 5.13, 5.14) —
   * one audited act. The render is kept, marked `voided`, with the reason and
   * the actor on its `document_render.voided` row; its bytes stay readable;
   * the shipment returns to `draft`, so its transport details reopen (T-18)
   * and a new paper must be generated before it can depart. A void without a
   * stated reason is refused.
   */
  voidShippingPaper(
    ctx: RequestContext,
    input: ShippingPaperVoid,
  ): Promise<VoidedShippingPaper>;

  /**
   * **Departure** (Rule 5.17) — one operation: the shipment to `dispatched`
   * with its retention date stamped from the resolved rule (Rule 5.18), every
   * container to `shipped`, **the storage clocks of what left stopped** (Rule
   * 4.7) and their open clock alerts resolved, and every record to `shipped`.
   * Refused, stated, by `admitDeparture` (Rules 5.13, 5.16, 6.7, 6.16).
   */
  recordDeparture(
    ctx: RequestContext,
    input: ShipmentDeparture,
  ): Promise<ShipmentDepartureResult>;

  /**
   * **Arrival** (Rule 5.26) — the shipment closes, through `delivered`, and
   * its records move to closed out, which is terminal.
   */
  recordArrival(ctx: RequestContext, input: ShipmentArrival): Promise<Shipment>;
}

/** Destination and transporter details a person records — Rules 5.2, 5.10, 5.16. */
export interface ShipmentTransportDetails {
  readonly transportMode: TransportMode;
  readonly destinationFacilityName: string;
  readonly destinationAddress: PostalAddress;
  /** Receiving facility regulatory identifier, where one applies. */
  readonly destinationIdentifier: string | null;
  readonly carrierName: string;
  /** Any required transporter identifier. */
  readonly transporterIdentifier: string | null;
}

export interface ShipmentAssembly {
  readonly containerIds: readonly Uuid[];
  readonly transport: ShipmentTransportDetails;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface ShipmentContentsChange {
  readonly shipmentId: Uuid;
  /** The shipment's containers after the change — the whole set, not a delta. */
  readonly containerIds: readonly Uuid[];
  /**
   * Why. **Required where the change voids an issued paper** — a void
   * records its reason and its actor (Rule 5.14).
   */
  readonly reason: string | null;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface ShipmentContentsChangeResult {
  readonly shipment: Shipment;
  readonly addedContainerIds: readonly Uuid[];
  readonly removedContainerIds: readonly Uuid[];
  /** The render this change voided, where a paper was issued (Rule 5.13). */
  readonly voidedDocumentRenderId: Uuid | null;
}

export interface ShipmentTransportChange {
  readonly shipmentId: Uuid;
  readonly transport: ShipmentTransportDetails;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface ShipmentReadiness {
  readonly shipmentId: Uuid;
  /** `buildShippingPaperPayload`'s checklist, as `preDocumentStatus` reads it. */
  readonly readiness: Extract<ShipmentStatus, "draft" | "ready">;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface ShippingPaperIssue {
  readonly shipmentId: Uuid;
  /** The builder's complete outcome, computed at commit from the rows. */
  readonly paper: RuleOutcome<ShippingPaperPayload>;
  /** Renders exactly that outcome, for the render id the adapter mints. */
  readonly compose: DocumentComposer;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface IssuedShippingPaper {
  readonly shipment: Shipment;
  readonly shippingPaper: ShippingPaper;
  readonly documentRender: DocumentRender;
}

export interface ShippingPaperVoid {
  readonly shipmentId: Uuid;
  /** Required. A void records its reason and its actor (Rule 5.14). */
  readonly reason: string;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface VoidedShippingPaper {
  readonly shipment: Shipment;
  readonly voidedDocumentRenderId: Uuid;
}

export interface ShipmentDeparture {
  readonly shipmentId: Uuid;
  /**
   * The shipment-record retention rule in force at the site on the ship date
   * (Rules 5.18, 12.20). The caller resolves it; the adapter refuses one not
   * in force on the date it computes, and refuses departure with none.
   */
  readonly retentionRule: ResolvedRule | null;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface ShipmentDepartureResult {
  readonly shipment: Shipment;
  /** Every clock departure stopped — the departing containers' and records', and no other. */
  readonly stoppedClockIds: readonly Uuid[];
  readonly shippedRecordIds: readonly Uuid[];
}

export interface ShipmentArrival {
  readonly shipmentId: Uuid;
  /** The receiving facility's receipt reference, where one was given. */
  readonly receivedConfirmationRef: string | null;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
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

export interface ContainerLabelRepository extends AppendOnlyRepository<
  ContainerLabel,
  CreateContainerLabel,
  ContainerLabelQuery
> {
  /**
   * **Issue a container label** — one operation (Rules 4.18–4.21;
   * `TECHNICAL_SPEC.md` §8.2): render it, store the bytes at
   * `org/{org}/container_label/{render_id}.pdf` with overwrite disabled,
   * append the `document_render` and the `container_label`, point
   * `container.current_container_label_id` at the new label, and **mark the
   * label it replaces superseded** — its render kept in full and readable,
   * the new one linked to it (Rules 4.20, 5.15).
   *
   * The content is the builder's, computed from the rows; the adapter refuses
   * one whose start date or contents no longer match the container's
   * (Rule 4.19), and refuses a container that has shipped or been retired.
   */
  issue(
    ctx: RequestContext,
    input: ContainerLabelIssue,
  ): Promise<IssuedContainerLabel>;
}

export interface ContainerLabelIssue {
  readonly containerId: Uuid;
  /** `buildContainerLabelContent`'s outcome, computed at commit from the rows. */
  readonly label: RuleOutcome<ContainerLabelContent>;
  /** Renders exactly that content, for the render id the adapter mints. */
  readonly compose: DocumentComposer;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
}

export interface IssuedContainerLabel {
  readonly container: Container;
  readonly containerLabel: ContainerLabel;
  readonly documentRender: DocumentRender;
  /** The render this label superseded, where one was in force. */
  readonly supersededDocumentRenderId: Uuid | null;
}

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

/** A draft, stored because someone printed or downloaded it (D-58 item 9). */
export interface DocumentDraftRender {
  /** The one document this unit drafts. */
  readonly documentType: Extract<DocumentType, "shipping_paper">;
  readonly shipmentId: Uuid;
  /** Renders the draft, watermarked, for the render id the adapter mints. */
  readonly compose: DocumentComposer;
  readonly at: IsoTimestamp;
  readonly attribution: StorageWriteAttribution;
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
   * that gets served anyway. A render with no bytes stored behind it is
   * `NOT_FOUND` — nothing is served in place of a document that is not there.
   * A reprint is an `audit_event`, not a counter on an immutable row.
   */
  readBytes(
    ctx: RequestContext,
    id: Uuid,
  ): Promise<{
    readonly bytes: Uint8Array;
    readonly contentHash: Sha256;
    readonly byteSize: number;
  }>;

  /**
   * Re-hash the stored bytes and the stored input snapshot and compare. A
   * render with no bytes behind it cannot be verified, and says so as a
   * `DOCUMENT_INTEGRITY` failure — never as a pass.
   */
  verify(ctx: RequestContext, id: Uuid): Promise<DocumentVerification>;

  /**
   * Store a **draft** render (Rule 5.28; D-58 item 9) — composed, hashed and
   * stored exactly as an issued render is, at `T-39 draft`, watermarked not
   * valid. **Only when someone prints or downloads one**, never per page view.
   * A draft writes no `shipping_paper`, closes no precondition and can never
   * be offered, departed on or issued from.
   */
  storeDraft(
    ctx: RequestContext,
    input: DocumentDraftRender,
  ): Promise<DocumentRender>;

  /**
   * Mark a render superseded by a later one — **the only permitted update**,
   * applied by trigger on the old row when a replacement is issued, so it
   * goes through the definer door and is never refused by role.
   */
  markSuperseded(
    ctx: RequestContext,
    id: Uuid,
    supersededByDocumentRenderId: Uuid,
  ): Promise<DocumentRender>;
}
