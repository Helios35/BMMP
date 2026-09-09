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
  PROVENANCE_SOURCE_TYPE_LABELS,
  PROVENANCE_SOURCE_TYPES,
  type ProvenanceSourceType,
} from "@/domain/taxonomy/provenance-source-type";
import type { ActionResult } from "@/lib/action-result";
import type { DraftSourceDevice } from "@/types/intake";
import { cn } from "@/lib/utils";

import { useSyncedText } from "./state-of-charge-form";

/**
 * `SourceDeviceForm` — step 3's optional source device (`UX_SPEC.md` §3.9;
 * T-11).
 *
 * What the battery came out of: a T-11 provenance type and, freely typed, the
 * identifier (a VIN, a serial, an asset tag), the make, the model and the
 * model year. **Captured for the record. Verification is a later phase —
 * nothing here claims it has been checked.** A VIN typed here is a string a
 * person typed; the helper text says so, and no field is labelled *verified*.
 *
 * `DraftSourceDevice.type` — a device type distinct from the provenance
 * type — has no taxonomy behind it and is not rendered; it is sent as `null`.
 * See the build-notes.
 *
 * Each text field is sent on blur; the select on change.
 */

export interface SourceDeviceFormProps {
  readonly value: DraftSourceDevice | null;
  readonly onChange: (
    value: DraftSourceDevice,
  ) => Promise<ActionResult<unknown>>;
  readonly className?: string;
}

export const SOURCE_DEVICE_HELPER =
  "Captured for the record. Verification is a later phase — nothing here claims it has been checked.";

const EMPTY: DraftSourceDevice = {
  type: null,
  identifier: null,
  make: null,
  model: null,
  modelYear: null,
  provenanceSourceType: "unknown_provenance",
};

function blankToNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

function yearFrom(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function SourceDeviceForm({
  value,
  onChange,
  className,
}: SourceDeviceFormProps): ReactElement {
  const id = useId();
  const current = value ?? EMPTY;
  const [identifier, setIdentifier] = useSyncedText(current.identifier ?? "");
  const [make, setMake] = useSyncedText(current.make ?? "");
  const [model, setModel] = useSyncedText(current.model ?? "");
  const [modelYear, setModelYear] = useSyncedText(
    current.modelYear === null ? "" : String(current.modelYear),
  );
  const [yearError, setYearError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(next: DraftSourceDevice): Promise<void> {
    setError(null);
    const result = await onChange(next);
    if (!result.ok) setError(result.error.message);
  }

  function compose(
    provenanceSourceType: ProvenanceSourceType = current.provenanceSourceType,
  ): DraftSourceDevice {
    return {
      type: null,
      identifier: blankToNull(identifier),
      make: blankToNull(make),
      model: blankToNull(model),
      modelYear: yearFrom(modelYear),
      provenanceSourceType,
    };
  }

  function changeType(next: string): void {
    if (!isTaxonomyValue(PROVENANCE_SOURCE_TYPES, next)) return;
    void submit(compose(next));
  }

  function commitText(): void {
    const trimmedYear = modelYear.trim();
    if (trimmedYear !== "" && yearFrom(trimmedYear) === null) {
      setYearError("Enter the model year as four digits.");
      return;
    }
    setYearError(null);
    void submit(compose());
  }

  const fieldClass = "min-h-11 rounded-md text-body";

  return (
    <div
      data-source-device-form="true"
      data-provenance-source-type={current.provenanceSourceType}
      className={cn("flex flex-col gap-4", className)}
    >
      <p
        data-source-device-helper="true"
        className="max-w-[72ch] text-body text-muted-foreground"
      >
        {SOURCE_DEVICE_HELPER}
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-type`} className="text-label text-foreground">
          Where it came from
        </Label>
        <Select value={current.provenanceSourceType} onValueChange={changeType}>
          <SelectTrigger
            id={`${id}-type`}
            data-provenance-trigger="true"
            className={cn(fieldClass, "w-full")}
          >
            <SelectValue placeholder="Choose a source" />
          </SelectTrigger>
          <SelectContent className="rounded-lg">
            {PROVENANCE_SOURCE_TYPES.map((candidate) => (
              <SelectItem
                key={candidate}
                value={candidate}
                className="min-h-11 rounded-md text-body"
              >
                {PROVENANCE_SOURCE_TYPE_LABELS[candidate]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label
            htmlFor={`${id}-identifier`}
            className="text-label text-foreground"
          >
            Identifier
          </Label>
          <Input
            id={`${id}-identifier`}
            name="sourceDeviceIdentifier"
            autoComplete="off"
            value={identifier}
            data-source-device-field="identifier"
            onChange={(event) => setIdentifier(event.currentTarget.value)}
            onBlur={commitText}
            className={cn(fieldClass, "text-mono")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-make`} className="text-label text-foreground">
            Make
          </Label>
          <Input
            id={`${id}-make`}
            name="sourceDeviceMake"
            autoComplete="off"
            value={make}
            data-source-device-field="make"
            onChange={(event) => setMake(event.currentTarget.value)}
            onBlur={commitText}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-model`} className="text-label text-foreground">
            Model
          </Label>
          <Input
            id={`${id}-model`}
            name="sourceDeviceModel"
            autoComplete="off"
            value={model}
            data-source-device-field="model"
            onChange={(event) => setModel(event.currentTarget.value)}
            onBlur={commitText}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-year`} className="text-label text-foreground">
            Model year
          </Label>
          <Input
            id={`${id}-year`}
            name="sourceDeviceModelYear"
            inputMode="numeric"
            autoComplete="off"
            value={modelYear}
            aria-invalid={yearError === null ? undefined : "true"}
            aria-describedby={
              yearError === null ? undefined : `${id}-year-error`
            }
            data-source-device-field="modelYear"
            onChange={(event) => setModelYear(event.currentTarget.value)}
            onBlur={commitText}
            className={fieldClass}
          />
          {yearError !== null ? (
            <p
              id={`${id}-year-error`}
              className="text-caption text-muted-foreground"
            >
              {yearError}
            </p>
          ) : null}
        </div>
      </div>

      {error !== null ? (
        <Alert
          role="alert"
          data-source-device-error="true"
          className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="text-body-strong">{error}</AlertTitle>
        </Alert>
      ) : null}
    </div>
  );
}
