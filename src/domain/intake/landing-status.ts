import type { BatteryRecordStatus } from "@/domain/taxonomy/battery-record-status";

/**
 * Where a record lands on the T-22 status ladder when its intake commits.
 *
 * The status follows what the commit wrote, never the caller's word for it:
 * placed → in storage, or quarantined under a DDR flag (Rules 6.15, 6.17);
 * unplaced with a decision → classified; unplaced with no decision →
 * confirmed, which is EC-16's "identification completes, classification
 * blocks". One function, because the adapter that writes the status and the
 * builder that audits the transition must name the same value — a trail that
 * says `stored` beside a column that says `classified` is a wrong record.
 */
export interface IntakeLandingInput {
  /** A container was chosen and admitted the record. */
  readonly placed: boolean;
  /** The confirmed assessment set at least one DDR flag. */
  readonly ddrFlagged: boolean;
  /** A classification decision row is being written beside the record. */
  readonly decided: boolean;
}

export function intakeLandingStatus(
  input: IntakeLandingInput,
): BatteryRecordStatus {
  if (input.placed) return input.ddrFlagged ? "quarantined" : "stored";
  return input.decided ? "classified" : "confirmed";
}
