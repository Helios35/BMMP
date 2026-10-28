import type { PostalAddress } from "@/types/common";
import type { ContainerLabelFlags } from "@/domain/storage/container-label-flags";
import {
  CONTAINER_STATUS_LABELS,
  type ContainerStatus,
} from "@/domain/taxonomy/container-status";
import {
  CONTAINER_TYPE_DIMENSIONS,
  type ContainerType,
} from "@/domain/taxonomy/container-type";
import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import {
  LOT_STATUS_LABELS,
  type LotStatus,
} from "@/domain/taxonomy/lot-status";
import type { TransportMode } from "@/domain/taxonomy/transport-mode";

/**
 * Whether a container may join a shipment, and if not, why — `BUSINESS_RULES.md`
 * Rules 4.19, 4.22, 5.2, 5.24, 5.25, 6.1, 6.13; T-23.
 *
 * **Blocked at assembly, not detected afterwards** (Rules 5.24, 5.25,
 * `UX_SPEC.md` §3.12). Step 1's picker shows every container with the reason
 * it would refuse, and the adapter runs this same function again at commit,
 * so the stated reason is the refusal the server gives, word for word.
 *
 * Every refusal is stated (Rule 1.26). None is a warning a person can click
 * through, and none takes a role into account: what may ship is a property of
 * the container and its contents, not of who is asking.
 */

/** One battery in the container, as much of it as admission reads. */
export interface ShipmentContentFacts {
  readonly recordId: string;
  readonly recordNumber: string;
  readonly ddrFlags: readonly DdrFlag[];
  readonly isAirTransportProhibited: boolean;
  /** A current, human-confirmed damage assessment is on record (Rule 6.1). */
  readonly hasDamageAssessment: boolean;
}

export interface ShipmentContainerFacts {
  readonly id: string;
  readonly organizationId: string;
  readonly containerCode: string;
  readonly status: ContainerStatus;
  readonly containerType: ContainerType;
  readonly siteTimeZone: string;
  readonly siteAddress: PostalAddress | null;
  readonly labelFlags: ContainerLabelFlags;
  readonly contents: readonly ShipmentContentFacts[];
  /** The open shipment this container is already on, when that is not the one being built. */
  readonly onOtherOpenShipment: { readonly shipmentNumber: string } | null;
  /** The lot the container is in (`ERD.md` §6.2), or null. */
  readonly lot: {
    readonly id: string;
    readonly lotCode: string;
    readonly status: LotStatus;
  } | null;
}

/** The shipment the container would join. */
export interface ShipmentAdmissionTarget {
  readonly organizationId: string;
  /** Null before a mode is chosen — a new shipment's step 1. */
  readonly transportMode: TransportMode | null;
  /** The site the shipment leaves from, set by the containers already on it. Null for the first. */
  readonly origin: {
    readonly siteTimeZone: string;
    readonly siteAddress: PostalAddress | null;
  } | null;
  /**
   * The lots this container would travel with — the lots selected for the
   * shipment (Rule 5.1). A container in a closed or allocated lot ships only
   * as part of it. Omitted reads as none.
   */
  readonly shippingLotIds?: readonly string[];
}

export type ShipmentAdmissionRefusal =
  | "other_organization"
  | "not_shippable_status"
  | "empty"
  | "determination_pending"
  | "no_current_label"
  | "mislabelled"
  | "on_other_shipment"
  | "different_site"
  | "no_damage_assessment"
  | "damaged_onto_air"
  | "ships_with_lot"
  | "shares_container";

export type ShipmentAdmission =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: ShipmentAdmissionRefusal;
      readonly message: string;
    };

/**
 * The statuses a container may ship from. `closed` is P2's "ready to ship"
 * hand-off (T-24); `overdue` contents leave by shipment (Rule 4.17). Shipped
 * and retired containers have ended their cycle.
 */
const SHIPPABLE_STATUSES: readonly ContainerStatus[] = [
  "open",
  "full",
  "overdue",
  "closed",
];

function refuse(
  reason: ShipmentAdmissionRefusal,
  message: string,
): ShipmentAdmission {
  return { ok: false, reason, message };
}

