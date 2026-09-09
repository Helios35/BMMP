"use client";

import { useId, useState, type ReactElement } from "react";
import { Check, CircleAlert } from "lucide-react";

import { GatedControl } from "@/components/access/gated-control";
import { PhotoCaptureInput } from "@/components/capture/photo-capture-input";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { StatusBadge } from "@/components/status/status-badge";
import {
  INTENT_SURFACE_CLASSES,
  INTENT_TEXT_CLASSES,
} from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { assessDamage, validateFindings } from "@/domain/condition/damage";
import type { AssessedCondition } from "@/domain/taxonomy/assessed-condition";
import {
  DAMAGE_FINDING_TYPE_LABELS,
  DAMAGE_FINDING_TYPES,
  type DamageFindingType,
} from "@/domain/taxonomy/damage-finding-type";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import { xhrUploadTransport, type UploadTransport } from "./photo-capture-step";

/**
 * `ConditionForm` — step 3's assessed condition (`UX_SPEC.md` §3.9;
 * Rules 6.2–6.6; T-29, T-30, T-49).
 *
 * The person records what they observed as T-29 findings and, separately,
 * whether the pack is functionally defective (T-30 `defective` — no visible
 * indicator sets it). **The condition is derived, not chosen**: the badge
 * renders what `assessDamage` says those findings mean, and a
 * damaged-or-defective finding sets the damaged flag automatically — there is
 * no judgement step between the two (Rule 6.4). The person confirms the
 * derivation; they never pick a grade.
 *
 * `none_observed` is exclusive (Rule 6.3): checking it clears every other
 * finding, and checking any other clears it. "Nothing observed, and also
 * swelling" is not a statement a person can have made.
 *
 * **Confirming is never optimistic** (§6.4). The button enters *Confirming…*
 * and the confirmed line renders only from the `confirmed` prop the server
 * re-rendered with. A confirmed condition collapses to a line with a
 * **Change** control, like a confirmed row on the review card (§2.1.2).
 *
 * `validateFindings` gates every call to `assessDamage` — an impossible set
 * throws there by design, and the reason is surfaced here instead.
 */

export interface ConditionFormProps {
  readonly findings: readonly DamageFindingType[];
  readonly isDefective: boolean;
  /** Server state. `null` until a person confirms. */
  readonly confirmed: { readonly byName: string; readonly at: string } | null;
  /** `setCondition`. Called on every change to the findings or the flag. */
  readonly onChange: (
    findings: readonly DamageFindingType[],
    isDefective: boolean,
  ) => Promise<ActionResult<unknown>>;
  /** `confirmCondition`. */
  readonly onConfirm: () => Promise<ActionResult<unknown>>;
  /**
   * Where a damage photo goes. `null` when the session cannot take one, in
   * which case no prompt renders.
   */
  readonly damagePhoto: {
    readonly sessionId: string;
    readonly uploadUrl: string;
  } | null;
  /** The whole form is read-only, with this reason (§2.9). */
  readonly disabledReason?: string;
  /** Tests inject a transport; the default is the browser's. */
  readonly transport?: UploadTransport;
  readonly className?: string;
}

const DDR_SENTENCE =
  "A damaged-or-defective finding sets the damaged flag automatically — no judgement step sits between the two.";

const NOT_ASSESSED: AssessedCondition = "not_assessed";

const FINDINGS_REASON_COPY: Readonly<
  Record<"empty" | "none_observed_not_exclusive" | "unknown_finding", string>
> = {
  empty: "Select what you observed, or None observed.",
  none_observed_not_exclusive:
    "None observed cannot be recorded alongside another finding.",
  unknown_finding:
    "One of the findings is not a value this version recognises.",
};

interface DamagePhotoItem {
  readonly id: string;
  readonly state: "uploading" | "sent" | "failed";
  readonly error: string | null;
}

let damagePhotoSequence = 0;

