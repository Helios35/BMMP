import type { ReactElement } from "react";
import { CircleAlert } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { StatusBadge } from "@/components/status/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DAMAGE_FINDING_TYPE_LABELS } from "@/domain/taxonomy/damage-finding-type";
import { labelFor } from "@/domain/taxonomy/lookup";
import type { BatteryRecord } from "@/types/battery-record";
import type { DamageAssessment } from "@/types/condition";
import { cn } from "@/lib/utils";
import { detailEntries, detailLine } from "./json-text";

/**
 * The damaged-or-defective block, on every tab of `/batteries/[id]`.
 *
 * **Persistent and non-dismissible, and there is no override control for any
 * role including P6** (Rules 6.8, 6.17). A record carrying a DDR flag is barred
 * from air transport and must be routed to a segregated quarantine container; it
 * cannot remain in general stock. A block that can be clicked away is not a
 * block.
 *
 * It carries three things and no more: **what is blocked**, **why** — the
 * finding as the assessment recorded it, not a re-description of it — and **the
 * routing requirement**. No probability, no likelihood and no score of anything
 * appears here or anywhere near it (Rule 1.25).
 *
 * ## The component seam
 *
 * `UX_SPEC.md` §2.6's `HardBlockNotice` is **unit 02's component**, built by the
 * unit that first has a write path to block. This renders the same three facts
 * through a shadcn `Alert` so the state is visible today. **Unit 02 replaces
 * this file rather than adding a second notice beside it** — two components
 * telling a handler the same battery is blocked is how one of them ends up
 * saying something slightly different.
 */

const AIR_TRANSPORT_BLOCK =
  "This record is barred from air transport, and there is no override for any role.";

const QUARANTINE_ROUTING =
  "It must be held in a segregated quarantine container. It cannot stay in general stock.";

export function DdrBlockAlert({
  record,
  assessment,
}: {
  readonly record: BatteryRecord;
  /** The current assessment, where one has been recorded. */
  readonly assessment: DamageAssessment | undefined;
}): ReactElement | null {
  if (record.ddrFlags.length === 0) return null;

  const findingLine =
    assessment === undefined ? null : detailLine(assessment.findingDetail);
  const findingEntries =
    assessment === undefined ? [] : detailEntries(assessment.findingDetail);

  return (
    <Alert
      role="alert"
      data-hard-block="ddr"
      className={cn(INTENT_SURFACE_CLASSES.critical, "gap-2 px-4 py-4")}
    >
      <CircleAlert aria-hidden="true" className="size-5" />
      <AlertTitle className="text-body-strong text-balance">
        {record.isAirTransportProhibited
          ? AIR_TRANSPORT_BLOCK
          : "This record carries a damaged-or-defective finding."}
      </AlertTitle>
      <AlertDescription className="grid gap-3 text-body text-current">
        <div className="flex flex-wrap items-center gap-2">
          {record.ddrFlags.map((flag) => (
            <StatusBadge key={flag} system="ddr_flag" value={flag} size="sm" />
          ))}
          {assessment !== undefined
            ? assessment.findingTypes.map((finding) => (
                <span key={finding} className="text-body-strong">
                  {labelFor(DAMAGE_FINDING_TYPE_LABELS, finding)}
                </span>
              ))
            : null}
        </div>

        {/* The reason as the assessment recorded it. Rendered as stored — a
            paraphrase of a damage finding is a different finding. */}
        {findingLine !== null ? (
          <p className="max-w-[72ch]">{findingLine}</p>
        ) : null}
        {findingEntries.length > 0 ? (
          <ul className="grid gap-1">
            {findingEntries.map((entry) => (
              <li key={entry.key} className="text-mono break-words">
                {entry.key}: {entry.text}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="max-w-[72ch] text-body-strong">{QUARANTINE_ROUTING}</p>
      </AlertDescription>
    </Alert>
  );
}