function sameSite(
  a: {
    readonly siteTimeZone: string;
    readonly siteAddress: PostalAddress | null;
  },
  b: {
    readonly siteTimeZone: string;
    readonly siteAddress: PostalAddress | null;
  },
): boolean {
  return (
    a.siteTimeZone === b.siteTimeZone &&
    JSON.stringify(a.siteAddress) === JSON.stringify(b.siteAddress)
  );
}

export function admitContainerToShipment(
  container: ShipmentContainerFacts,
  target: ShipmentAdmissionTarget,
): ShipmentAdmission {
  const code = container.containerCode;

  // Rule 5.24 — never two organizations on one shipment. Under tenant scope a
  // container of another organization is not found at all; this is the check
  // that holds if that scope ever has a bug.
  if (container.organizationId !== target.organizationId) {
    return refuse(
      "other_organization",
      "That container belongs to another organization and cannot join this shipment.",
    );
  }
  if (!SHIPPABLE_STATUSES.includes(container.status)) {
    return refuse(
      "not_shippable_status",
      `${code} is ${CONTAINER_STATUS_LABELS[container.status]} and cannot join a shipment.`,
    );
  }
  if (container.contents.length === 0) {
    return refuse(
      "empty",
      `${code} holds nothing, so there is nothing to ship.`,
    );
  }
  // T-23 — no documents are issued from a container whose contents await a
  // damage or recall determination.
  if (CONTAINER_TYPE_DIMENSIONS[container.containerType].condition === "hold") {
    return refuse(
      "determination_pending",
      `${code} holds batteries awaiting a damage or recall determination. No shipping document is issued from it until that is settled.`,
    );
  }
  if (container.labelFlags.noCurrentLabel) {
    return refuse(
      "no_current_label",
      `${code} holds batteries but has no label in force. A container cannot ship without its label (Rule 4.22).`,
    );
  }
  if (container.labelFlags.mislabelled !== null) {
    return refuse(
      "mislabelled",
      `${code}'s printed accumulation start date no longer matches its current one. It must be relabelled before it ships (Rule 4.19).`,
    );
  }
  // T-25 — a closed lot's membership is fixed, so its containers travel
  // together: one selected alone would leave the lot behind it.
  if (
    container.lot !== null &&
    (container.lot.status === "closed" ||
      container.lot.status === "allocated") &&
    !(target.shippingLotIds ?? []).includes(container.lot.id)
  ) {
    return refuse(
      "ships_with_lot",
      `${code} is in ${container.lot.lotCode}, which is ${LOT_STATUS_LABELS[container.lot.status]}, so it ships with its lot. Select ${container.lot.lotCode} instead.`,
    );
  }
  if (container.onOtherOpenShipment !== null) {
    return refuse(
      "on_other_shipment",
      `${code} is already on ${container.onOtherOpenShipment.shipmentNumber}. Remove it from that shipment first (Rule 5.25).`,
    );
  }
  if (target.origin !== null && !sameSite(container, target.origin)) {
    return refuse(
      "different_site",
      `${code} is at a different site. A shipment leaves from one site (Rule 5.2).`,
    );
  }
  const unassessed = container.contents.filter(
    (content) => !content.hasDamageAssessment,
  );
  const [firstUnassessed] = unassessed;
  if (firstUnassessed !== undefined) {
    return refuse(
      "no_damage_assessment",
      `${firstUnassessed.recordNumber} in ${code} has no damage assessment, so it cannot be added to a shipment (Rule 6.1).`,
    );
  }
  if (target.transportMode === "air") {
    const flagged = container.contents.filter(
      (content) =>
        content.ddrFlags.length > 0 || content.isAirTransportProhibited,
    );
    const [firstFlagged] = flagged;
    if (firstFlagged !== undefined) {
      return refuse(
        "damaged_onto_air",
        `${firstFlagged.recordNumber} in ${code} is damaged, defective or recalled, and this shipment travels by air. ` +
          "It cannot be added — damaged, defective and recalled batteries are prohibited from air transport (Rules 6.7, 6.13).",
      );
    }
  }
  return { ok: true };
}