export function ConditionForm({
  findings,
  isDefective,
  confirmed,
  onChange,
  onConfirm,
  damagePhoto,
  disabledReason,
  transport = xhrUploadTransport,
  className,
}: ConditionFormProps): ReactElement {
  const groupId = useId();
  const [isEditing, setIsEditing] = useState(confirmed === null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<readonly DamagePhotoItem[]>([]);

  const isDisabled = disabledReason !== undefined;

  const validation = validateFindings(findings);
  const determination = validation.ok
    ? assessDamage(findings, { isDefective })
    : null;
  const derivedCondition: AssessedCondition =
    determination?.assessedCondition ?? NOT_ASSESSED;
  const isDdr = determination !== null && determination.ddrFlags.length > 0;

  async function change(
    nextFindings: readonly DamageFindingType[],
    nextDefective: boolean,
  ): Promise<void> {
    if (isDisabled) return;
    setError(null);
    const result = await onChange(nextFindings, nextDefective);
    if (!result.ok) setError(result.error.message);
  }

  function toggleFinding(finding: DamageFindingType, checked: boolean): void {
    let next: readonly DamageFindingType[];
    if (finding === "none_observed") {
      next = checked ? ["none_observed"] : [];
    } else if (checked) {
      next = [
        ...findings.filter((existing) => existing !== "none_observed"),
        finding,
      ];
    } else {
      next = findings.filter((existing) => existing !== finding);
    }
    void change(next, isDefective);
  }

  async function confirm(): Promise<void> {
    if (isDisabled || isConfirming || determination === null) return;
    setIsConfirming(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setIsEditing(false);
    } finally {
      setIsConfirming(false);
    }
  }

  async function uploadDamagePhoto(file: File): Promise<void> {
    if (damagePhoto === null) return;
    damagePhotoSequence += 1;
    const id = `damage-${damagePhotoSequence}`;
    setPhotos((current) => [
      ...current,
      { id, state: "uploading", error: null },
    ]);
    const result = await transport(
      {
        file,
        intakeSessionId: damagePhoto.sessionId,
        photoType: "damage",
        uploadUrl: damagePhoto.uploadUrl,
      },
      () => {},
    );
    setPhotos((current) =>
      current.map((item) =>
        item.id === id
          ? result.ok
            ? { id, state: "sent", error: null }
            : { id, state: "failed", error: result.message }
          : item,
      ),
    );
  }

  const confirmReason =
    disabledReason ??
    (validation.ok ? undefined : FINDINGS_REASON_COPY[validation.reason]);

  /* ------------------------------------------------- confirmed, collapsed */

  if (confirmed !== null && !isEditing) {
    return (
      <div
        data-condition-form="true"
        data-condition-state="confirmed"
        data-assessed-condition={derivedCondition}
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border p-4",
          INTENT_SURFACE_CLASSES.ok,
          className,
        )}
      >
        <Check aria-hidden="true" className="size-4 shrink-0" />
        <span className="text-label">Assessed condition</span>
        <StatusBadge system="assessed_condition" value={derivedCondition} />
        <span data-condition-confirmed-by="true" className="text-caption">
          {`Confirmed by ${confirmed.byName} at ${confirmed.at}`}
        </span>
        {isDisabled ? null : (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            data-condition-change="true"
            onClick={() => setIsEditing(true)}
            className={cn(ACTION_BUTTON_CLASS, "ml-auto")}
          >
            Change
          </Button>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------ editing */

  return (
    <div
      data-condition-form="true"
      data-condition-state={isDisabled ? "disabled" : "editing"}
      data-assessed-condition={derivedCondition}
      className={cn("flex flex-col gap-4", className)}
    >
      {isDisabled ? (
        <Alert
          role="status"
          data-condition-disabled="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.neutral)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">{disabledReason}</AlertTitle>
        </Alert>
      ) : null}

      <fieldset
        aria-labelledby={`${groupId}-legend`}
        aria-disabled={isDisabled ? "true" : undefined}
        className="flex flex-col gap-2"
      >
        <legend id={`${groupId}-legend`} className="text-label text-foreground">
          What did you observe?
        </legend>
        <ul className="flex flex-col gap-1">
          {DAMAGE_FINDING_TYPES.map((finding) => {
            const checkboxId = `${groupId}-${finding}`;
            const isChecked = findings.includes(finding);
            return (
              <li key={finding}>
                <label
                  htmlFor={checkboxId}
                  data-finding-row={finding}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-body hover:bg-muted"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={isChecked}
                    aria-disabled={isDisabled ? "true" : undefined}
                    data-finding={finding}
                    onCheckedChange={(state) => {
                      if (isDisabled) return;
                      toggleFinding(finding, state === true);
                    }}
                  />
                  <span>{DAMAGE_FINDING_TYPE_LABELS[finding]}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <label
        htmlFor={`${groupId}-defective`}
        data-finding-row="defective"
        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-body hover:bg-muted"
      >
        <Checkbox
          id={`${groupId}-defective`}
          checked={isDefective}
          aria-disabled={isDisabled ? "true" : undefined}
          data-defective="true"
          onCheckedChange={(state) => {
            if (isDisabled) return;
            void change(findings, state === true);
          }}
        />
        <span>Functionally defective</span>
      </label>

      {/* The derivation, as text and badge. */}
      <div
        data-derived-condition={derivedCondition}
        className="flex flex-wrap items-center gap-3"
      >
        <span className="text-label text-foreground">Assessed condition</span>
        <StatusBadge system="assessed_condition" value={derivedCondition} />
        {validation.ok ? null : (
          <span className="text-caption text-muted-foreground">
            {FINDINGS_REASON_COPY[validation.reason]}
          </span>
        )}
      </div>

      {isDdr ? (
        <p
          data-ddr-sentence="true"
          className={cn("max-w-[72ch] text-body", INTENT_TEXT_CLASSES.critical)}
        >
          {DDR_SENTENCE}
        </p>
      ) : null}

      {/* The damage-photo prompt, when the findings warrant one. */}
      {isDdr && damagePhoto !== null ? (
        <div
          data-damage-photo-prompt="true"
          className="flex flex-col gap-2 rounded-lg border border-border p-4"
        >
          <p className="text-body-strong">Add a photo of the damage</p>
          <p className="max-w-[72ch] text-body text-muted-foreground">
            The photo goes on the record beside the finding. It is evidence, not
            a substitute for what you observed.
          </p>
          <PhotoCaptureInput
            photoType="damage"
            capture
            variant="button"
            label="Add a damage photo"
            disabled={isDisabled}
            disabledReason={disabledReason}
            onFile={(file) => void uploadDamagePhoto(file)}
          />
          {photos.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {photos.map((photo, index) => (
                <li
                  key={photo.id}
                  data-damage-photo={photo.id}
                  data-upload-state={photo.state}
                  className="flex flex-wrap items-center gap-2 text-caption"
                >
                  <span>{`Damage photo ${index + 1}`}</span>
                  <span
                    className={
                      photo.state === "failed"
                        ? INTENT_TEXT_CLASSES.critical
                        : photo.state === "sent"
                          ? INTENT_TEXT_CLASSES.ok
                          : undefined
                    }
                  >
                    {photo.state === "uploading"
                      ? "Sending"
                      : photo.state === "sent"
                        ? "Sent"
                        : "Not sent"}
                  </span>
                  {photo.error !== null ? <span>{photo.error}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {error !== null ? (
        <Alert
          role="alert"
          data-condition-error="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">{error}</AlertTitle>
          <AlertDescription className="text-body text-current">
            Nothing has changed. Try again.
          </AlertDescription>
        </Alert>
      ) : null}

      {confirmReason === undefined ? (
        <Button
          type="button"
          variant="default"
          size="lg"
          aria-busy={isConfirming ? "true" : undefined}
          aria-disabled={isConfirming ? "true" : undefined}
          data-confirm-condition="true"
          data-action-state={isConfirming ? "pending" : "idle"}
          onClick={() => void confirm()}
          className={cn(ACTION_BUTTON_CLASS, "w-full sm:w-auto")}
        >
          {isConfirming ? "Confirming…" : "Confirm assessed condition"}
        </Button>
      ) : (
        <GatedControl reason={confirmReason}>
          <Button
            type="button"
            variant="default"
            size="lg"
            aria-disabled="true"
            data-disabled="true"
            data-confirm-condition="true"
            onClick={(event) => event.preventDefault()}
            className={cn(ACTION_BUTTON_CLASS, "opacity-60")}
          >
            Confirm assessed condition
          </Button>
        </GatedControl>
      )}
    </div>
  );
}
