"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactElement } from "react";
import { toast } from "sonner";

import {
  InlineActionError,
  ReviewButton,
} from "@/components/extraction-review/review-controls";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveEmergencyContact, verifyEmergencyContact } from "../actions";
import {
  EMERGENCY_ATTESTATION,
  EMERGENCY_CANCEL,
  EMERGENCY_PHONE_HINT,
  EMERGENCY_PHONE_LABEL,
  EMERGENCY_REF_LABEL,
  EMERGENCY_SAVE,
  EMERGENCY_SAVE_CLEARS,
  EMERGENCY_SAVED,
  EMERGENCY_SAVED_DETAIL,
  EMERGENCY_SAVING,
  EMERGENCY_UNCHANGED,
  EMERGENCY_VERIFIED,
  EMERGENCY_VERIFY,
  EMERGENCY_VERIFY_CONFIRM,
  EMERGENCY_VERIFY_DETAIL,
  EMERGENCY_VERIFY_NEEDS_NUMBER,
  EMERGENCY_VERIFY_TITLE,
  EMERGENCY_VERIFY_UNSAVED,
  EMERGENCY_VERIFYING,
} from "../copy";

/**
 * Editing and verifying the 24-hour emergency contact — `UX_SPEC.md` §3.17,
 * E-11; D-32, D-63; Rules 5.6, 5.7.
 *
 * **Two acts, never one.** **Save changes** writes the number and the
 * reference, and any change clears the verification in the same write — the
 * form says so before the person saves. **Verify this number** is a button,
 * then a confirm carrying the attestation sentence; the server stamps the
 * date from its clock and the person from the session. Nothing here sends a
 * date or a name, because there is no field for either.
 *
 * Verify is inert while the form holds an unsaved change: the number verified
 * is the number on file, and the server refuses an attestation to any other.
 *
 * E-11: when the person arrived from a shipment draft (`returnTo`), a
 * recorded verification takes them back to it.
 */
export function EmergencyContactControls({
  phone,
  contractRef,
  returnTo,
}: {
  readonly phone: string | null;
  readonly contractRef: string | null;
  /** The draft to land back on after a verification, already validated. */
  readonly returnTo: string | null;
}): ReactElement {
  const router = useRouter();
  const phoneId = useId();
  const refId = useId();
  const hintId = useId();

  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [refValue, setRefValue] = useState(contractRef ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{
    readonly message: string;
    readonly field: string | null;
  } | null>(null);

  const [open, setOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const onFile = phone?.trim() ?? "";
  const dirty =
    phoneValue.trim() !== onFile || refValue.trim() !== (contractRef ?? "");

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveEmergencyContact({
        phone: phoneValue,
        contractRef: refValue,
      });
      if (!result.ok) {
        setSaveError({
          message: result.error.message,
          field: result.error.field ?? null,
        });
        return;
      }
      if (result.data.changed) {
        toast.success(EMERGENCY_SAVED, { description: EMERGENCY_SAVED_DETAIL });
      } else {
        toast(EMERGENCY_UNCHANGED);
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function verify(): Promise<void> {
    if (verifying) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await verifyEmergencyContact({ phone: onFile });
      if (!result.ok) {
        setVerifyError(result.error.message);
        return;
      }
      setOpen(false);
      toast.success(EMERGENCY_VERIFIED);
      if (returnTo !== null) {
        router.push(returnTo);
        return;
      }
      router.refresh();
    } finally {
      setVerifying(false);
    }
  }

  const verifyGate =
    onFile === ""
      ? EMERGENCY_VERIFY_NEEDS_NUMBER
      : dirty
        ? EMERGENCY_VERIFY_UNSAVED
        : null;

  return (
    <div className="flex flex-col gap-6" data-emergency-controls="true">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => void save(event)}
        data-emergency-form="true"
        noValidate
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={phoneId} className="text-label">
            {EMERGENCY_PHONE_LABEL}
          </Label>
          <Input
            id={phoneId}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phoneValue}
            onChange={(event) => setPhoneValue(event.target.value)}
            aria-describedby={hintId}
            aria-invalid={saveError?.field === "phone" ? true : undefined}
            data-emergency-field="phone"
            className="h-11 max-w-sm font-mono"
          />
          <p id={hintId} className="text-caption text-muted-foreground">
            {EMERGENCY_PHONE_HINT}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={refId} className="text-label">
            {EMERGENCY_REF_LABEL}
          </Label>
          <Input
            id={refId}
            name="contractRef"
            autoComplete="off"
            value={refValue}
            onChange={(event) => setRefValue(event.target.value)}
            aria-invalid={saveError?.field === "contractRef" ? true : undefined}
            data-emergency-field="contractRef"
            className="h-11 max-w-sm font-mono"
          />
        </div>
        <p className="max-w-[72ch] text-body" data-emergency-save-clears="true">
          {EMERGENCY_SAVE_CLEARS}
        </p>
        {saveError === null ? null : (
          <InlineActionError
            message={saveError.message}
            dataAttribute="data-emergency-save-error"
          />
        )}
        <div>
          <ReviewButton
            type="submit"
            pending={saving}
            pendingLabel={EMERGENCY_SAVING}
            data-emergency-save="true"
          >
            {EMERGENCY_SAVE}
          </ReviewButton>
        </div>
      </form>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setVerifyError(null);
        }}
      >
        <div>
          <ReviewButton
            variant="outline"
            gatedReason={verifyGate}
            onPress={() => setOpen(true)}
            data-emergency-verify="true"
          >
            {EMERGENCY_VERIFY}
          </ReviewButton>
        </div>
        <AlertDialogContent data-emergency-verify-dialog="true">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-h2">
              {EMERGENCY_VERIFY_TITLE}
            </AlertDialogTitle>
            <AlertDialogDescription className="grid gap-3 text-body">
              <span className="font-mono text-body-strong">{onFile}</span>
              <span
                className="text-body-strong"
                data-emergency-attestation="true"
              >
                {EMERGENCY_ATTESTATION}
              </span>
              <span>{EMERGENCY_VERIFY_DETAIL}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {verifyError === null ? null : (
            <InlineActionError
              message={verifyError}
              dataAttribute="data-emergency-verify-error"
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className={ACTION_BUTTON_CLASS}>
              {EMERGENCY_CANCEL}
            </AlertDialogCancel>
            <ReviewButton
              pending={verifying}
              pendingLabel={EMERGENCY_VERIFYING}
              onPress={() => void verify()}
              data-emergency-verify-confirm="true"
            >
              {EMERGENCY_VERIFY_CONFIRM}
            </ReviewButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
