"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactElement } from "react";

import { GatedControl } from "@/components/access/gated-control";
import {
  InlineActionError,
  ReviewButton,
} from "@/components/extraction-review/review-controls";
import { SectionCard } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { TransportMode } from "@/domain/taxonomy/transport-mode";
import { cn } from "@/lib/utils";

import { assembleShipment, recordTransport } from "../actions";
import {
  CARRIER_LEGEND,
  DESTINATION_LEGEND,
  FIELD_CARRIER,
  FIELD_CARRIER_ID,
  FIELD_CITY,
  FIELD_COUNTRY,
  FIELD_DESTINATION_ID,
  FIELD_FACILITY,
  FIELD_LINE1,
  FIELD_LINE2,
  FIELD_POSTAL,
  FIELD_REGION,
  MODE_LEGEND,
  SAVE_AND_REVIEW,
  SAVING,
  TRANSPORT_DESCRIPTION,
  TRANSPORT_TITLE,
} from "../shipment-copy";

/**
 * Step 2, **Transport** — `UX_SPEC.md` §3.12; Flow B2, D5; Rules 5.10,
 * 5.16, 6.7–6.9.
 *
 * **The air block lives here, and this island does not decide it.** The
 * server assessed the records in scope with `assessAirTransport` and passes
 * each mode's availability; a blocked Air renders **visible and disabled**
 * beneath the route's `HardBlockNotice`, with the reason repeated in a
 * tooltip that is never the only place it appears (§2.6). Selecting it is
 * impossible here, and a request that arrives with it anyway is refused,
 * recorded and audited by the adapter — for every role (Rule 6.8).
 *
 * Saving writes the shipment (a new one is assembled here, because its
 * destination is a required column) and moves to review.
 */

export interface TransportModeOption {
  readonly value: TransportMode;
  readonly label: string;
  /** Null when the mode may be chosen; the one-line reason when it may not. */
  readonly unavailableReason: string | null;
}

export interface TransportDefaults {
  readonly transportMode: TransportMode;
  readonly destinationFacilityName: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
  readonly destinationIdentifier: string;
  readonly carrierName: string;
  readonly transporterIdentifier: string;
}

export interface TransportStepProps {
  readonly modes: readonly TransportModeOption[];
  readonly defaults: TransportDefaults;
  /** A new shipment carries its containers; an existing one its id. */
  readonly target:
    | { readonly kind: "new"; readonly containerIds: readonly string[] }
    | { readonly kind: "existing"; readonly shipmentId: string };
}

type FieldName = Exclude<keyof TransportDefaults, "transportMode">;

const TEXT_FIELDS: readonly {
  readonly name: FieldName;
  readonly label: string;
  readonly group: "destination" | "carrier";
  readonly autoComplete?: string;
}[] = [
  {
    name: "destinationFacilityName",
    label: FIELD_FACILITY,
    group: "destination",
    autoComplete: "organization",
  },
  {
    name: "line1",
    label: FIELD_LINE1,
    group: "destination",
    autoComplete: "address-line1",
  },
  {
    name: "line2",
    label: FIELD_LINE2,
    group: "destination",
    autoComplete: "address-line2",
  },
  {
    name: "city",
    label: FIELD_CITY,
    group: "destination",
    autoComplete: "address-level2",
  },
  {
    name: "region",
    label: FIELD_REGION,
    group: "destination",
    autoComplete: "address-level1",
  },
  {
    name: "postalCode",
    label: FIELD_POSTAL,
    group: "destination",
    autoComplete: "postal-code",
  },
  {
    name: "country",
    label: FIELD_COUNTRY,
    group: "destination",
    autoComplete: "country",
  },
  {
    name: "destinationIdentifier",
    label: FIELD_DESTINATION_ID,
    group: "destination",
  },
  { name: "carrierName", label: FIELD_CARRIER, group: "carrier" },
  { name: "transporterIdentifier", label: FIELD_CARRIER_ID, group: "carrier" },
];