// --- one battery on its own ---------------------------------------------------

/**
 * Whether one battery may ship on its own — Rule 5.1's "individual battery
 * records", as the owner settled it in `b1a-08`: **a battery travels in its
 * own labelled container.** Membership stays `container.shipment_id`, so a
 * battery alone in its container ships as that container and is admitted
 * exactly when the container is; a battery sharing one is refused with the
 * way on — split it into a new container (Rule 4.12) and label that one
 * (Rule 4.22).
 */
export function admitRecordAlone(
  recordNumber: string,
  container: ShipmentContainerFacts,
  containerAdmission: ShipmentAdmission,
): ShipmentAdmission {
  const others = container.contents.length - 1;
  if (others > 0) {
    return refuse(
      "shares_container",
      `${recordNumber} shares ${container.containerCode} with ${others} other ${others === 1 ? "battery" : "batteries"}. ` +
        "A battery ships on its own in its own labelled container: split it into a new container, label that container, and select it here (Rules 4.12, 4.22).",
    );
  }
  return containerAdmission;
}

// --- lots ---------------------------------------------------------------------

/** A lot as step 1 and the adapter read it (Rule 5.1; T-25). */
export interface ShipmentLotFacts {
  readonly id: string;
  readonly organizationId: string;
  readonly lotCode: string;
  readonly status: LotStatus;
  /** Every container whose `lot_id` names it, as admission reads a container. */
  readonly members: readonly ShipmentContainerFacts[];
  /** The open shipment the lot is allocated to, when that is not the one being built. */
  readonly onOtherOpenShipment: { readonly shipmentNumber: string } | null;
}

export type LotShipmentRefusal =
  | "other_organization"
  | "lot_not_closed"
  | "lot_ended"
  | "lot_empty"
  | "on_other_shipment"
  | "member_refused";

export type LotShipmentAdmission =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: LotShipmentRefusal;
      readonly message: string;
    };

function refuseLot(
  reason: LotShipmentRefusal,
  message: string,
): LotShipmentAdmission {
  return { ok: false, reason, message };
}

/**
 * Whether a lot may join a shipment, and if not, why — Rules 5.1, 5.25; T-25.
 *
 * **A lot ships as its containers.** Membership stays `container.shipment_id`
 * (`TECHNICAL_SPEC.md` §7.3, `ERD.md` §11.1), so a lot is admitted exactly
 * when it is closed — its membership fixed — and every one of its containers
 * would be admitted on its own, under the same function the adapter runs at
 * commit. The first refusal among them is the lot's, named.
 */
export function admitLotToShipment(
  lot: ShipmentLotFacts,
  target: ShipmentAdmissionTarget,
): LotShipmentAdmission {
  const code = lot.lotCode;
  if (lot.organizationId !== target.organizationId) {
    return refuseLot(
      "other_organization",
      "That lot belongs to another organization and cannot join this shipment.",
    );
  }
  if (lot.status === "shipped" || lot.status === "dissolved") {
    return refuseLot(
      "lot_ended",
      `${code} is ${LOT_STATUS_LABELS[lot.status]} and cannot join a shipment.`,
    );
  }
  if (lot.status === "open") {
    return refuseLot(
      "lot_not_closed",
      `${code} is open, so its membership can still change. Close it before it ships (T-25).`,
    );
  }
  if (lot.onOtherOpenShipment !== null) {
    return refuseLot(
      "on_other_shipment",
      `${code} is already on ${lot.onOtherOpenShipment.shipmentNumber}. Remove it from that shipment first (Rule 5.25).`,
    );
  }
  if (lot.members.length === 0) {
    return refuseLot(
      "lot_empty",
      `${code} holds no containers, so there is nothing to ship.`,
    );
  }
  const withLot: ShipmentAdmissionTarget = {
    ...target,
    shippingLotIds: [...(target.shippingLotIds ?? []), lot.id],
  };
  for (const member of lot.members) {
    const admission = admitContainerToShipment(member, withLot);
    if (!admission.ok) {
      return refuseLot("member_refused", `${code}: ${admission.message}`);
    }
  }
  return { ok: true };
}
