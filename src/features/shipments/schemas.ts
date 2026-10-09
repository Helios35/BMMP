import { z } from "zod";

import type { ShipmentTransportDetails } from "@/data/contracts";
import { TRANSPORT_MODES } from "@/domain/taxonomy/transport-mode";

/**
 * Input parsing for the shipment writes — `TECHNICAL_SPEC.md` §7.1 step 3.
 *
 * Shapes only. **No schema here accepts a shipping identifier, a paper, a
 * status or a date that is not now**: identifiers come from the catalog
 * (Rule 5.9), the paper is the builder's at commit, `ready` is derived
 * (T-28), and departure and arrival are recorded at the moment they are
 * recorded. Transport fields are flat so a refusal lands on its own field.
 */

/** Shape limits on typed text — not regulatory figures (Rule 1.23). */
const MAX_NAME_LENGTH = 200;
const MAX_LINE_LENGTH = 200;
const MAX_REFERENCE_LENGTH = 120;
const MAX_REASON_LENGTH = 500;
/** A shipment is chosen by a person from one organization's containers. */
const MAX_CONTAINERS = 200;

const required = (message: string) =>
  z.string().trim().min(1, message).max(MAX_LINE_LENGTH);

const optional = z
  .string()
  .trim()
  .max(MAX_REFERENCE_LENGTH)
  .nullable()
  .transform((value) => (value === null || value === "" ? null : value));

const containerIds = z
  .array(z.uuid())
  .min(1, "Choose at least one container to ship.")
  .max(MAX_CONTAINERS);

export const transportFields = {
  transportMode: z.enum(TRANSPORT_MODES, {
    error: "Choose how the shipment travels.",
  }),
  destinationFacilityName: z
    .string()
    .trim()
    .min(1, "Name the destination facility.")
    .max(MAX_NAME_LENGTH),
  line1: required("Give the destination's street address."),
  line2: optional,
  city: required("Give the destination's city."),
  region: required("Give the destination's state or region."),
  postalCode: required("Give the destination's postal code."),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "Give the country as its two-letter code.")
    .transform((value) => value.toUpperCase()),
  destinationIdentifier: optional,
  carrierName: z
    .string()
    .trim()
    .min(1, "Name the carrier.")
    .max(MAX_NAME_LENGTH),
  transporterIdentifier: optional,
};

type TransportInput = z.infer<z.ZodObject<typeof transportFields>>;

export function transportDetails(
  input: TransportInput,
): ShipmentTransportDetails {
  return {
    transportMode: input.transportMode,
    destinationFacilityName: input.destinationFacilityName,
    destinationAddress: {
      line1: input.line1,
      line2: input.line2,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      country: input.country,
    },
    destinationIdentifier: input.destinationIdentifier,
    carrierName: input.carrierName,
    transporterIdentifier: input.transporterIdentifier,
  };
}

export const assembleShipmentSchema = z.object({
  containerIds,
  ...transportFields,
});

export const recordTransportSchema = z.object({
  shipmentId: z.uuid(),
  ...transportFields,
});

export const changeContentsSchema = z.object({
  shipmentId: z.uuid(),
  containerIds: z.array(z.uuid()).max(MAX_CONTAINERS),
  reason: z
    .string()
    .trim()
    .max(MAX_REASON_LENGTH)
    .nullable()
    .transform((value) => (value === null || value === "" ? null : value)),
});

export const shipmentIdSchema = z.object({ shipmentId: z.uuid() });

export const arrivalSchema = z.object({
  shipmentId: z.uuid(),
  receivedConfirmationRef: optional,
});
