"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactElement } from "react";
import { toast } from "sonner";

import { GatedControl } from "@/components/access/gated-control";
import { ReasonDialog } from "@/components/extraction-review/reason-dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import { recordArrival, recordDeparture, voidPaper } from "../actions";
import {
  ARRIVE,
  ARRIVE_BODY,
  ARRIVE_CONFIRM,
  ARRIVE_REFERENCE,
  ARRIVE_TITLE,
  ARRIVING,
  CANCEL,
  CHANGE_CONTENTS,
  CONTINUE_SHIPMENT,
  DEPART,
  DEPART_BODY,
  DEPART_CONFIRM,
  DEPART_TITLE,
  DEPARTING,
  VOID_PAPER,
  VOID_PAPER_BODY,
  VOID_PAPER_CONFIRM,
  VOID_PAPER_REASON,
  VOID_PAPER_REASON_REQUIRED,
  VOID_PAPER_TITLE,
  VOIDING_PAPER,
} from "../shipment-copy";

/**
 * `/shipments/[id]`'s writes — `UX_SPEC.md` §3.13; Rules 5.13, 5.17, 5.26.
 *
 * **What renders is decided on the server** from `ROUTE_ACCESS` and the
 * shipment's status, and passed in; this island decides nothing about
 * access or about whether a shipment may depart. Departure and arrival are
 * recorded acts, each confirmed in a dialog; the server refuses either with
 * its stated reason, which renders in the dialog beside the act it refused.
 *
 * The auditor sees the controls disabled with their reason (E-8a); every
 * other read-only role sees none.
 */

export interface ShipmentActionsProps {
  readonly shipmentId: string;
  readonly can: {
    readonly continueBuilding: boolean;
    readonly changeContents: boolean;
    readonly depart: boolean;
    readonly arrive: boolean;
    /** An issued paper, before departure (D-58 item 8). */
    readonly voidPaper: boolean;
  };
  /** E-8a — the auditor's reason, where the controls render disabled. */
  readonly readOnlyReason: string | null;
}

function useShipmentWrite() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(
    action: () => Promise<ActionResult<unknown>>,
    success: string,
  ): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  }
  return { pending, error, run };
}

function Inert({
  label,
  reason,
  attribute,
}: {
  readonly label: string;
  readonly reason: string;
  readonly attribute: string;
}): ReactElement {
  return (
    <GatedControl reason={reason}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        aria-disabled="true"
        data-disabled="true"
        data-mutating="true"
        {...{ [attribute]: "true" }}
        className={cn(ACTION_BUTTON_CLASS, "opacity-60")}
      >
        {label}
      </Button>
    </GatedControl>
  );
}

export function ShipmentActions({
  shipmentId,
  can,
  readOnlyReason,
}: ShipmentActionsProps): ReactElement | null {
  if (readOnlyReason !== null) {
    return (
      <div data-shipment-actions="read-only" className="flex flex-wrap gap-2">
        <Inert label={DEPART} reason={readOnlyReason} attribute="data-depart" />
        <Inert
          label={CHANGE_CONTENTS}
          reason={readOnlyReason}
          attribute="data-change-contents"
        />
      </div>
    );
  }
  if (
    !can.continueBuilding &&
    !can.changeContents &&
    !can.depart &&
    !can.arrive &&
    !can.voidPaper
  ) {
    return null;
  }
  return (
    <div
      data-shipment-actions="true"
      className="flex flex-wrap items-center gap-2"
    >
      {can.continueBuilding ? (
        <Button asChild size="lg" className={ACTION_BUTTON_CLASS}>
          <Link
            href={`/shipments/new?shipment=${shipmentId}&step=3`}
            data-continue-shipment="true"
          >
            {CONTINUE_SHIPMENT}
          </Link>
        </Button>
      ) : null}
      {can.depart ? <DepartDialog shipmentId={shipmentId} /> : null}
      {can.arrive ? <ArriveDialog shipmentId={shipmentId} /> : null}
      {can.voidPaper ? (
        <ReasonDialog
          copy={{
            trigger: VOID_PAPER,
            title: VOID_PAPER_TITLE,
            body: VOID_PAPER_BODY,
            reasonLabel: VOID_PAPER_REASON,
            reasonRequired: VOID_PAPER_REASON_REQUIRED,
            confirm: VOID_PAPER_CONFIRM,
            confirming: VOIDING_PAPER,
            cancel: CANCEL,
          }}
          onSubmit={(reason) => voidPaper({ shipmentId, reason })}
          attributes={{
            trigger: { "data-void-paper": "true" },
            dialog: { "data-void-paper-dialog": "true" },
            reason: { "data-void-paper-reason": "true" },
            confirm: { "data-void-paper-confirm": "true" },
          }}
        />
      ) : null}
      {can.changeContents ? (
        <Button
          asChild
          variant="outline"
          size="lg"
          className={ACTION_BUTTON_CLASS}
        >
          <Link
            href={`/shipments/new?shipment=${shipmentId}&step=1`}
            data-change-contents="true"
          >
            {CHANGE_CONTENTS}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function DepartDialog({
  shipmentId,
}: {
  readonly shipmentId: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const write = useShipmentWrite();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <ReviewButton onPress={() => setOpen(true)} data-depart="true">
        {DEPART}
      </ReviewButton>
      <AlertDialogContent data-depart-dialog="true">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-h2">
            {DEPART_TITLE}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body">
            {DEPART_BODY}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {write.error === null ? null : (
          <InlineActionError
            message={write.error}
            dataAttribute="data-depart-error"
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className={ACTION_BUTTON_CLASS}>
            {CANCEL}
          </AlertDialogCancel>
          <ReviewButton
            pending={write.pending}
            pendingLabel={DEPARTING}
            onPress={() =>
              void write
                .run(() => recordDeparture({ shipmentId }), DEPART_CONFIRM)
                .then((done) => {
                  if (done) setOpen(false);
                })
            }
            data-depart-confirm="true"
          >
            {DEPART_CONFIRM}
          </ReviewButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ArriveDialog({
  shipmentId,
}: {
  readonly shipmentId: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const write = useShipmentWrite();
  const referenceId = useId();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <ReviewButton onPress={() => setOpen(true)} data-arrive="true">
        {ARRIVE}
      </ReviewButton>
      <AlertDialogContent data-arrive-dialog="true">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-h2">
            {ARRIVE_TITLE}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body">
            {ARRIVE_BODY}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={referenceId} className="text-label">
            {ARRIVE_REFERENCE}
          </Label>
          <Input
            id={referenceId}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="h-11 rounded-md text-body"
          />
        </div>
        {write.error === null ? null : (
          <InlineActionError
            message={write.error}
            dataAttribute="data-arrive-error"
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className={ACTION_BUTTON_CLASS}>
            {CANCEL}
          </AlertDialogCancel>
          <ReviewButton
            pending={write.pending}
            pendingLabel={ARRIVING}
            onPress={() =>
              void write
                .run(
                  () =>
                    recordArrival({
                      shipmentId,
                      receivedConfirmationRef:
                        reference.trim() === "" ? null : reference.trim(),
                    }),
                  ARRIVE_CONFIRM,
                )
                .then((done) => {
                  if (done) setOpen(false);
                })
            }
            data-arrive-confirm="true"
          >
            {ARRIVE_CONFIRM}
          </ReviewButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
