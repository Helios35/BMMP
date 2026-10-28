import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { decimalText } from "@/components/storage/container-fill-meter";
import { lotStanding } from "@/domain/storage/lot";
import { CONTAINER_STATUS_LABELS } from "@/domain/taxonomy/container-status";
import { CONTAINER_TYPE_LABELS } from "@/domain/taxonomy/container-type";
import { LOT_STATUS_LABELS } from "@/domain/taxonomy/lot-status";
import { STORAGE_CLOCK_ALERT_BAND_LABELS } from "@/domain/taxonomy/storage-clock-alert-band";
import {
  admitContainerToShipment,
  admitLotToShipment,
  admitRecordAlone,
  type LotShipmentAdmission,
  type ShipmentAdmission,
  type ShipmentAdmissionTarget,
} from "@/domain/transport/container-admission";
import type { ContentsSummaryRecord } from "@/domain/transport/contents-summary";
import { CONTAINER_MASS_UNIT } from "@/features/containers/container-copy";
import { clocksByContainer } from "@/features/containers/server/read-containers";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { Shipment } from "@/types/documents";
import type { Container, Lot } from "@/types/storage";

import {
  admissionFacts,
  readContainerScope,
  type ScopeContainer,
} from "./scope";

/**
 * Step 1's sources — `UX_SPEC.md` §3.12; Flow B1; Rule 5.1.
 *
 * **Lots, containers and single batteries, mixed** — the three sources Rule
 * 5.1 names, each with the reason it would refuse, never a hidden row. A lot
 * ships as its containers and a single battery ships as its own labelled
 * container (the owner's calls in `b1a-08`), so every admission here is
 * `admitContainerToShipment` underneath — the function the adapter runs again
 * at commit — and the reason a row shows is the refusal the server would
 * give. Retired and shipped containers, and shipped or dissolved lots, have
 * ended and are not listed. Each row carries the facts the live summary adds
 * up — never a total the screen computed by itself.
 */

const CONTAINER_LIMIT = 200;
const CLOCK_LIMIT = 500;
const LOT_LIMIT = 100;

export interface ShipmentCandidate {
  readonly id: Uuid;
  readonly code: string;
  readonly typeLabel: string;
  readonly location: string | null;
  readonly statusLabel: string;
  readonly fillText: string | null;
  readonly clockTier: string | null;
  /** Two containers ship together only from one site (Rule 5.2). */
  readonly siteKey: string;
  readonly admission: ShipmentAdmission;
  readonly records: readonly ContentsSummaryRecord[];
  readonly onThisShipment: boolean;
}

/** A lot, chosen whole (Rule 5.1; T-25). */
export interface LotCandidate {
  readonly id: Uuid;
  readonly code: string;
  readonly description: string | null;
  readonly statusLabel: string;
  readonly memberCodes: readonly string[];
  readonly memberIds: readonly Uuid[];
  /** Rule 4.24 — the earliest accumulation start among its contents. */
  readonly earliestStart: IsoTimestamp | null;
  /** Rule 4.24 — any content container is overdue. */
  readonly isOverdue: boolean;
  /** Its containers' site, where they share one (Rule 5.2). */
  readonly siteKey: string | null;
  readonly admission: LotShipmentAdmission;
  readonly records: readonly ContentsSummaryRecord[];
  readonly onThisShipment: boolean;
}

/** One battery on its own — it ships as its own labelled container. */
export interface BatteryCandidate {
  readonly recordId: Uuid;
  readonly recordNumber: string;
  readonly containerId: Uuid;
  readonly containerCode: string;
  readonly admission: ShipmentAdmission;
  /** Where the way on is: the container it shares, to split it out. */
  readonly containerHref: string;
}

export interface ShipmentSources {
  readonly lots: readonly LotCandidate[];
  readonly containers: readonly ShipmentCandidate[];
  readonly batteries: readonly BatteryCandidate[];
}

export function siteKeyOf(container: Container): string {
  return `${container.siteTimeZone}|${JSON.stringify(container.siteAddress)}`;
}

function fillText(container: Container): string | null {
  if (container.currentNetMassKg === null) return null;
  return container.capacityKg === null
    ? `${decimalText(container.currentNetMassKg)} ${CONTAINER_MASS_UNIT}`
    : `${decimalText(container.currentNetMassKg)} of ${decimalText(container.capacityKg)} ${CONTAINER_MASS_UNIT}`;
}

function summaryRecords(scope: ScopeContainer): ContentsSummaryRecord[] {
  return scope.records.map(({ record }) => ({
    recordNumber: record.recordNumber,
    chemistry: record.chemistry,
    massKg: record.batteryMassKg,
    energyWh: record.ratedEnergyWh,
    damaged: record.ddrFlags.length > 0 || record.isAirTransportProhibited,
  }));
}

/** The lots a shipment carries whole: allocated, with their containers on it. */
function lotOnShipment(
  lot: Lot,
  members: readonly ScopeContainer[],
  shipment: Shipment | null,
): boolean {
  return (
    shipment !== null &&
    lot.status === "allocated" &&
    members.some((entry) => entry.container.shipmentId === shipment.id)
  );
}

