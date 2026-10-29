import { alertAudienceRoles } from "@/domain/storage/clock-evaluation";
import type { AlertSeverity } from "@/domain/taxonomy/alert-severity";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { IsoTimestamp, JsonObject } from "@/types/common";

/**
 * The alerts recall matching and Rule 6.14 raise — T-44; Rules 6.14, 10.14.
 *
 * **Alerts are records**, raised idempotently on a dedupe key and routed to
 * T-44's default audience — P1 and P2 for both. Every word states the
 * condition and the handling it requires, **never a chance of anything**
 * (Rules 1.25, 10.3), and a possible match is never described as a recall.
 */

export interface RecallAlertDraft {
  readonly alertType: "recall_match" | "ddr_quarantine";
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly body: string;
  readonly audienceRoles: readonly RoleCode[];
  readonly triggerSnapshot: JsonObject;
  readonly raisedAt: IsoTimestamp;
  readonly dedupeKey: string;
}

/**
 * A possible match — Rule 10.14: raised for P1 and P2 when a check writes one,
 * resolved when a person decides it. `attention`, never `critical`: a possible
 * match changes nothing about how the battery is handled until a person
 * confirms it (Rule 10.7).
 */
export function possibleRecallMatchAlert(input: {
  readonly matchId: string;
  readonly recordNumber: string;
  readonly recallNumber: string;
  /** `matchedOnWords`. */
  readonly matchedOn: string;
  readonly raisedAt: IsoTimestamp;
}): RecallAlertDraft {
  return {
    alertType: "recall_match",
    severity: "attention",
    title: `Possible recall match on ${input.recordNumber}`,
    body: `${input.matchedOn} Open the record to confirm or dismiss it. Until a person confirms it, nothing about how the battery is handled changes.`,
    audienceRoles: alertAudienceRoles("recall_match"),
    triggerSnapshot: {
      matchId: input.matchId,
      recordNumber: input.recordNumber,
      recallNumber: input.recallNumber,
      matchedOn: input.matchedOn,
    },
    raisedAt: input.raisedAt,
    dedupeKey: `recall_match:${input.matchId}`,
  };
}

export type AirShipmentCause = "damage" | "recall";

/**
 * Rule 6.14 — a record barred from air on an air shipment that has not
 * departed. T-44 has no type for a shipment, so the alert is the record's
 * quarantine routing (`ddr_quarantine`, P1 and P2) with the shipment as its
 * subject: moving the record to quarantine is what takes it off the shipment.
 * Reported in `b2-09`'s build-notes.
 */
export function airShipmentHeldAlert(input: {
  readonly shipmentId: string;
  readonly shipmentNumber: string;
  readonly recordId: string;
  readonly recordNumber: string;
  readonly cause: AirShipmentCause;
  readonly paperVoided: boolean;
  readonly raisedAt: IsoTimestamp;
}): RecallAlertDraft {
  const finding =
    input.cause === "recall"
      ? "has a confirmed recall"
      : "has a confirmed damaged-or-defective finding";
  const paper = input.paperVoided ? "Its shipping paper was voided. " : "";
  return {
    alertType: "ddr_quarantine",
    severity: "critical",
    title: input.paperVoided
      ? `Air shipment ${input.shipmentNumber}: shipping paper voided`
      : `Air shipment ${input.shipmentNumber} holds a record barred from air`,
    body:
      `${input.recordNumber} ${finding} and is on this air shipment. ` +
      `${paper}Air transport is prohibited for it, so the shipment cannot depart by air. ` +
      "Move the record to a quarantine container, then generate a new paper or ship by ground.",
    audienceRoles: alertAudienceRoles("ddr_quarantine"),
    triggerSnapshot: {
      rule: "6.14",
      cause: input.cause,
      recordId: input.recordId,
      recordNumber: input.recordNumber,
      shipmentNumber: input.shipmentNumber,
      paperVoided: input.paperVoided,
    },
    raisedAt: input.raisedAt,
    dedupeKey: `rule_6_14:${input.shipmentId}:${input.recordId}`,
  };
}

/** The sentence a 6.14 void records as its reason (Rule 5.14). */
export function airShipmentVoidReason(input: {
  readonly recordNumber: string;
  readonly cause: AirShipmentCause;
}): string {
  return input.cause === "recall"
    ? `Rule 6.14 — a recall was confirmed on ${input.recordNumber}, which is on this air shipment. Air transport is prohibited for it (Rule 6.7).`
    : `Rule 6.14 — a damaged-or-defective finding was confirmed on ${input.recordNumber}, which is on this air shipment. Air transport is prohibited for it (Rule 6.7).`;
}
