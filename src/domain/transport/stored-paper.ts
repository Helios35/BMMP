import type { JsonObject, JsonValue } from "@/types/common";
import {
  TRANSPORT_MODES,
  type TransportMode,
} from "@/domain/taxonomy/transport-mode";
import { isTaxonomyValue } from "@/domain/taxonomy/lookup";

import type { ShippingPaperAddress } from "./shipping-paper";

/**
 * The header of an issued paper, read back from its render's stored input —
 * `ERD.md` §7.5 `document_render.input_snapshot`; Rules 5.12, 5.14.
 *
 * **A paper shows what it was issued with, never today's shipment.** A
 * contents change voids the paper and reopens the shipment's transport
 * details, so a voided paper re-reading the shipment would show a destination
 * it never carried. The stored payload is the frozen copy; this reads the part
 * of it the page prints beside the lines, and reads `null` for any snapshot it
 * does not recognise — a render written before this unit, or by another
 * version — so the caller falls back to stating what it does not know rather
 * than guessing.
 */

export type StoredPaperHeader = {
  readonly shipmentNumber: string;
  readonly transportMode: TransportMode;
  readonly origin: ShippingPaperAddress;
  readonly destination: {
    readonly facilityName: string;
    readonly address: ShippingPaperAddress;
    readonly identifier: string | null;
  };
  readonly carrier: {
    readonly name: string;
    readonly identifier: string | null;
  };
  readonly manifestRecordNumbers: readonly string[];
  readonly ddrRecordNumbers: readonly string[];
};

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function nullableText(value: JsonValue | undefined): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function strings(value: JsonValue | undefined): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((entry) => typeof entry === "string")
    ? (value as readonly string[])
    : null;
}

function address(value: JsonValue | undefined): ShippingPaperAddress | null {
  if (!isObject(value)) return null;
  const line1 = text(value.line1);
  const line2 = nullableText(value.line2);
  const city = text(value.city);
  const region = text(value.region);
  const postalCode = text(value.postalCode);
  const country = text(value.country);
  if (
    line1 === null ||
    line2 === undefined ||
    city === null ||
    region === null ||
    postalCode === null ||
    country === null
  ) {
    return null;
  }
  return { line1, line2, city, region, postalCode, country };
}

export function readStoredPaperHeader(
  snapshot: JsonObject,
): StoredPaperHeader | null {
  const shipmentNumber = text(snapshot.shipmentNumber);
  const mode = text(snapshot.transportMode);
  const origin = address(snapshot.origin);
  const destination = snapshot.destination;
  const carrier = snapshot.carrier;
  const manifest = snapshot.manifestObligation;
  const ddr = strings(snapshot.ddrRecordNumbers);
  if (
    shipmentNumber === null ||
    mode === null ||
    !isTaxonomyValue(TRANSPORT_MODES, mode) ||
    origin === null ||
    !isObject(destination) ||
    !isObject(carrier) ||
    !isObject(manifest) ||
    ddr === null
  ) {
    return null;
  }
  const facilityName = text(destination.facilityName);
  const destinationAddress = address(destination.address);
  const destinationIdentifier = nullableText(destination.identifier);
  const carrierName = text(carrier.name);
  const carrierIdentifier = nullableText(carrier.identifier);
  const manifestRecords = strings(manifest.recordNumbers);
  if (
    facilityName === null ||
    destinationAddress === null ||
    destinationIdentifier === undefined ||
    carrierName === null ||
    carrierIdentifier === undefined ||
    manifestRecords === null
  ) {
    return null;
  }
  return {
    shipmentNumber,
    transportMode: mode,
    origin,
    destination: {
      facilityName,
      address: destinationAddress,
      identifier: destinationIdentifier,
    },
    carrier: { name: carrierName, identifier: carrierIdentifier },
    manifestRecordNumbers: manifestRecords,
    ddrRecordNumbers: ddr,
  };
}
