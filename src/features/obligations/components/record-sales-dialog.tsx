"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactElement } from "react";

import {
  InlineActionError,
  ReviewButton,
  useActionCall,
} from "@/components/extraction-review/review-controls";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

import { recordSales } from "../actions";
import {
  RECORD_SALES,
  RECORDING,
  SALES_BODY,
  SALES_NOTE,
  SALES_NOTE_HINT,
  SALES_NOTE_REQUIRED,
  SALES_PAIR,
  SALES_PAIR_PLACEHOLDER,
  SALES_UNITS,
  SALES_UNITS_HINT,
  SALES_UNITS_REQUIRED,
} from "../obligation-copy";

/**
 * **Record sales** — Rule 8.17; `UX_SPEC.md` §3.21. Units (a whole number,
 * zero allowed) and a required note for one product, state and year. **Only
 * units are typed**; weight and energy come from the catalog. Recording again
 * for the same product, state and year is a correction — the dialog says so,
 * and the old entry stays, shown as replaced.
 *
 * From the table's toolbar it asks for the product and state (the phone card
 * has no row actions); from a row, they are that row's.
 */

export interface SalesPair {
  readonly key: string;
  readonly productId: string;
  readonly jurisdictionId: string;
  readonly label: string;
  /** What is on file now, in words — recording again replaces it. */
  readonly correction: string | null;
}

const WHOLE_NUMBER = /^\d+$/u;

export function RecordSalesDialog({
  pairs,
  year,
  preset = null,
}: {
  readonly pairs: readonly SalesPair[];
  readonly year: number;
  /** A row's own pair; the select is not shown. */
  readonly preset?: string | null;
}): ReactElement {
  const router = useRouter();
  const call = useActionCall();
  const pairId = useId();
  const unitsId = useId();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(preset ?? "");
  const [units, setUnits] = useState("");
  const [note, setNote] = useState("");

  const pair = pairs.find((candidate) => candidate.key === key) ?? null;
  const trimmedUnits = units.trim();
  const trimmedNote = note.trim();
  const gated =
    pair === null
      ? SALES_PAIR_PLACEHOLDER
      : !WHOLE_NUMBER.test(trimmedUnits)
        ? SALES_UNITS_REQUIRED
        : trimmedNote === ""
          ? SALES_NOTE_REQUIRED
          : null;

  async function confirm(): Promise<void> {
    if (gated !== null || pair === null) return;
    const result = await call.run(() =>
      recordSales({
        productId: pair.productId,
        jurisdictionId: pair.jurisdictionId,
        year,
        units: Number(trimmedUnits),
        basisNote: trimmedNote,
      }),
    );
    if (result?.ok === true) {
      setOpen(false);
      setUnits("");
      setNote("");
      if (preset === null) setKey("");
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={preset === null ? "default" : "outline"}
        size="lg"
        className={ACTION_BUTTON_CLASS}
        onClick={() => setOpen(true)}
        data-record-sales={preset ?? "toolbar"}
      >
        {RECORD_SALES}
      </Button>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg"
        data-record-sales-dialog={preset ?? "toolbar"}
      >
        <DialogHeader>
          <DialogTitle className="text-h2">
            {`${RECORD_SALES} — ${String(year)}`}
          </DialogTitle>
          <DialogDescription className="text-body">
            {SALES_BODY}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {preset === null ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={pairId} className="text-label text-foreground">
                {SALES_PAIR}
              </Label>
              <Select value={key} onValueChange={setKey}>
                <SelectTrigger
                  id={pairId}
                  className="min-h-11 w-full rounded-md text-body"
                  data-record-sales-pair="true"
                >
                  <SelectValue placeholder={SALES_PAIR_PLACEHOLDER} />
                </SelectTrigger>
                <SelectContent>
                  {pairs.map((option) => (
                    <SelectItem
                      key={option.key}
                      value={option.key}
                      className="min-h-11 text-body"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-body-strong" data-record-sales-for="true">
              {pair?.label}
            </p>
          )}
          {pair?.correction === null || pair === null ? null : (
            <p
              className="rounded-md border border-border p-3 text-body"
              data-record-sales-correction="true"
            >
              {pair.correction}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor={unitsId} className="text-label text-foreground">
              {SALES_UNITS}
            </Label>
            <Input
              id={unitsId}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={units}
              onChange={(event) => setUnits(event.currentTarget.value)}
              className="min-h-11 rounded-md text-body"
              data-record-sales-units="true"
            />
            <p className="text-caption text-muted-foreground">
              {SALES_UNITS_HINT}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={noteId} className="text-label text-foreground">
              {SALES_NOTE}
            </Label>
            <Textarea
              id={noteId}
              required
              aria-required="true"
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              className="min-h-16 rounded-md text-body"
              data-record-sales-note="true"
            />
            <p className="text-caption text-muted-foreground">
              {SALES_NOTE_HINT}
            </p>
          </div>
        </div>
        {call.error === null ? null : (
          <InlineActionError
            dataAttribute="data-dialog-error"
            message={call.error}
          />
        )}
        <DialogFooter className="rounded-b-lg">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setOpen(false)}
            className={ACTION_BUTTON_CLASS}
          >
            Cancel
          </Button>
          <ReviewButton
            variant="default"
            pending={call.pending}
            pendingLabel={RECORDING}
            gatedReason={gated}
            onPress={() => void confirm()}
            data-record-sales-submit="true"
          >
            {RECORD_SALES}
          </ReviewButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
