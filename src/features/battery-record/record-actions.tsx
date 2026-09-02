import type { ReactElement } from "react";

import { GatedControl } from "@/components/access/gated-control";
import { Button } from "@/components/ui/button";
import type { Capability } from "@/domain/access/capability";
import {
  controlTreatment,
  controlTreatmentReason,
} from "@/domain/access/control-treatment";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { BatteryRecord } from "@/types/battery-record";
import type { DamageAssessment } from "@/types/condition";
import {
  applyCatalogRematch,
  findCatalogCandidatesForRecord,
  recordDamageAssessment,
  voidBatteryRecord,
} from "./actions";
import { RecordActionsMenu } from "./components/record-actions-menu";

/**
 * Every mutating affordance on `/batteries/[id]`, in one component — E-8a,
 * `UX_SPEC.md` §3.7.
 *
 * Unit 01 built the auditor branch and left the enabled branch unbuilt on
 * purpose: a control with no handler is a dead button, and nothing rendered
 * until the handler existed. Unit 02 supplies the handlers — the four write
 * paths in `./actions.ts` — and this component now has both branches. **The
 * auditor branch is unchanged, byte for byte**: `guard-auditor-controls.spec.ts`
 * asserts on it, and a unit test holds its rendered output against a fixture.
 *
 * ## What renders, for whom
 *
 * - **A role holding `write` (P1, P6)** gets the four real controls through
 *   `RecordActionsMenu`, each opening its dialog. The decision is
 *   `controlTreatment`'s, not this file's.
 * - **The auditor** gets the three non-destructive controls, rendered inert with
 *   the stated reason. Controls she cannot see, she cannot assess — and what the
 *   organisation is able to do to a record is exactly what she came to evaluate.
 * - **The destructive control is absent** for her, produced by `controlTreatment`
 *   rather than by omission here: there is no value in showing an auditor a
 *   disabled **Void this record**, and a greyed-out one invites the question
 *   *"then who can?"*, which on an irreversible act is not a question this
 *   screen should raise. (There is no Delete at all — a battery record is never
 *   deleted, Rule 12.12.)
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
 * (`SITE_ARCHITECTURE.md` §5.3(6)). Every action in `./actions.ts` re-checks
 * the role through `requireWrite` and records the denial.
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
  /** The record these controls act on. */
  readonly recordId: string;
  /**
   * The record's facts the enabled branch needs — its intake session (a photo
   * has nowhere else to attach), its catalog entry and its DDR flags. Optional
   * so the auditor branch, which reads none of them, keeps its call shape.
   */
  readonly record?: BatteryRecord;
  /** The assessment currently governing the record, where one is recorded. */
  readonly currentAssessment?: DamageAssessment;
}

export function RecordActions({
  role,
  capability,
  recordId,
  record,
  currentAssessment,
}: RecordActionsProps): ReactElement | null {
  const treatments = RECORD_CONTROLS.map((control) => ({
    control,
    treatment: controlTreatment({
      role,
      capability,
      isDestructive: control.isDestructive,
      // Print and export are never disabled for anyone and are not in this set;
      // the print link lives in the page header (Rule 5.27).
      isExportOrPrint: false,
    }),
  }));

  // A role holding `write` gets `enabled` from controlTreatment, and every
  // control has a handler now — so the real controls render. Without the
  // record's facts there is nothing to act on, and nothing renders rather than
  // a control that would open a dialog over a record it cannot name.
  if (
    record !== undefined &&
    treatments.some((entry) => entry.treatment === "enabled")
  ) {
    return (
      <RecordActionsMenu
        facts={{
          recordId: record.id,
          recordNumber: record.recordNumber,
          intakeSessionId: record.intakeSessionId,
          catalogEntryId: record.catalogEntryId,
          currentAssessmentStatus: currentAssessment?.status ?? null,
          currentFindings: currentAssessment?.findingTypes ?? [],
          // T-30 — `defective` is the functional flag, set beside the findings
          // rather than among them.
          currentIsDefective: record.ddrFlags.includes("defective"),
        }}
        actions={{
          recordDamageAssessment,
          findCatalogCandidatesForRecord,
          applyCatalogRematch,
          voidBatteryRecord,
        }}
      />
    );
  }

  const rendered = treatments.filter(
    (entry) => entry.treatment === "disabled_with_reason",
  );

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
