import type {
  Attributed,
  Created,
  Decimal,
  IsoDate,
  IsoTimestamp,
  JsonObject,
  PostalAddress,
  Sha256,
  TenantScoped,
  Timestamped,
  Uuid,
} from "@/types/common";
import type { ClassificationBasisCode } from "@/domain/taxonomy/classification-basis-code";
import type { ClassificationDecisionScope } from "@/domain/taxonomy/classification-decision-scope";
import type { ClassificationDecisionStatus } from "@/domain/taxonomy/classification-decision-status";
import type { DocumentRenderStatus } from "@/domain/taxonomy/document-render-status";
import type { DocumentType } from "@/domain/taxonomy/document-type";
import type { PackagingException } from "@/domain/taxonomy/packaging-exception";
import type { PackingGroup } from "@/domain/taxonomy/packing-group";
import type { ShipmentStatus } from "@/domain/taxonomy/shipment-status";
import type { TransportMode } from "@/domain/taxonomy/transport-mode";
import type { UnTransportIdentifier } from "@/domain/taxonomy/un-transport-identifier";
import type { WasteClassification } from "@/domain/taxonomy/waste-classification";
import type { AppliedRuleVersion } from "@/domain/rules/outcome";

/**
 * Classification and documents — `ERD.md` §7.
 *
 * `classification_decision` · `shipment` · `shipping_paper` · `container_label`
 * · `document_render`.
 */

/**
 * The light waste category versus full hazardous decision, **with its reasoning
 * recorded** — **APPEND-ONLY**.
 *
 * The highest-value logic asset in the product, and the row an audit two years
 * later actually reads. **The reasoning is the product, not a by-product.**
 *
 * A decision is never edited. Re-deciding inserts a superseding row (Rule 3.14),
 * and exactly one row per record sits at `active` — never zero once identified,
 * never two (Rule 3.1), enforced by a partial unique index.
 */
export interface ClassificationDecision extends TenantScoped, Created {
  readonly id: Uuid;
  /**
   * Which subject was decided; matches whichever id below is non-null. T-58.
   */
  readonly decisionScope: ClassificationDecisionScope;
  readonly batteryRecordId: Uuid | null;
  readonly containerId: Uuid | null;
  readonly shipmentId: Uuid | null;
  /**
   * **The site's jurisdiction, not the organization's headquarters** (Rule 3.5).
   * An organization with sites in two states classifies the same battery two
   * different ways, correctly.
   */
  readonly jurisdictionId: Uuid;
  /**
   * T-45. `blocked` is a real state, not an error — a missing input blocks and
   * is never assumed (Rules 3.4, 3.10), and no document issues from it
   * (Rules 3.12, 5.3).
   */
  readonly status: ClassificationDecisionStatus;
  /** T-13. */
  readonly wasteClassification: WasteClassification;
  /** T-14. Minimum one. Why this outcome was reached, as a queryable set alongside `reasoning`. */
  readonly basisCodes: readonly ClassificationBasisCode[];
  /** Plain language. Shown to the user, printed on exports. */
  readonly reasoning: string;
  /**
   * **The version in force on the record's intake date, not today's** (Rule 3.6).
   * Indexed, so "everything decided under version X" is one query.
   */
  readonly governingRuleVersionId: Uuid;
  /** Every applied rule with its citation **as it read that day**. */
  readonly evaluationTrace: readonly AppliedRuleVersion[];
  /** The exact inputs, frozen. */
  readonly inputsSnapshot: JsonObject;
  readonly decidedAt: IsoTimestamp;
  /** Null when evaluated by the system. */
  readonly decidedBy: Uuid | null;
  /** Re-deciding inserts; nothing is edited (Rule 3.14). */
  readonly supersedesClassificationDecisionId: Uuid | null;

  // --- The P6 override (Rules 3.26–3.28) -----------------------------------

