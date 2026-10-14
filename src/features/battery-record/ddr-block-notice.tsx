import type { ReactElement } from "react";

import { HardBlockNotice } from "@/components/hard-block/hard-block-notice";
import {
  airBlockIndicatorText,
  assessAirTransport,
} from "@/domain/transport/air-transport";
import type { BatteryRecord } from "@/types/battery-record";
import type { DamageAssessment } from "@/types/condition";

import { detailLine } from "./json-text";

/**
 * The damaged-or-defective block on `/batteries/[id]` — `UX_SPEC.md` §2.6,
 * E-9; Rules 6.7–6.9, 6.17; D-58 #13.
 *
 * **`HardBlockNotice`, the one component every hard block renders through**,
 * replacing the interim `DdrBlockAlert` this page carried since unit 01 (that
 * file said the replacement would come, and that a second notice beside it
 * would be how one of them ends up saying something different).
 *
 * The decision is the domain's: `assessAirTransport` over this one record, the
 * same function the shipment pages and the server refusal use, so the
 * indicator named here is the indicator named there. The citation is the one
 * the record's condition rule version carries — data, handed in, never typed
 * (Rule 1.23); where none is on file the notice says so.
 *
 * Persistent on every tab and non-dismissible for every role including P6:
 * **there is no override** (Rules 6.8, 6.17). The way forward is a superseding
 * human assessment (Rule 6.11), offered only to the roles that may record one;
 * the control itself sits directly beneath, in `RecordActions`. No
 * probability, likelihood or score appears here or near it (Rule 1.25).
 */

const AIR_TRANSPORT_BLOCK =
  "This record is barred from air transport, and there is no override for any role.";
const DDR_FINDING = "This record carries a damaged-or-defective finding.";
const QUARANTINE_ROUTING =
  "It must be held in a segregated quarantine container. It cannot stay in general stock.";
const MISSING_CITATION =
  "No citation is on file for this prohibition in the governing rule version. The block holds regardless; a Platform Admin must add the citation.";
const PATH_REASSESS = "Re-assess the damage on this record";

/** Where the record's actions are — the re-assess control. */
export const RECORD_ACTIONS_ANCHOR = "record-actions";

export function DdrBlockNotice({
  record,
  assessment,
  citation,
  canReassess,
}: {
  readonly record: BatteryRecord;
  /** The current assessment, where one has been recorded. */
  readonly assessment: DamageAssessment | undefined;
  /** The record's condition rule version's citation, or `null`. */
  readonly citation: string | null;
  /** The role holds the condition write (P1, P6). Decided by the caller's map. */
  readonly canReassess: boolean;
}): ReactElement | null {
  const air = assessAirTransport([
    {
      recordId: record.id,
      recordNumber: record.recordNumber,
      ddrFlags: record.ddrFlags,
      isAirTransportProhibited: record.isAirTransportProhibited,
      currentFindings: assessment?.findingTypes ?? [],
      citation,
    },
  ]);
  if (air.available) return null;

  const findingLine =
    assessment === undefined ? null : detailLine(assessment.findingDetail);

  return (
    <HardBlockNotice
      state="blocked"
      dataAttribute="ddr"
      title={
        record.isAirTransportProhibited ? AIR_TRANSPORT_BLOCK : DDR_FINDING
      }
      statement={
        findingLine === null
          ? QUARANTINE_ROUTING
          : `${QUARANTINE_ROUTING} The finding as recorded: ${findingLine}`
      }
      citations={air.citations}
      missingCitation={MISSING_CITATION}
      items={air.blockingRecords.map((blocking) => ({
        id: blocking.recordId,
        label: blocking.recordNumber,
        // This is the record's own page.
        href: null,
        indicators: blocking.indicators.map(airBlockIndicatorText),
      }))}
      paths={
        canReassess
          ? [
              {
                id: "reassess",
                label: PATH_REASSESS,
                href: `#${RECORD_ACTIONS_ANCHOR}`,
              },
            ]
          : []
      }
    />
  );
}
