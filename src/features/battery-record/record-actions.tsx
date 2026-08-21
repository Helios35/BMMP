import type { ReactElement } from "react";

import { GatedControl } from "@/components/access/gated-control";
import { Button } from "@/components/ui/button";
import type { Capability } from "@/domain/access/capability";
import {
  controlTreatment,
  controlTreatmentReason,
} from "@/domain/access/control-treatment";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * Every mutating affordance on `/batteries/[id]`, in one component — E-8a.
 *
 * The brief asks for two things that look incompatible: **every write path on
 * this screen belongs to unit 02 and none of it is built here**, and **E-8a must
 * still be demonstrable.** They are compatible, because a disabled control has
 * no handler to call. `disabled` is the auditor's terminal state by definition,
 * so the auditor branch can be finished today and is.
 *
 * ## What renders, for whom
 *
 * - **The auditor** gets the three non-destructive controls, rendered inert with
 *   the stated reason. Controls she cannot see, she cannot assess — and what the
 *   organisation is able to do to a record is exactly what she came to evaluate.
 * - **The destructive control is absent**, produced by `controlTreatment` rather
 *   than by omission here: there is no value in showing an auditor a disabled
 *   **Void this record**, and a greyed-out one invites the question *"then who
 *   can?"*, which on an irreversible act is not a question this screen should
 *   raise. (There is no Delete at all — a battery record is never deleted,
 *   Rule 12.12.)
 * - **Every other role gets nothing.** Not a disabled button, not a dead button,
 *   not a "coming soon". A control with no handler shown to a colleague teaches
 *   her she is missing a permission she is not missing, which is the precise
 *   failure §2.9's table exists to prevent.
 *
 * ## `aria-disabled`, never the `disabled` attribute
 *
 * A `disabled` button leaves the tab order and fires no pointer events, so its
 * tooltip never opens and **the stated reason becomes unreachable** — which
 * defeats the entire point of leaving the control visible (§2.1.4, §G5).
 * `GatedControl` carries the reason twice, as a tooltip and as visible text, so
 * it is reachable by touch, by keyboard and by screen reader.
 *
 * **Server-side rejection is the enforcement; the attribute is a courtesy**
 * (`SITE_ARCHITECTURE.md` §5.3(6)).
 *
 * `// [b1a-02] the enabled branches land here; the auditor branch is final.`
 */

interface RecordControl {
  readonly id: string;
  readonly label: string;
  /** Void, revoke, remove — anything with no undo. */
  readonly isDestructive: boolean;
}

/**
 * The four mutating controls this screen will carry, as data.
 *
 * They are declared here **including the destructive one** so that its absence
 * for the auditor is the output of `controlTreatment` rather than a control
 * nobody remembered to write. A test asserting `[data-destructive="true"]` is
 * absent is only meaningful because the renderer would have emitted it.
 */
const RECORD_CONTROLS: readonly RecordControl[] = [
  {
    id: "edit-assessed-condition",
    label: "Edit assessed condition",
    isDestructive: false,
  },
  {
    id: "rerun-catalog-matching",
    label: "Re-run catalog matching",
    isDestructive: false,
  },
  { id: "attach-a-photo", label: "Attach a photo", isDestructive: false },
  { id: "void-this-record", label: "Void this record", isDestructive: true },
];

export interface RecordActionsProps {
  readonly role: RoleCode;
  /** This role's capability on `/batteries/[id]`, from `ROUTE_ACCESS`. */
  readonly capability: Capability;
  /** The record these controls will act on when unit 02 wires them. */
  readonly recordId: string;
}

export function RecordActions({
  role,
  capability,
  recordId,
}: RecordActionsProps): ReactElement | null {
  const rendered = RECORD_CONTROLS.map((control) => ({
    control,
    treatment: controlTreatment({
      role,
      capability,
      isDestructive: control.isDestructive,
      // Print and export are never disabled for anyone and are not in this set;
      // the print link lives in the page header (Rule 5.27).
      isExportOrPrint: false,
    }),
  })).filter((entry) => entry.treatment === "disabled_with_reason");

  // [b1a-02] the enabled branches land here; the auditor branch is final.
  // A role holding `write` gets `enabled` from controlTreatment, and this unit
  // builds no write path — so an enabled control would be a dead button, and
  // nothing renders until the handler exists.
  if (rendered.length === 0) return null;

  return (
    <div
      data-record-actions="true"
      data-record-id={recordId}
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start"
    >
      {rendered.map(({ control, treatment }) => {
        const reason = controlTreatmentReason(treatment);
        if (reason === null) return null;
        return (
          <GatedControl key={control.id} reason={reason}>
            <Button
              type="button"
              variant="outline"
              size="lg"
              aria-disabled="true"
              data-disabled="true"
              data-mutating="true"
              data-destructive={control.isDestructive ? "true" : undefined}
              data-control={control.id}
              className="min-h-11 rounded-md opacity-60"
            >
              {control.label}
            </Button>
          </GatedControl>
        );
      })}
    </div>
  );
}
