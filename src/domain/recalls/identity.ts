import type { ProvenanceSourceType } from "@/domain/taxonomy/provenance-source-type";

import type { RecallQuery, RecallSearchSource } from "./hit";

/**
 * What a recall check can match a record against — Rule 10.11; D-73 #1.
 *
 * Two identities, each against its own source:
 *
 * - **The battery itself**, for every record with a confirmed catalog entry:
 *   its maker names (manufacturer, brand) and its model names (model, part
 *   number), against the consumer product source. Many recalls name the
 *   battery, not what it came out of.
 * - **What it came out of**, when provenance is `vehicle_vin` or
 *   `device_serial` and the source make and model are on the record: a vehicle
 *   against the vehicle safety source on make, model and model year; a device
 *   against the consumer product source on make and model.
 *
 * `unknown_provenance` and `bulk_consignment` stop only the second check
 * (T-11). A record with neither identity is not checked; that is a recorded
 * fact, not a failure.
 *
 * **A vehicle needs its model year.** The vehicle source is looked up by make,
 * model and model year, and a candidate needs all three to agree (Rule
 * 10.12), so a vehicle with no year on the record has no vehicle identity
 * rather than a check that could only ever say "no match" — which would read
 * as an answer it is not. Reported in `b2-09`'s build-notes.
 *
 * Each name keeps the field it came from, so a match can say in words which
 * fields agreed (Rule 10.13).
 */

export const RECALL_IDENTITY_KINDS = [
  "battery",
  "source_vehicle",
  "source_device",
] as const;

export type RecallIdentityKind = (typeof RECALL_IDENTITY_KINDS)[number];

/** The fields a match can agree on — the words "Matched on:" is written from. */
export const RECALL_MATCH_FIELDS = [
  "manufacturer",
  "brand",
  "model",
  "part_number",
  "make",
  "model_year",
  "component",
] as const;

export type RecallMatchField = (typeof RECALL_MATCH_FIELDS)[number];

export interface NamedValue {
  readonly field: RecallMatchField;
  readonly value: string;
}

export type RecallIdentity =
  | {
      readonly kind: "battery" | "source_device";
      readonly source: "consumer_product_agency";
      readonly makers: readonly NamedValue[];
      readonly models: readonly NamedValue[];
    }
  | {
      readonly kind: "source_vehicle";
      readonly source: "vehicle_safety_agency";
      readonly make: string;
      readonly model: string;
      readonly modelYear: number;
    };

export interface RecallIdentityInput {
  /** The record carries a human-confirmed catalog entry. */
  readonly hasConfirmedCatalogEntry: boolean;
  readonly manufacturerName: string | null;
  readonly brandName: string | null;
  readonly modelName: string | null;
  readonly partNumber: string | null;
  /** T-11. */
  readonly provenanceSourceType: ProvenanceSourceType;
  readonly sourceDeviceMake: string | null;
  readonly sourceDeviceModel: string | null;
  readonly sourceDeviceModelYear: number | null;
}

function text(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function named(
  values: readonly (readonly [RecallMatchField, string | null])[],
): readonly NamedValue[] {
  const out: NamedValue[] = [];
  for (const [field, value] of values) {
    const trimmed = text(value);
    if (trimmed !== null) out.push({ field, value: trimmed });
  }
  return out;
}

/** Every identity this record can be checked on, in the order Rule 10.11 names them. */
export function recallIdentities(
  input: RecallIdentityInput,
): readonly RecallIdentity[] {
  const identities: RecallIdentity[] = [];

  const makers = named([
    ["manufacturer", input.manufacturerName],
    ["brand", input.brandName],
  ]);
  const models = named([
    ["model", input.modelName],
    ["part_number", input.partNumber],
  ]);
  if (
    input.hasConfirmedCatalogEntry &&
    makers.length > 0 &&
    models.length > 0
  ) {
    identities.push({
      kind: "battery",
      source: "consumer_product_agency",
      makers,
      models,
    });
  }

  const make = text(input.sourceDeviceMake);
  const model = text(input.sourceDeviceModel);
  if (make !== null && model !== null) {
    if (
      input.provenanceSourceType === "vehicle_vin" &&
      input.sourceDeviceModelYear !== null
    ) {
      identities.push({
        kind: "source_vehicle",
        source: "vehicle_safety_agency",
        make,
        model,
        modelYear: input.sourceDeviceModelYear,
      });
    } else if (input.provenanceSourceType === "device_serial") {
      identities.push({
        kind: "source_device",
        source: "consumer_product_agency",
        makers: [{ field: "make", value: make }],
        models: [{ field: "model", value: model }],
      });
    }
  }

  return identities;
}

/** What the source is asked for this identity. */
export function recallQueryFor(identity: RecallIdentity): RecallQuery {
  if (identity.kind === "source_vehicle") {
    return {
      source: "vehicle_safety_agency",
      make: identity.make,
      model: identity.model,
      modelYear: identity.modelYear,
    };
  }
  return {
    source: "consumer_product_agency",
    makers: identity.makers.map((name) => name.value),
    models: identity.models.map((name) => name.value),
  };
}

/** The sources a record's identities put in play — the standing's "every applicable source". */
export function applicableSources(
  identities: readonly RecallIdentity[],
): readonly RecallSearchSource[] {
  return [...new Set(identities.map((identity) => identity.source))];
}