export function TransportStep({
  modes,
  defaults,
  target,
}: TransportStepProps): ReactElement {
  const router = useRouter();
  const [values, setValues] = useState<TransportDefaults>(defaults);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{
    readonly message: string;
    readonly field: string | null;
  } | null>(null);
  const idPrefix = useId();

  function setMode(value: string): void {
    const option = modes.find((mode) => mode.value === value);
    // An unavailable mode is never selected — the radio is disabled, and a
    // value that arrives some other way is ignored here and refused there.
    if (option === undefined || option.unavailableReason !== null) return;
    setValues((current) => ({ ...current, transportMode: option.value }));
  }

  async function save(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    const fields = {
      transportMode: values.transportMode,
      destinationFacilityName: values.destinationFacilityName,
      line1: values.line1,
      line2: values.line2.trim() === "" ? null : values.line2,
      city: values.city,
      region: values.region,
      postalCode: values.postalCode,
      country: values.country,
      destinationIdentifier:
        values.destinationIdentifier.trim() === ""
          ? null
          : values.destinationIdentifier,
      carrierName: values.carrierName,
      transporterIdentifier:
        values.transporterIdentifier.trim() === ""
          ? null
          : values.transporterIdentifier,
    };
    try {
      const result =
        target.kind === "new"
          ? await assembleShipment({
              containerIds: target.containerIds,
              ...fields,
            })
          : await recordTransport({ shipmentId: target.shipmentId, ...fields });
      if (!result.ok) {
        setError({
          message: result.error.message,
          field: result.error.field ?? null,
        });
        return;
      }
      router.push(`/shipments/new?shipment=${result.data.shipmentId}&step=3`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function field(entry: (typeof TEXT_FIELDS)[number]): ReactElement {
    const id = `${idPrefix}-${entry.name}`;
    const invalid = error?.field === entry.name;
    return (
      <div key={entry.name} className="flex flex-col gap-1">
        <Label htmlFor={id} className="text-label">
          {entry.label}
        </Label>
        <Input
          id={id}
          value={values[entry.name]}
          aria-invalid={invalid ? "true" : undefined}
          {...(entry.autoComplete === undefined
            ? {}
            : { autoComplete: entry.autoComplete })}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              [entry.name]: event.target.value,
            }))
          }
          data-transport-field={entry.name}
          className="h-11 rounded-md text-body"
        />
      </div>
    );
  }

  return (
    <SectionCard
      title={TRANSPORT_TITLE}
      description={TRANSPORT_DESCRIPTION}
      dataAttributes={{ "data-transport-step": "true" }}
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label">{MODE_LEGEND}</legend>
          <RadioGroup
            value={values.transportMode}
            onValueChange={setMode}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {modes.map((mode) => {
              const id = `${idPrefix}-mode-${mode.value}`;
              const item = (
                <div
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md border border-border px-3",
                    mode.unavailableReason !== null && "opacity-60",
                  )}
                  data-mode-option={mode.value}
                  data-mode-available={
                    mode.unavailableReason === null ? "true" : "false"
                  }
                >
                  <RadioGroupItem
                    id={id}
                    value={mode.value}
                    disabled={mode.unavailableReason !== null}
                  />
                  <Label htmlFor={id} className="text-body">
                    {mode.label}
                  </Label>
                </div>
              );
              return mode.unavailableReason === null ? (
                <div key={mode.value}>{item}</div>
              ) : (
                <GatedControl
                  key={mode.value}
                  reason={mode.unavailableReason}
                  triggerClassName="w-full"
                >
                  {item}
                </GatedControl>
              );
            })}
          </RadioGroup>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-label">{DESTINATION_LEGEND}</legend>
          {TEXT_FIELDS.filter((entry) => entry.group === "destination").map(
            field,
          )}
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-label">{CARRIER_LEGEND}</legend>
          {TEXT_FIELDS.filter((entry) => entry.group === "carrier").map(field)}
        </fieldset>

        {error === null ? null : (
          <InlineActionError
            message={error.message}
            dataAttribute="data-transport-error"
          />
        )}

        <div>
          <ReviewButton
            type="submit"
            pending={pending}
            pendingLabel={SAVING}
            data-transport-save="true"
          >
            {SAVE_AND_REVIEW}
          </ReviewButton>
        </div>
      </form>
    </SectionCard>
  );
}
