"use client";

import { useId, useState, type ReactElement } from "react";
import { CircleAlert } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";
import {
  STATE_OF_CHARGE_BAND_LABELS,
  STATE_OF_CHARGE_BANDS,
  type StateOfChargeBand,
} from "@/domain/taxonomy/state-of-charge-band";
import {
  STATE_OF_CHARGE_SOURCE_LABELS,
  STATE_OF_CHARGE_SOURCES,
  type StateOfChargeSource,
} from "@/domain/taxonomy/state-of-charge-source";
import { isDecimalString } from "@/domain/units";
import type { ActionResult } from "@/lib/action-result";
import type { DraftStateOfCharge } from "@/types/intake";
import { cn } from "@/lib/utils";

/**
 * `StateOfChargeForm` — step 3's state of charge (`UX_SPEC.md` §3.9;
 * T-21, T-55).
 *
 * **The band is what is recorded.** T-21's values name a relationship to a
 * storage limit, and the limit itself is jurisdiction data the record never
 * carries — a person says *at or below* or *above*, and which figure that
 * was measured against is the rule version's business (Rule 1.23). The
 * optional reading is stored as read, as a decimal string, and is never a
 * health figure: a pack at a high reading is not a good pack, it is a pack
 * at a high reading.
 *
 * Each change is sent to `setStateOfCharge`; the reading is sent on blur so
 * a person typing is not interrupted mid-number. A malformed reading is
 * refused here with the reason and never sent.
 */

export interface StateOfChargeFormProps {
  readonly value: DraftStateOfCharge | null;
  readonly onChange: (
    value: DraftStateOfCharge,
  ) => Promise<ActionResult<unknown>>;
  readonly className?: string;
}

/**
 * Local text that follows an external value when the server re-renders it,
 * without an effect: the documented "adjust state while rendering" pattern.
 * A person's half-typed reading survives until the server says otherwise.
 */
export function useSyncedText(
  external: string,
): [string, (next: string) => void] {
  const [text, setText] = useState(external);
  const [synced, setSynced] = useState(external);
  if (external !== synced) {
    setSynced(external);
    setText(external);
  }
  return [text, setText];
}

const READING_HELPER = "As read. Never a health figure.";
const READING_INVALID =
  "Enter the reading as digits, with a decimal point if needed.";

export function StateOfChargeForm({
  value,
  onChange,
  className,
}: StateOfChargeFormProps): ReactElement {
  const id = useId();
  const [reading, setReading] = useSyncedText(value?.percent ?? "");
  const [readingError, setReadingError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const band: StateOfChargeBand | null = value?.band ?? null;
  const source: StateOfChargeSource | null = value?.source ?? null;

  async function submit(next: DraftStateOfCharge): Promise<void> {
    setError(null);
    const result = await onChange(next);
    if (!result.ok) setError(result.error.message);
  }

  function changeBand(nextBand: string): void {
    if (!isTaxonomyValue(STATE_OF_CHARGE_BANDS, nextBand)) return;
    void submit({ band: nextBand, percent: value?.percent ?? null, source });
  }

  function changeSource(nextSource: string): void {
    if (!isTaxonomyValue(STATE_OF_CHARGE_SOURCES, nextSource)) return;
    if (band === null) return;
    void submit({ band, percent: value?.percent ?? null, source: nextSource });
  }

  function commitReading(): void {
    const trimmed = reading.trim();
    if (trimmed === "") {
      setReadingError(null);
      if (band !== null && value?.percent !== null) {
        void submit({ band, percent: null, source });
      }
      return;
    }
    if (!isDecimalString(trimmed)) {
      setReadingError(READING_INVALID);
      return;
    }
    setReadingError(null);
    if (band === null) return;
    if (trimmed === value?.percent) return;
    void submit({ band, percent: trimmed, source });
  }

  return (
    <div
      data-state-of-charge-form="true"
      data-soc-band={band ?? undefined}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-band`} className="text-label text-foreground">
          State of charge
        </Label>
        <Select value={band ?? undefined} onValueChange={changeBand}>
          <SelectTrigger
            id={`${id}-band`}
            data-soc-band-trigger="true"
            className="min-h-11 w-full rounded-md text-body"
          >
            <SelectValue placeholder="Choose a band" />
          </SelectTrigger>
          <SelectContent className="rounded-lg">
            {STATE_OF_CHARGE_BANDS.map((candidate) => (
              <SelectItem
                key={candidate}
                value={candidate}
                className="min-h-11 rounded-md text-body"
              >
                {STATE_OF_CHARGE_BAND_LABELS[candidate]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="max-w-[72ch] text-caption text-muted-foreground">
          The storage limit itself is jurisdiction data; the band is what is
          recorded.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-reading`} className="text-label text-foreground">
          Reading (optional)
        </Label>
        <Input
          id={`${id}-reading`}
          name="stateOfChargePercent"
          inputMode="decimal"
          autoComplete="off"
          value={reading}
          aria-describedby={`${id}-reading-helper`}
          aria-invalid={readingError === null ? undefined : "true"}
          aria-disabled={band === null ? "true" : undefined}
          data-soc-reading="true"
          onChange={(event) => setReading(event.currentTarget.value)}
          onBlur={commitReading}
          className="min-h-11 rounded-md text-body"
        />
        <p
          id={`${id}-reading-helper`}
          className="text-caption text-muted-foreground"
        >
          {readingError ?? READING_HELPER}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-source`} className="text-label text-foreground">
          How it was read
        </Label>
        <Select value={source ?? undefined} onValueChange={changeSource}>
          <SelectTrigger
            id={`${id}-source`}
            data-soc-source-trigger="true"
            aria-disabled={band === null ? "true" : undefined}
            className="min-h-11 w-full rounded-md text-body"
          >
            <SelectValue placeholder="Choose a source" />
          </SelectTrigger>
          <SelectContent className="rounded-lg">
            {STATE_OF_CHARGE_SOURCES.map((candidate) => (
              <SelectItem
                key={candidate}
                value={candidate}
                className="min-h-11 rounded-md text-body"
              >
                {STATE_OF_CHARGE_SOURCE_LABELS[candidate]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error !== null ? (
        <Alert
          role="alert"
          data-soc-error="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">{error}</AlertTitle>
        </Alert>
      ) : null}
    </div>
  );
}