  /**
   * True only on a decision a human set directly.
   *
   * **The ordinary fix remains correcting the rule data and letting Rules 3.15
   * and 3.17 re-derive; an override is the exception, not the tool.**
   */
  readonly isOverride: boolean;
  /** Required in effect when `isOverride`. Rule 3.26 requires a stated reason on the decision. */
  readonly overrideReason: string | null;
  /** **P6 only.** No other role may override — not P1, P2, P3, P4, and never P5. */
  readonly overriddenBy: Uuid | null;
  /**
   * **What the rules produced**, stored on the override row beside what the human
   * substituted, so an auditor reads both from one row (Rule 3.27). A CHECK
   * constraint makes an override without its superseded decision impossible.
   */
  readonly derivedWasteClassification: WasteClassification | null;
  /** Set when the override moves the record to a **less** regulated outcome (Rule 3.28). */
  readonly isLessRegulatedThanDerived: boolean;
  /** The jurisdiction rule gap that made a less-regulated override necessary. */
  readonly ruleGapReportedAt: IsoTimestamp | null;
  /**
   * The corrected version that closed the gap. **The gap stays open until this is
   * set** — so overriding toward less regulation without fixing the underlying
   * rule is a visible, queryable backlog rather than a habit.
   */
  readonly ruleGapClosedByRuleVersionId: Uuid | null;
}

/** A movement of containers off site. Carries the retention obligation. */
export interface Shipment extends TenantScoped, Timestamped, Attributed {
  readonly id: Uuid;
  /** From `organization.shipment_seq`. */
  readonly shipmentNumber: string;
  /**
   * T-28. `ready` means every Rule 5.3 precondition is met and documents are not
   * yet issued; `exception` is a departed shipment that went wrong (EC-47).
   */
  readonly status: ShipmentStatus;
  readonly originAddress: PostalAddress;
  readonly destinationFacilityName: string;
  readonly destinationAddress: PostalAddress;
  /** Receiving facility regulatory identifier. */
  readonly destinationIdentifier: string | null;
  readonly transporterName: string | null;
  readonly transporterIdentifier: string | null;
  readonly carrierName: string | null;
  /**
   * T-20. Eligibility is determined from the rule version in force **on the
   * shipment date**; the system never assumes it (Rules 5.19, 5.20).
   */
  readonly packagingExceptions: readonly PackagingException[];
  /**
   * T-18. **A trigger blocks any air mode when any battery on this shipment
   * carries `isAirTransportProhibited`**, and Rule 6.8 admits no override for
   * any role.
   */
  readonly transportMode: TransportMode;
  /** Recorded when an air attempt is refused. The refusal is itself audited (Rule 12.6). */
  readonly airTransportBlockedReason: string | null;
  readonly classificationDecisionId: Uuid | null;
  readonly totalMassKg: Decimal | null;
  readonly totalEnergyWh: Decimal | null;
  /**
   * A trigger refuses this transition without a `shipping_paper` whose
   * `document_render.content_hash` is non-null. **A bug in a Server Action cannot
   * produce a shipment without a paper** (`TECHNICAL_SPEC.md` §10.4).
   */
  readonly offeredAt: IsoTimestamp | null;
  readonly shippedAt: IsoTimestamp | null;
  readonly receivedAt: IsoTimestamp | null;
  readonly receivedConfirmationRef: string | null;
  /**
   * **Computed from the resolved retention rule version at ship time and stamped
   * here.** Three-year retention is a rule payload, never a literal; a
   * jurisdiction requiring longer carries a different payload and works with no
   * code change. A delete trigger refuses before this date, with no override path.
   */
  readonly retentionExpiresOn: IsoDate | null;
  readonly retentionRuleVersionId: Uuid | null;
}

/**
 * The legal document that travels with the shipment — **APPEND-ONLY**.
 *
 * **Required on every shipment regardless of waste classification** (Rule 5.4).
 * A correction is a new paper; the old one stays readable (Rule 5.15).
 */
export interface ShippingPaper extends TenantScoped, Created {
  readonly id: Uuid;
  readonly shipmentId: Uuid;
  /** **Required** — a legal record cannot exist without the bytes that were issued. */
  readonly documentRenderId: Uuid;
  /** T-17. Derived from the catalog entry plus the active decision, **never free-typed** (Rule 5.9). */
  readonly unIdentifier: UnTransportIdentifier;
  readonly properShippingName: string;
  readonly hazardClass: string;
  /** T-19. */
  readonly packingGroup: PackingGroup | null;
  /** Assembled in the required sequence by `src/domain/transport/basic-description.ts`. */
  readonly basicDescription: string;
  readonly numberAndTypeOfPackages: string;
  readonly totalQuantityDescription: string;
  /**
   * **The 24-hour emergency contact number. Mandatory. No render happens without
   * it** (Rules 5.6, 5.7) — a document missing this is legally invalid, looks
   * fine, and may already be travelling with a shipment (`RUNBOOK.md` F-1).
   */
  readonly emergencyResponsePhone: string;
  /** **Emergency response information reference. Mandatory.** */
  readonly emergencyResponseContractRef: string;
  readonly emergencyResponseGuideNumber: string | null;
  readonly shipperCertificationText: string;
  readonly shipperSignatureName: string | null;
  readonly shipperSignedAt: IsoTimestamp | null;
  readonly specialPermitRefs: readonly string[] | null;
  readonly governingRuleVersionId: Uuid;
  readonly evaluationTrace: readonly AppliedRuleVersion[];
  /** A correction is a new paper; the old one stays readable. */
  readonly supersedesShippingPaperId: Uuid | null;
  readonly generatedAt: IsoTimestamp;
  readonly generatedBy: Uuid;
}

