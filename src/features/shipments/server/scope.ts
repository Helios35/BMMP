import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import {
  containerLabelFlags,
  labelInForce,
  type ContainerLabelFlags,
} from "@/domain/storage/container-label-flags";
import type { ShipmentStatus } from "@/domain/taxonomy/shipment-status";
import type { AirTransportSubject } from "@/domain/transport/air-transport";
import type { ShipmentContainerFacts } from "@/domain/transport/container-admission";
import type { ShippingPaperRecordInput } from "@/domain/transport/shipping-paper";
import { catalogEntryTitle } from "@/features/catalog/catalog-entry-display";
import type { BatteryRecord } from "@/types/battery-record";
import type { CatalogEntry } from "@/types/catalog";
import type { Uuid } from "@/types/common";
import type { DamageAssessment } from "@/types/condition";
import type { ClassificationDecision, Shipment } from "@/types/documents";
import type { Container } from "@/types/storage";

/**
 * Everything a shipment's rules read about the containers in scope, read once
 * through `src/data` — `UX_SPEC.md` §3.12, §3.13.
 *
 * **Step 1's admission, step 2's air block and step 3's checklist read this
 * one shape.** Each projects it into the input of a pure function in
 * `src/domain/transport` — the same functions the adapter runs again at commit
 * — so no step re-derives a decision another step already made.
 */

const RECORD_LIMIT = 500;
const LABEL_LIMIT = 50;
const HISTORY_LIMIT = 20;

/** Shipments that have not departed, and so hold their containers (Rule 5.25). */
export const OPEN_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "draft",
  "ready",
  "documents_issued",
];

export interface ScopeRecord {
  readonly record: BatteryRecord;
  readonly catalogEntry: CatalogEntry | null;
  /** The record's governing decision — the newest that is not superseded. */
  readonly classification: ClassificationDecision | null;
  /** The current, human-confirmed assessment (T-46 `assessed_*`), or null (Rule 6.1). */
  readonly assessment: DamageAssessment | null;
  /** The citation of `condition_rule_version_id` (Rule 6.9). */
  readonly conditionCitation: string | null;
}

export interface ScopeContainer {
  readonly container: Container;
  readonly labelFlags: ContainerLabelFlags;
  readonly records: readonly ScopeRecord[];
  /** The open shipment it is on, where it is on one. */
  readonly openShipment: Shipment | null;
}

async function governingDecision(
  ctx: RequestContext,
  recordId: Uuid,
): Promise<ClassificationDecision | null> {
  const page = await data.classificationDecisions.list(ctx, {
    batteryRecordId: recordId,
    limit: HISTORY_LIMIT,
  });
  return (
    page.items.find((decision) => decision.status !== "superseded") ?? null
  );
}

async function currentAssessment(
  ctx: RequestContext,
  recordId: Uuid,
): Promise<DamageAssessment | null> {
  const page = await data.damageAssessments.list(ctx, {
    batteryRecordId: recordId,
    isCurrent: true,
    limit: HISTORY_LIMIT,
  });
  return (
    page.items.find(
      (assessment) =>
        assessment.status === "assessed_sound" ||
        assessment.status === "assessed_damaged",
    ) ?? null
  );
}

