import type { IsoDate, IsoTimestamp, TimeZone } from "@/types/common";
import type { ResolvedRule } from "@/domain/rules/resolve";
import { civilDateInZone } from "@/domain/storage/clock-display";
import {
  SHIPMENT_STATUS_LABELS,
  type ShipmentStatus,
} from "@/domain/taxonomy/shipment-status";
import type { TransportMode } from "@/domain/taxonomy/transport-mode";

import type { AirTransportAssessment } from "./air-transport";
import { readRetentionRule } from "./rule-data";

/**
 * Departure and arrival — `BUSINESS_RULES.md` Rules 5.16–5.18, 5.26, 6.16;
 * T-28.
 *
 * **Departure is a recorded act** with a date, a time zone and an actor. It
 * creates the ledger entry, closes the storage clocks of what left, and moves
 * the records to shipped (Rule 5.17). It needs an issued paper that is current
 * for the contents (Rule 5.13) and whose bytes are stored (§8.2), the carrier on record (Rule 5.16), no air
 * conflict (Rule 6.7 — re-checked, because a condition can change after the
 * paper issued), the damaged/defective packet where any record needs one
 * (Rule 6.16), and a retention period read from rule data (Rule 5.18). **Each
 * refusal is stated**; none is a warning.
 *
 * **Arrival closes the shipment** and moves its records to closed out, which is
 * terminal (Rule 5.26).
 */

export type DepartureRefusal =
  | "not_documented"
  | "no_current_paper"
  | "paper_not_stored"
  | "carrier_missing"
  | "air_blocked"
  | "ddr_packet_missing"
  | "retention_unresolved";

export type DepartureAdmission =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: DepartureRefusal;
      readonly message: string;
    };

export interface DepartureFacts {
  readonly status: ShipmentStatus;
  /** An issued, unvoided paper describing exactly the current contents. */
  readonly hasCurrentIssuedPaper: boolean;
  /**
   * That paper's bytes are stored and hashed (`TECHNICAL_SPEC.md` §8.2). A
   * paper with no file behind it is not a paper anything may travel with.
   */
  readonly currentPaperIsStored: boolean;
  readonly carrierName: string | null;
  readonly transportMode: TransportMode;
  readonly air: AirTransportAssessment;
  /** Records on the damaged/defective path. */
  readonly ddrRecordNumbers: readonly string[];
  /** A damaged/defective packet is issued for this shipment (T-38 `ddr_packet`). */
  readonly ddrPacketIssued: boolean;
  readonly retention: RetentionDetermination;
}

function refuse(reason: DepartureRefusal, message: string): DepartureAdmission {
  return { ok: false, reason, message };
}

export function admitDeparture(facts: DepartureFacts): DepartureAdmission {
  if (facts.status !== "documents_issued") {
    return refuse(
      "not_documented",
      facts.status === "draft" || facts.status === "ready"
        ? "This shipment has no issued shipping paper. Generate the shipping paper before recording departure."
        : `This shipment is ${SHIPMENT_STATUS_LABELS[facts.status]} and cannot depart.`,
    );
  }
  if (!facts.hasCurrentIssuedPaper) {
    return refuse(
      "no_current_paper",
      "This shipment's shipping paper is not current for its contents. Generate a new one before recording departure (Rule 5.13).",
    );
  }
  if (!facts.currentPaperIsStored) {
    return refuse(
      "paper_not_stored",
      "This shipment's issued shipping paper has no stored file behind it, so it cannot travel with the shipment. Void it with a reason and generate a new one before recording departure.",
    );
  }
  if ((facts.carrierName?.trim() ?? "") === "") {
    return refuse(
      "carrier_missing",
      "The carrier is not recorded. Transporter details are recorded before departure (Rule 5.16).",
    );
  }
  if (facts.transportMode === "air" && !facts.air.available) {
    return refuse(
      "air_blocked",
      `Air transport is not available for this shipment: ${facts.air.blockingRecords.map((record) => record.recordNumber).join(", ")} ${facts.air.blockingRecords.length === 1 ? "is" : "are"} damaged, defective or recalled (Rules 6.7, 6.8).`,
    );
  }
  if (facts.ddrRecordNumbers.length > 0 && !facts.ddrPacketIssued) {
    return refuse(
      "ddr_packet_missing",
      `This shipment holds ${facts.ddrRecordNumbers.join(", ")}, on the damaged, defective or recalled path. ` +
        "Its damaged/defective packet must be issued before departure (Rule 6.16), and this version does not yet generate that document.",
    );
  }
  if (!facts.retention.ok) {
    return refuse(
      "retention_unresolved",
      "No shipment-record retention period is on file for this site's jurisdiction on this date, so the ledger entry cannot be stamped. A Platform Admin must add it (Rules 5.18, 1.23).",
    );
  }
  return { ok: true };
}

export type ArrivalAdmission =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

/** Arrival is recorded against a shipment that has departed, and nothing else (T-28). */
export function admitArrival(status: ShipmentStatus): ArrivalAdmission {
  if (status === "dispatched") return { ok: true };
  return {
    ok: false,
    message:
      status === "delivered" || status === "closed"
        ? "Arrival is already recorded for this shipment."
        : `This shipment is ${SHIPMENT_STATUS_LABELS[status]}. Arrival is recorded after departure.`,
  };
}

// --- retention ------------------------------------------------------------------------------

export type RetentionDetermination =
  | {
      readonly ok: true;
      /** The day the shipment record may first be deleted. */
      readonly expiresOn: IsoDate;
      readonly ruleVersionId: string;
      readonly citation: string;
    }
  | { readonly ok: false };

/**
 * `civilDate` plus whole years. A day the target year lacks — 29 February —
 * rolls **forward** to the first of March: a retention date is a date before
 * which a record may not be deleted, and the later date is the one that fails
 * safe.
 */
export function addCivilYears(civilDate: IsoDate, years: number): IsoDate {
  const [yearText = "", monthText = "", dayText = ""] = civilDate.split("-");
  const year = Number(yearText) + years;
  const month = Number(monthText);
  const day = Number(dayText);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const target =
    day > lastDay
      ? new Date(Date.UTC(year, month, 1))
      : new Date(Date.UTC(year, month - 1, day));
  return target.toISOString().slice(0, 10);
}

/**
 * When a departed shipment's record may first be deleted — the period from
 * the resolved rule version, counted from the ship date in the site's zone
 * (Rules 5.18, 12.10, 12.20). **Never a literal**: no version, no date.
 */
export function shipmentRetention(
  shippedAt: IsoTimestamp,
  timeZone: TimeZone,
  resolved: ResolvedRule | null,
): RetentionDetermination {
  if (resolved === null) return { ok: false };
  const rule = readRetentionRule(resolved);
  if (rule === null) return { ok: false };
  return {
    ok: true,
    expiresOn: addCivilYears(
      civilDateInZone(shippedAt, timeZone),
      rule.retentionYears,
    ),
    ruleVersionId: resolved.version.ruleVersionId,
    citation: resolved.version.citation,
  };
}
