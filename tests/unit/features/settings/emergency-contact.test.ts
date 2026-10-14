import { describe, expect, it } from "vitest";

import {
  emergencyContactSchema,
  verifyEmergencyContactSchema,
} from "@/features/settings/schemas";
import {
  emergencyContactSettingsHref,
  readShipmentReturn,
  shipmentStepThreeHref,
} from "@/features/settings/return-to";

/**
 * The 24-hour emergency contact's input and E-11's way back — D-63, E-11.
 *
 * The schemas carry **no date and no person**: a change is never a
 * verification, and a verification is stamped by the server. The way back
 * admits only the two places a shipment draft lives, so the page that holds
 * the 24-hour number is never an open redirect.
 */

const SHIPMENT = "0b000000-0000-4000-8000-0000000000aa";

describe("emergencyContactSchema", () => {
  it.each(["+1-800-555-0142", "(206) 555 0199", "+44 20 7946 0958", ""])(
    "accepts %j",
    (phone) => {
      expect(
        emergencyContactSchema.safeParse({ phone, contractRef: "ERI-1" })
          .success,
      ).toBe(true);
    },
  );

  it.each(["call me", "555-01", "+1-800-555-0142 ext 4", "1".repeat(16)])(
    "refuses %j",
    (phone) => {
      expect(
        emergencyContactSchema.safeParse({ phone, contractRef: "" }).success,
      ).toBe(false);
    },
  );

  it("has no field for a verification date or a verifier", () => {
    expect(Object.keys(emergencyContactSchema.shape).sort()).toEqual([
      "contractRef",
      "phone",
    ]);
    expect(Object.keys(verifyEmergencyContactSchema.shape)).toEqual(["phone"]);
  });
});

describe("E-11's way back", () => {
  it("round-trips step 3 and the shipment page", () => {
    const step3 = shipmentStepThreeHref(SHIPMENT);
    expect(readShipmentReturn(step3)).toBe(step3);
    expect(readShipmentReturn(`/shipments/${SHIPMENT}`)).toBe(
      `/shipments/${SHIPMENT}`,
    );
    expect(emergencyContactSettingsHref(step3)).toBe(
      `/settings/organization?returnTo=${encodeURIComponent(step3)}#emergency-contact`,
    );
  });

  it.each([
    "https://evil.example/shipments/new",
    "//evil.example",
    "/settings/users",
    `/shipments/new?shipment=${SHIPMENT}&step=2`,
    `/shipments/${SHIPMENT}/../../audit`,
    "javascript:alert(1)",
    "",
  ])("reads %j as no way back", (value) => {
    expect(readShipmentReturn(value)).toBeNull();
  });

  it("reads a repeated or absent parameter as no way back", () => {
    expect(readShipmentReturn(undefined)).toBeNull();
    expect(readShipmentReturn([`/shipments/${SHIPMENT}`])).toBeNull();
  });
});
