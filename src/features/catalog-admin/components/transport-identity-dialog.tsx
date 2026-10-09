"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactElement } from "react";
import { toast } from "sonner";

import {
  InlineActionError,
  ReviewButton,
} from "@/components/extraction-review/review-controls";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { editCatalogTransportIdentity } from "../actions";
import {
  CANCEL,
  IDENTITY_EDIT,
  IDENTITY_EDIT_BODY,
  IDENTITY_EDIT_TITLE,
  IDENTITY_HAZARD_CLASS,
  IDENTITY_PACKING_GROUP,
  IDENTITY_PSN,
  IDENTITY_REASON,
  IDENTITY_REASON_REQUIRED,
  IDENTITY_SAVE,
  IDENTITY_SAVED,
  IDENTITY_SAVING,
  IDENTITY_UN,
  IDENTITY_UN_UNSET,
} from "../catalog-admin-copy";

/**
 * **Edit shipping identity** — D-50; `UX_SPEC.md` §3.19; Rule 5.9.
 *
 * P6 only: the route is P6's, and the server refuses every other role. The
 * identification number and the packing group are chosen from their taxonomy
 * systems (T-17, T-19) — never typed; the proper shipping name and the hazard
 * class are P6's to state. **A reason is required**, and the edit is audited
 * with its before and after. A shipping paper already issued is never changed
 * by it (Rule 5.12) — only papers generated afterwards read the new values.
 */

export interface TransportIdentityDialogProps {
  readonly catalogEntryId: string;
  readonly entryTitle: string;
  readonly current: {
    readonly unIdentifier: string | null;
    readonly properShippingName: string | null;
    readonly hazardClass: string | null;
    readonly packingGroup: string;
  };
  readonly unOptions: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly packingGroupOptions: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}

export function TransportIdentityDialog({
  catalogEntryId,
  entryTitle,
  current,
  unOptions,
  packingGroupOptions,
}: TransportIdentityDialogProps): ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unIdentifier, setUnIdentifier] = useState(current.unIdentifier ?? "");
  const [properShippingName, setProperShippingName] = useState(
    current.properShippingName ?? "",
  );
  const [hazardClass, setHazardClass] = useState(current.hazardClass ?? "");
  const [packingGroup, setPackingGroup] = useState(current.packingGroup);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = {
    un: useId(),
    psn: useId(),
    hazard: useId(),
    pg: useId(),
    reason: useId(),
  };

  async function save(): Promise<void> {
    if (pending || reason.trim() === "") return;
    setPending(true);
    setError(null);
    try {
      const result = await editCatalogTransportIdentity({
        catalogEntryId,
        unIdentifier: unIdentifier === "" ? null : unIdentifier,
        properShippingName:
          properShippingName.trim() === "" ? null : properShippingName,
        hazardClass: hazardClass.trim() === "" ? null : hazardClass,
        packingGroup,
        reason,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(IDENTITY_SAVED);
      setOpen(false);
      setReason("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          data-edit-identity={catalogEntryId}
          className={ACTION_BUTTON_CLASS}
        >
          {IDENTITY_EDIT}
        </Button>
      </DialogTrigger>
      <DialogContent
        data-identity-dialog={catalogEntryId}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-h2">{IDENTITY_EDIT_TITLE}</DialogTitle>
          <DialogDescription className="text-body">
            {`${entryTitle}. ${IDENTITY_EDIT_BODY}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={ids.un} className="text-label">
              {IDENTITY_UN}
            </Label>
            <Select value={unIdentifier} onValueChange={setUnIdentifier}>
              <SelectTrigger
                id={ids.un}
                data-identity-un="true"
                className="min-h-11 rounded-md text-body"
              >
                <SelectValue placeholder={IDENTITY_UN_UNSET} />
              </SelectTrigger>
              <SelectContent>
                {unOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="min-h-11 text-body"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={ids.psn} className="text-label">
              {IDENTITY_PSN}
            </Label>
            <Input
              id={ids.psn}
              value={properShippingName}
              onChange={(event) => setProperShippingName(event.target.value)}
              data-identity-psn="true"
              className="h-11 rounded-md text-body"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={ids.hazard} className="text-label">
              {IDENTITY_HAZARD_CLASS}
            </Label>
            <Input
              id={ids.hazard}
              value={hazardClass}
              onChange={(event) => setHazardClass(event.target.value)}
              data-identity-hazard="true"
              className="h-11 rounded-md text-body"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={ids.pg} className="text-label">
              {IDENTITY_PACKING_GROUP}
            </Label>
            <Select value={packingGroup} onValueChange={setPackingGroup}>
              <SelectTrigger
                id={ids.pg}
                data-identity-pg="true"
                className="min-h-11 rounded-md text-body"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {packingGroupOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="min-h-11 text-body"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={ids.reason} className="text-label">
              {IDENTITY_REASON}
            </Label>
            <Textarea
              id={ids.reason}
              value={reason}
              aria-required="true"
              onChange={(event) => setReason(event.target.value)}
              data-identity-reason="true"
              className="min-h-16 rounded-md text-body"
            />
          </div>
        </div>
        {error === null ? null : (
          <InlineActionError
            message={error}
            dataAttribute="data-identity-error"
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={ACTION_BUTTON_CLASS}
            >
              {CANCEL}
            </Button>
          </DialogClose>
          <ReviewButton
            pending={pending}
            pendingLabel={IDENTITY_SAVING}
            gatedReason={reason.trim() === "" ? IDENTITY_REASON_REQUIRED : null}
            onPress={() => void save()}
            data-identity-save="true"
          >
            {IDENTITY_SAVE}
          </ReviewButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
