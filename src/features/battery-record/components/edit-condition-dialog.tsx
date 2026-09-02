"use client";

import { useId, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { toast } from "sonner";

import { PhotoCaptureInput } from "@/components/capture/photo-capture-input";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { StatusBadge } from "@/components/status/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  assessDamage,
  validateFindings,
  type DamageDetermination,
} from "@/domain/condition/damage";
import {
  DAMAGE_FINDING_TYPE_LABELS,
  DAMAGE_FINDING_TYPES,
  type DamageFindingType,
} from "@/domain/taxonomy/damage-finding-type";
import type { DamageAssessmentStatus } from "@/domain/taxonomy/damage-assessment-status";
import { DDR_FLAG_LABELS } from "@/domain/taxonomy/ddr-flag";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import type { Uuid } from "@/types/common";
import type { RecordDamageAssessmentResult } from "../actions";
import { uploadRecordPhoto } from "./upload-photo";

/**
 * **Edit assessed condition** — `UX_SPEC.md` §3.7, §2.6; Rules 6.2–6.6, 6.11,
 * 6.12, 6.20, 2.32.
 *
 * The findings are T-29 checkboxes with `none_observed` exclusive, plus the
 * functional-defect flag (T-30 `defective`). The derived condition renders
 * live as a `StatusBadge` so the person sees what the set they ticked implies
 * before they save it — the derivation is `assessDamage`, the same pure
 * function the server runs, so the badge and the saved row cannot disagree.
 *
 * **The dialog states, before the save, that the gate re-opens and a
 * re-classification check runs** (§3.7: *"The edit `Dialog` says so before
 * the change is saved, not after"*). The sentence is a constant so a test can
 * assert it verbatim.
 *
 * **Clearing a damaged finding requires a photo** (Rule 6.11). The photo goes
 * through the same upload route as intake, typed `clearing_evidence`, and
 * needs the record's intake session to attach to. A record with no session
 * cannot take one; the control says so and the clearing path is blocked with
 * that reason, and this unit reports the gap as an ERD finding.
 *
 * **Nothing is optimistic.** The save waits for the Server Action, and the
 * page re-renders from what `src/data` holds.
 */

export const CONDITION_GATE_NOTICE =
  "Changing the assessed condition re-opens the confidence gate for this field and triggers a re-classification check. You'll confirm the new value now.";

export const CLEARING_PHOTO_REQUIRED =
  "A damaged finding clears only with a stated reason and at least one supporting photo. The photo is kept as clearing evidence beside both assessments.";

export const NO_SESSION_FOR_PHOTO =
  "This record has no intake session to attach a photo to.";

export interface ConditionDialogFacts {
  readonly recordId: Uuid;
  readonly intakeSessionId: Uuid | null;
  /** The assessment currently on the record, or null where none has been recorded. */
  readonly currentStatus: DamageAssessmentStatus | null;
  readonly currentFindings: readonly DamageFindingType[];
  readonly currentIsDefective: boolean;
}

export type RecordDamageAssessmentAction = (
  input: unknown,
) => Promise<ActionResult<RecordDamageAssessmentResult>>;

export interface EditConditionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly facts: ConditionDialogFacts;
  readonly action: RecordDamageAssessmentAction;
}

interface ClearingPhoto {
  readonly intakePhotoId: Uuid;
  readonly fileName: string;
}

function derive(
  findings: readonly DamageFindingType[],
  isDefective: boolean,
): DamageDetermination | null {
  return validateFindings(findings).ok
    ? assessDamage(findings, { isDefective })
    : null;
}