/** Read the scope of a set of containers. Order is the containers' order. */
export async function readContainerScope(
  ctx: RequestContext,
  containers: readonly Container[],
): Promise<readonly ScopeContainer[]> {
  if (containers.length === 0) return [];
  const recordsPage = await data.batteryRecords.list(ctx, {
    containerIds: containers.map((container) => container.id),
    excludeVoided: true,
    excludeDrafts: true,
    limit: RECORD_LIMIT,
  });

  const catalog = new Map<Uuid, CatalogEntry | null>();
  const citations = new Map<Uuid, string | null>();
  const shipments = new Map<Uuid, Shipment | null>();

  const scopeRecords = new Map<Uuid, ScopeRecord[]>();
  for (const record of recordsPage.items) {
    if (record.containerId === null) continue;
    let entry: CatalogEntry | null = null;
    if (record.catalogEntryId !== null) {
      if (!catalog.has(record.catalogEntryId)) {
        catalog.set(
          record.catalogEntryId,
          await data.catalogEntries.get(ctx, record.catalogEntryId),
        );
      }
      entry = catalog.get(record.catalogEntryId) ?? null;
    }
    let citation: string | null = null;
    if (record.conditionRuleVersionId !== null) {
      if (!citations.has(record.conditionRuleVersionId)) {
        const version = await data.ruleVersions.get(
          ctx,
          record.conditionRuleVersionId,
        );
        citations.set(record.conditionRuleVersionId, version?.citation ?? null);
      }
      citation = citations.get(record.conditionRuleVersionId) ?? null;
    }
    const list = scopeRecords.get(record.containerId) ?? [];
    list.push({
      record,
      catalogEntry: entry,
      classification: await governingDecision(ctx, record.id),
      assessment: await currentAssessment(ctx, record.id),
      conditionCitation: citation,
    });
    scopeRecords.set(record.containerId, list);
  }

  const scope: ScopeContainer[] = [];
  for (const container of containers) {
    const records = (scopeRecords.get(container.id) ?? []).sort((a, b) =>
      a.record.recordNumber.localeCompare(b.record.recordNumber),
    );
    const labels = await data.containerLabels.list(ctx, {
      containerId: container.id,
      limit: LABEL_LIMIT,
    });
    let openShipment: Shipment | null = null;
    if (container.shipmentId !== null) {
      if (!shipments.has(container.shipmentId)) {
        shipments.set(
          container.shipmentId,
          await data.shipments.get(ctx, container.shipmentId),
        );
      }
      const shipment = shipments.get(container.shipmentId) ?? null;
      openShipment =
        shipment !== null && OPEN_SHIPMENT_STATUSES.includes(shipment.status)
          ? shipment
          : null;
    }
    scope.push({
      container,
      labelFlags: containerLabelFlags({
        contentCount: records.length,
        currentContainerLabelId: container.currentContainerLabelId,
        accumulationStartedAt: container.accumulationStartedAt,
        label: labelInForce(container.currentContainerLabelId, labels.items),
      }),
      records,
      openShipment,
    });
  }
  return scope;
}

/** Step 1's admission input, for the shipment being built (`null` before it exists). */
export function admissionFacts(
  scope: ScopeContainer,
  shipmentId: Uuid | null,
): ShipmentContainerFacts {
  const { container } = scope;
  return {
    id: container.id,
    organizationId: container.organizationId,
    containerCode: container.containerCode,
    status: container.status,
    containerType: container.containerType,
    siteTimeZone: container.siteTimeZone,
    siteAddress: container.siteAddress,
    labelFlags: scope.labelFlags,
    contents: scope.records.map(({ record, assessment }) => ({
      recordId: record.id,
      recordNumber: record.recordNumber,
      ddrFlags: record.ddrFlags,
      isAirTransportProhibited: record.isAirTransportProhibited,
      hasDamageAssessment: assessment !== null,
    })),
    onOtherOpenShipment:
      scope.openShipment === null || scope.openShipment.id === shipmentId
        ? null
        : { shipmentNumber: scope.openShipment.shipmentNumber },
  };
}

/** Step 2's air input (Rule 6.9). */
export function airSubject(scope: ScopeRecord): AirTransportSubject {
  return {
    recordId: scope.record.id,
    recordNumber: scope.record.recordNumber,
    ddrFlags: scope.record.ddrFlags,
    isAirTransportProhibited: scope.record.isAirTransportProhibited,
    currentFindings: scope.assessment?.findingTypes ?? [],
    citation: scope.conditionCitation,
  };
}

/** Step 3's record input — the identifiers come from the matched catalog entry, never typed (Rule 5.9). */
export function paperRecordInput(
  scope: ScopeRecord,
  containerCode: string,
): ShippingPaperRecordInput {
  const { record, catalogEntry, classification } = scope;
  return {
    recordId: record.id,
    recordNumber: record.recordNumber,
    containerId: record.containerId ?? "",
    containerCode,
    status: record.status,
    chemistryConfirmed:
      record.chemistry !== null &&
      record.chemistry !== "unknown" &&
      record.chemistryConfirmedBy !== null,
    batteryMassKg: record.batteryMassKg,
    ddrFlags: record.ddrFlags,
    isAirTransportProhibited: record.isAirTransportProhibited,
    currentFindings: scope.assessment?.findingTypes ?? [],
    conditionCitation: scope.conditionCitation,
    shippingIdentity:
      catalogEntry === null
        ? null
        : {
            catalogEntryTitle: catalogEntryTitle(catalogEntry),
            unIdentifier: catalogEntry.unIdentifier,
            properShippingName: catalogEntry.properShippingName,
            hazardClass: catalogEntry.hazardClass,
            packingGroup: catalogEntry.packingGroup,
          },
    classification:
      classification === null
        ? null
        : {
            status: classification.status,
            wasteClassification: classification.wasteClassification,
            reasoning: classification.reasoning,
          },
  };
}

export function scopeRecords(
  scope: readonly ScopeContainer[],
): readonly ScopeRecord[] {
  return scope.flatMap((entry) => entry.records);
}
