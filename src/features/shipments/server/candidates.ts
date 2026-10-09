import "server-only";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { decimalText } from "@/components/storage/container-fill-meter";
import { CONTAINER_STATUS_LABELS } from "@/domain/taxonomy/container-status";
import { CONTAINER_TYPE_LABELS } from "@/domain/taxonomy/container-type";
import { STORAGE_CLOCK_ALERT_BAND_LABELS } from "@/domain/taxonomy/storage-clock-alert-band";
import {
  admitContainerToShipment,
  type ShipmentAdmission,
} from "@/domain/transport/container-admission";
import type { ContentsSummaryRecord } from "@/domain/transport/contents-summary";
import { CONTAINER_MASS_UNIT } from "@/features/containers/container-copy";
import { clocksByContainer } from "@/features/containers/server/read-containers";
import type { Uuid } from "@/types/common";
import type { Shipment } from "@/types/documents";
import type { Container } from "@/types/storage";

import {
  admissionFacts,
  readContainerScope,
  type ScopeContainer,
} from "./scope";

/**
 * Step 1's containers — `UX_SPEC.md` §3.12; Flow B1.
 *
 * **Every container with the reason it would refuse**, never a hidden row: the
 * admission is `admitContainerToShipment`, the function the adapter runs again
 * at commit, so the reason a row shows is the refusal the server would give.
 * Retired and shipped containers have ended their cycle and are not listed.
 * Each row carries the facts the live summary adds up — never a total the
 * screen computed by itself.
 */

const CONTAINER_LIMIT = 200;
const CLOCK_LIMIT = 500;

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

export async function readShipmentCandidates(
  ctx: RequestContext,
  shipment: Shipment | null,
): Promise<readonly ShipmentCandidate[]> {
  const [containers, clocks] = await Promise.all([
    data.containers.list(ctx, { limit: CONTAINER_LIMIT }),
    data.storageClocks.list(ctx, { limit: CLOCK_LIMIT }),
  ]);
  const listed = containers.items
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

  return scope.map((entry) => {
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
        admissionFacts(entry, shipment?.id ?? null),
        {
          organizationId: ctx.organizationId,
          transportMode: shipment?.transportMode ?? null,
          origin:
            anchor === null
              ? null
              : {
                  siteTimeZone: anchor.siteTimeZone,
                  siteAddress: anchor.siteAddress,
                },
        },
      ),
      records: summaryRecords(entry),
      onThisShipment: shipment !== null && container.shipmentId === shipment.id,
    };
  });
}