export function EditConditionDialog({
  open,
  onOpenChange,
  facts,
  action,
}: EditConditionDialogProps): ReactElement {
  const router = useRouter();
  const reasonId = useId();
  const noticeId = useId();

  const [findings, setFindings] = useState<readonly DamageFindingType[]>(
    facts.currentFindings,
  );
  const [isDefective, setIsDefective] = useState(facts.currentIsDefective);
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<ClearingPhoto | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const determination = derive(findings, isDefective);
  const hasPrior = facts.currentStatus !== null;
  const isClearing =
    facts.currentStatus === "assessed_damaged" &&
    determination !== null &&
    determination.assessmentStatus !== "assessed_damaged";
  const canAttachPhoto = facts.intakeSessionId !== null;

  // The reason checklist beneath the primary — one line per thing still
  // outstanding, so a disabled save is never silent (§2.1.4, Rule 1.26).
  const outstanding: string[] = [];
  if (determination === null) outstanding.push("Choose at least one finding.");
  if (hasPrior && reason.trim() === "") {
    outstanding.push("State why the assessed condition is changing.");
  }
  if (isClearing && photo === null) {
    outstanding.push(
      canAttachPhoto
        ? "Attach a supporting photo to clear the damaged finding."
        : NO_SESSION_FOR_PHOTO,
    );
  }
  const isReady = outstanding.length === 0 && !isPending && !isUploading;

  function toggleFinding(finding: DamageFindingType, checked: boolean): void {
    setFindings((current) => {
      if (!checked) return current.filter((item) => item !== finding);
      // `none_observed` stands alone: ticking it clears the rest, and ticking
      // anything else clears it (Rule 6.3 — the set has to be one a person
      // could have observed).
      if (finding === "none_observed") return ["none_observed"];
      return [...current.filter((item) => item !== "none_observed"), finding];
    });
  }

  async function attachClearingPhoto(file: File): Promise<void> {
    if (facts.intakeSessionId === null) return;
    setIsUploading(true);
    setError(null);
    const result = await uploadRecordPhoto({
      file,
      intakeSessionId: facts.intakeSessionId,
      photoType: "clearing_evidence",
    });
    setIsUploading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPhoto({ intakePhotoId: result.intakePhotoId, fileName: file.name });
  }

  async function save(): Promise<void> {
    if (!isReady) return;
    setIsPending(true);
    setError(null);
    const result = await action({
      recordId: facts.recordId,
      findingTypes: findings,
      isDefective,
      reason: reason.trim() === "" ? null : reason.trim(),
      clearingPhotoIntakePhotoId: photo?.intakePhotoId ?? null,
    });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.success("Assessed condition recorded", {
      description:
        result.data.classification === "unresolved"
          ? "The record could not be re-classified: no rule is on file for this site. A Facility Manager or a Platform Admin can supply what is missing."
          : "The record has been re-classified.",
    });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-record-dialog="edit-assessed-condition"
        className="rounded-lg text-body sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-h2">Edit assessed condition</DialogTitle>
          <DialogDescription className="text-body text-foreground">
            Tick every indicator you observed. The condition is derived from the
            set, never chosen.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-2">
          <legend className="text-label">Findings</legend>
          {DAMAGE_FINDING_TYPES.map((finding) => {
            const checked = findings.includes(finding);
            return (
              <Label
                key={finding}
                className="flex min-h-11 items-center gap-3 rounded-md px-2 text-body"
              >
                <Checkbox
                  checked={checked}
                  data-finding={finding}
                  onCheckedChange={(state) =>
                    toggleFinding(finding, state === true)
                  }
                />
                <span>{DAMAGE_FINDING_TYPE_LABELS[finding]}</span>
              </Label>
            );
          })}
        </fieldset>

        <Label className="flex min-h-11 items-center gap-3 rounded-md px-2 text-body">
          <Checkbox
            checked={isDefective}
            data-finding="defective"
            onCheckedChange={(state) => setIsDefective(state === true)}
          />
          <span>Functionally defective ({DDR_FLAG_LABELS.defective})</span>
        </Label>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label">Derived condition</span>
          <StatusBadge
            system="assessed_condition"
            value={determination?.assessedCondition ?? null}
            size="sm"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={reasonId} className="text-label">
            Reason{hasPrior ? "" : " (optional)"}
          </Label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            aria-required={hasPrior}
            className="min-h-16 rounded-md text-body"
            data-condition-reason="true"
          />
        </div>

        {isClearing ? (
          <div
            data-clearing-evidence="true"
            className={cn(
              "grid gap-3 rounded-md border p-3",
              INTENT_SURFACE_CLASSES.attention,
            )}
          >
            <p className="text-body-strong">{CLEARING_PHOTO_REQUIRED}</p>
            <PhotoCaptureInput
              photoType="clearing_evidence"
              variant="button"
              label={
                photo === null ? "Attach a supporting photo" : "Replace photo"
              }
              onFile={(file) => {
                void attachClearingPhoto(file);
              }}
              disabled={!canAttachPhoto}
              {...(canAttachPhoto
                ? {}
                : { disabledReason: NO_SESSION_FOR_PHOTO })}
            />
            {isUploading ? (
              <p role="status" className="text-caption">
                Sending photo…
              </p>
            ) : null}
            {photo === null ? null : (
              <p
                className="text-caption"
                data-clearing-photo-id={photo.intakePhotoId}
              >
                Attached: <span className="text-mono">{photo.fileName}</span>
              </p>
            )}
          </div>
        ) : null}

        {error === null ? null : (
          <Alert
            role="alert"
            className={cn(INTENT_SURFACE_CLASSES.critical, "gap-2 px-3 py-3")}
          >
            <CircleAlert aria-hidden="true" className="size-4" />
            <AlertDescription className="text-body text-current">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <p
          id={noticeId}
          data-gate-notice="condition"
          className="max-w-[72ch] text-body-strong"
        >
          {CONDITION_GATE_NOTICE}
        </p>

        {isReady ? null : (
          <ul data-outstanding="condition" className="grid gap-1 text-caption">
            {outstanding.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}

        <DialogFooter className="rounded-b-lg p-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}
            className={ACTION_BUTTON_CLASS}
          >
            Cancel
          </Button>
          {/* `aria-disabled` with an inert handler, never `disabled`: the
              outstanding list above is the reason, and it stays reachable
              (§2.1.4, Rule 1.26). */}
          <Button
            type="button"
            size="lg"
            data-primary-action="save-condition"
            aria-disabled={isReady ? undefined : "true"}
            aria-describedby={noticeId}
            onClick={() => {
              void save();
            }}
            className={cn(ACTION_BUTTON_CLASS, isReady ? "" : "opacity-60")}
          >
            {isPending ? "Saving…" : "Confirm assessed condition"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
