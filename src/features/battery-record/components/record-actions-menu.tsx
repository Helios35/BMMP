"use client";

import { useState, type ReactElement } from "react";

import { GatedControl } from "@/components/access/gated-control";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { Button } from "@/components/ui/button";
import type { DamageAssessmentStatus } from "@/domain/taxonomy/damage-assessment-status";
import type { DamageFindingType } from "@/domain/taxonomy/damage-finding-type";
import type { Uuid } from "@/types/common";
import { AttachPhotoDialog } from "./attach-photo-dialog";
import {
  EditConditionDialog,
  NO_SESSION_FOR_PHOTO,
  type RecordDamageAssessmentAction,
} from "./edit-condition-dialog";
import {
  RematchDialog,
  type ApplyRematchAction,
  type FindCandidatesAction,
} from "./rematch-dialog";
import { VoidRecordDialog, type VoidRecordAction } from "./void-record-dialog";

/**
 * The enabled branch of `RecordActions` — `UX_SPEC.md` §3.7, §2.9.
 *
 * Four controls, the same four the disabled branch declares, with the same
 * `data-control` ids so a test written against the auditor's screen finds the
 * same things on the handler's. Each opens its dialog; **no control here is a
 * dead button**, which is the condition `RecordActions` waited on before
 * rendering this branch at all.
 *
 * **Attach a photo is gated by a fact about the record, not about the role.**
 * A record with no intake session has nowhere to put a photo, so the control
 * renders `aria-disabled` inside `GatedControl` with that reason — reachable
 * by keyboard, by touch and by screen reader — rather than opening a dialog
 * that can only fail.
 *
 * The destructive control carries `variant="destructive"` and
 * `data-destructive="true"`, the attribute `guard-auditor-controls.spec.ts`
 * asserts is absent for the auditor. It is present here because this branch
 * only renders for a role that holds `write`.
 *
 * The Server Actions arrive as props from the server component above, bound
 * once; the dialogs never import them, so each dialog is testable with a
 * stub.
 */

export interface RecordActionFacts {
  readonly recordId: Uuid;
  readonly recordNumber: string;
  readonly intakeSessionId: Uuid | null;
  readonly catalogEntryId: Uuid | null;
  readonly currentAssessmentStatus: DamageAssessmentStatus | null;
  readonly currentFindings: readonly DamageFindingType[];
  readonly currentIsDefective: boolean;
}

export interface RecordActionHandlers {
  readonly recordDamageAssessment: RecordDamageAssessmentAction;
  readonly findCatalogCandidatesForRecord: FindCandidatesAction;
  readonly applyCatalogRematch: ApplyRematchAction;
  readonly voidBatteryRecord: VoidRecordAction;
}

export interface RecordActionsMenuProps {
  readonly facts: RecordActionFacts;
  readonly actions: RecordActionHandlers;
}

type OpenDialog = "condition" | "rematch" | "photo" | "void" | null;

export function RecordActionsMenu({
  facts,
  actions,
}: RecordActionsMenuProps): ReactElement {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const canAttachPhoto = facts.intakeSessionId !== null;

  const attachControl = (
    <Button
      type="button"
      variant="outline"
      size="lg"
      data-mutating="true"
      data-control="attach-a-photo"
      aria-disabled={canAttachPhoto ? undefined : "true"}
      data-disabled={canAttachPhoto ? undefined : "true"}
      onClick={() => {
        if (canAttachPhoto) setOpenDialog("photo");
      }}
      className={`${ACTION_BUTTON_CLASS}${canAttachPhoto ? "" : "opacity-60"}`}
    >
      Attach a photo
    </Button>
  );

  return (
    <div
      data-record-actions="true"
      data-record-id={facts.recordId}
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start"
    >
      <Button
        type="button"
        variant="outline"
        size="lg"
        data-mutating="true"
        data-control="edit-assessed-condition"
        onClick={() => setOpenDialog("condition")}
        className={ACTION_BUTTON_CLASS}
      >
        Edit assessed condition
      </Button>

      <Button
        type="button"
        variant="outline"
        size="lg"
        data-mutating="true"
        data-control="rerun-catalog-matching"
        onClick={() => setOpenDialog("rematch")}
        className={ACTION_BUTTON_CLASS}
      >
        Re-run catalog matching
      </Button>

      {canAttachPhoto ? (
        attachControl
      ) : (
        <GatedControl reason={NO_SESSION_FOR_PHOTO}>
          {attachControl}
        </GatedControl>
      )}

      <Button
        type="button"
        variant="destructive"
        size="lg"
        data-mutating="true"
        data-destructive="true"
        data-control="void-this-record"
        onClick={() => setOpenDialog("void")}
        className={ACTION_BUTTON_CLASS}
      >
        Void this record
      </Button>

      {/* Mounted only while open, so each opening starts from the record's
          current facts rather than from the last edit's leftover state. */}
      {openDialog === "condition" ? (
        <EditConditionDialog
          open
          onOpenChange={(open) => setOpenDialog(open ? "condition" : null)}
          facts={{
            recordId: facts.recordId,
            intakeSessionId: facts.intakeSessionId,
            currentStatus: facts.currentAssessmentStatus,
            currentFindings: facts.currentFindings,
            currentIsDefective: facts.currentIsDefective,
          }}
          action={actions.recordDamageAssessment}
        />
      ) : null}

      {openDialog === "rematch" ? (
        <RematchDialog
          open
          onOpenChange={(open) => setOpenDialog(open ? "rematch" : null)}
          recordId={facts.recordId}
          currentCatalogEntryId={facts.catalogEntryId}
          findCandidates={actions.findCatalogCandidatesForRecord}
          applyRematch={actions.applyCatalogRematch}
        />
      ) : null}

      {openDialog === "photo" ? (
        <AttachPhotoDialog
          open
          onOpenChange={(open) => setOpenDialog(open ? "photo" : null)}
          intakeSessionId={facts.intakeSessionId}
        />
      ) : null}

      {openDialog === "void" ? (
        <VoidRecordDialog
          open
          onOpenChange={(open) => setOpenDialog(open ? "void" : null)}
          recordId={facts.recordId}
          recordNumber={facts.recordNumber}
          action={actions.voidBatteryRecord}
        />
      ) : null}
    </div>
  );
}