/**
 * The container label, with the accumulation start date and a QR to the
 * container record — **APPEND-ONLY**.
 */
export interface ContainerLabel extends TenantScoped, Created {
  readonly id: Uuid;
  readonly containerId: Uuid;
  readonly documentRenderId: Uuid;
  /**
   * The regulatory phrase as required by the governing rule version.
   *
   * **Rule-version data, reproduced verbatim including its own casing.** It is
   * never sentence-cased, pluralised, truncated or improved by a display layer
   * (`TAXONOMY.md` §4.5).
   */
  readonly labelText: string;
  /** Contents-description vocabulary owned by `TAXONOMY.md`; the regulatory phrase is rule data (Rule 4.18). */
  readonly contentsDescription: string;
  /**
   * **Must equal the container's current value or the container cannot ship**
   * (Rules 4.19, 4.22).
   */
  readonly accumulationStartedAt: IsoTimestamp;
  readonly handlerIdentifier: string | null;
  /** Permanent URL to `/containers/[id]`. */
  readonly qrPayloadUrl: string;
  readonly governingRuleVersionId: Uuid;
  readonly evaluationTrace: readonly AppliedRuleVersion[];
  readonly supersedesContainerLabelId: Uuid | null;
  readonly generatedAt: IsoTimestamp;
  readonly generatedBy: Uuid;
}

/**
 * Every generated PDF instance — **APPEND-ONLY**. Immutable bytes, immutable row.
 *
 * **Rows exist only on a successful render.** A failed render is an
 * `audit_event` with `event_type = 'document.render_failed'`, never a row —
 * because the table is immutable and a failed row could never be corrected
 * (`TECHNICAL_SPEC.md` §10.4). If bytes cannot be written to the bucket, the
 * transaction rolls back: there is never a row pointing at bytes that are not
 * there.
 *
 * **There is no reprint counter.** A counter would require updating an immutable
 * row; reprints are `audit_event` rows.
 */
export interface DocumentRender extends TenantScoped, Created {
  /** Printed in the PDF footer. */
  readonly id: Uuid;
  /** T-38. */
  readonly documentType: DocumentType;
  readonly shipmentId: Uuid | null;
  readonly containerId: Uuid | null;
  readonly batteryRecordId: Uuid | null;
  readonly evidencePackId: Uuid | null;
  readonly templateKey: string;
  /** Bumped on change; **never silently alters an issued document**. */
  readonly templateVersion: string;
  readonly rendererName: string;
  readonly rendererVersion: string;
  /** Everything the render consumed. */
  readonly inputSnapshot: JsonObject;
  /** SHA-256 of `inputSnapshot`, computed **before** rendering. */
  readonly inputSnapshotHash: Sha256;
  /**
   * First 12 characters of `inputSnapshotHash`. Printed on the page — the
   * content hash cannot be, it would be circular.
   */
  readonly verificationCode: string;
  readonly ruleVersionsApplied: readonly AppliedRuleVersion[];
  /** Private bucket, overwrite disabled. */
  readonly storageObjectPath: string;
  /** SHA-256 of the stored bytes. Served as the `ETag`; re-checked on every read. */
  readonly contentHash: Sha256;
  readonly byteSize: number;
  readonly pageCount: number | null;
  readonly renderedAt: IsoTimestamp;
  readonly renderedBy: Uuid;
  readonly renderDurationMs: number | null;
  /**
   * T-39. **Rule 5.28 governs `draft`:** watermarked not-valid, satisfies no
   * documentation obligation, never accompanies a shipment or a container, and
   * closes no Rule 5.3 precondition. Issuing is a separate deliberate act.
   */
  readonly status: DocumentRenderStatus;
  readonly supersedesDocumentRenderId: Uuid | null;
  /** Set on the old row when a replacement is issued — the **only** permitted update. */
  readonly supersededAt: IsoTimestamp | null;
}