export async function readShipmentSources(
  ctx: RequestContext,
  shipment: Shipment | null,
): Promise<ShipmentSources> {
  const [containersPage, clocks, lotsPage] = await Promise.all([
    data.containers.list(ctx, { limit: CONTAINER_LIMIT }),
    data.storageClocks.list(ctx, { limit: CLOCK_LIMIT }),
    data.lots.list(ctx, { limit: LOT_LIMIT }),
  ]);
  const listed = containersPage.items
    .filter(
      (container) =>
        container.status !== "retired" && container.status !== "shipped",
    )
    .sort((a, b) => a.containerCode.localeCompare(b.containerCode));
  const scope = await readContainerScope(ctx, listed);
  const clockOf = clocksByContainer(clocks.items);

  const anchor =
    shipment === null
      ? null
      : (listed.find((container) => container.shipmentId === shipment.id) ??
        null);
  const lots = lotsPage.items
    .filter((lot) => lot.status !== "shipped" && lot.status !== "dissolved")
    .sort((a, b) => a.lotCode.localeCompare(b.lotCode));
  const membersOf = (lot: Lot) =>
    scope.filter((entry) => entry.container.lotId === lot.id);
  const lotsOnThisShipment = lots
    .filter((lot) => lotOnShipment(lot, membersOf(lot), shipment))
    .map((lot) => lot.id);

  const target: ShipmentAdmissionTarget = {
    organizationId: ctx.organizationId,
    transportMode: shipment?.transportMode ?? null,
    origin:
      anchor === null
        ? null
        : {
            siteTimeZone: anchor.siteTimeZone,
            siteAddress: anchor.siteAddress,
          },
  };
  const shipmentId = shipment?.id ?? null;

  const containers: ShipmentCandidate[] = scope.map((entry) => {
    const { container } = entry;
    const clock = clockOf.get(container.id) ?? null;
    return {
      id: container.id,
      code: container.containerCode,
      typeLabel: CONTAINER_TYPE_LABELS[container.containerType],
      location: container.storageLocation,
      statusLabel: CONTAINER_STATUS_LABELS[container.status],
      fillText: fillText(container),
      clockTier:
        clock === null || clock.alertBand === "none"
          ? null
          : STORAGE_CLOCK_ALERT_BAND_LABELS[clock.alertBand],
      siteKey: siteKeyOf(container),
      admission: admitContainerToShipment(
        admissionFacts(entry, shipmentId),
        target,
      ),
      records: summaryRecords(entry),
      // A container on this shipment through its lot is the lot's row.
      onThisShipment:
        shipment !== null &&
        container.shipmentId === shipment.id &&
        !(
          container.lotId !== null &&
          lotsOnThisShipment.includes(container.lotId)
        ),
    };
  });

  const lotCandidates: LotCandidate[] = lots.map((lot) => {
    const members = membersOf(lot);
    const otherShipment =
      lot.status !== "allocated"
        ? null
        : (members.find(
            (entry) =>
              entry.openShipment !== null &&
              entry.openShipment.id !== shipmentId,
          )?.openShipment ?? null);
    const standing = lotStanding(
      members.map((entry) => ({
        status: entry.container.status,
        accumulationStartedAt: entry.container.accumulationStartedAt,
      })),
    );
    const sites = new Set(members.map((entry) => siteKeyOf(entry.container)));
    return {
      id: lot.id,
      code: lot.lotCode,
      description: lot.description,
      statusLabel: LOT_STATUS_LABELS[lot.status],
      memberCodes: members.map((entry) => entry.container.containerCode),
      memberIds: members.map((entry) => entry.container.id),
      earliestStart: standing.earliestAccumulationStart,
      isOverdue: standing.isOverdue,
      siteKey: sites.size === 1 ? ([...sites][0] ?? null) : null,
      admission: admitLotToShipment(
        {
          id: lot.id,
          organizationId: lot.organizationId,
          lotCode: lot.lotCode,
          status: lot.status,
          members: members.map((entry) => admissionFacts(entry, shipmentId)),
          onOtherOpenShipment:
            otherShipment === null
              ? null
              : { shipmentNumber: otherShipment.shipmentNumber },
        },
        target,
      ),
      records: members.flatMap(summaryRecords),
      onThisShipment: lotsOnThisShipment.includes(lot.id),
    };
  });

  const batteries: BatteryCandidate[] = scope.flatMap((entry, index) => {
    const containerAdmission = containers[index]?.admission ?? {
      ok: true as const,
    };
    const facts = admissionFacts(entry, shipmentId);
    return entry.records.map(({ record }) => ({
      recordId: record.id,
      recordNumber: record.recordNumber,
      containerId: entry.container.id,
      containerCode: entry.container.containerCode,
      admission: admitRecordAlone(
        record.recordNumber,
        facts,
        containerAdmission,
      ),
      containerHref: `/containers/${entry.container.id}`,
    }));
  });

  return { lots: lotCandidates, containers, batteries };
}
