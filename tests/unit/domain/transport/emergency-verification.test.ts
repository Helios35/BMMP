import { describe, expect, it } from "vitest";

import * as fixtures from "@/data/mock/fixtures";
import * as ID from "@/data/mock/fixtures/ids";
import { PLATFORM_EMERGENCY_CONTACT_CONFIGURATION } from "@/data/mock/fixtures/platform-configuration";
import {
  addWholeMonths,
  emergencyVerification,
  validateEmergencyContactConfiguration,
} from "@/domain/transport/emergency-verification";

/**
 * The 24-hour emergency number's verification — D-32, Rules 5.6, 5.7, E-11.
 *
 * **The rule under test is that a lapsed verification is treated exactly as an
 * absent one.** One state, not two. The three fixture organizations reach it
 * from three different directions — one verified and since lapsed, one with no
 * number at all, one with a number nobody has verified — and every one of them
 * must produce the same `isInForce: false`, because a screen that renders a
 * fourth "expired" treatment has invented a state D-32 says does not exist.
 */

const NOW = "2026-08-21T12:00:00.000Z";

/** The platform row, read as the adapter reads it — never a literal here. */
const PLATFORM_DEFAULT_MONTHS =
  PLATFORM_EMERGENCY_CONTACT_CONFIGURATION.reverificationIntervalMonths;

function organizationInput(id: string) {
  const org = fixtures.organizations.find((row) => row.id === id);
  if (org === undefined) throw new Error(`No organization fixture ${id}`);
  return {
    phone: org.emergencyResponsePhone,
    verifiedAt: org.emergencyVerifiedAt,
    verifiedBy: org.emergencyVerifiedBy,
    reverificationIntervalMonths: org.emergencyReverificationIntervalMonths,
    platformDefaultIntervalMonths: PLATFORM_DEFAULT_MONTHS,
  };
}

describe("emergencyVerification", () => {
  it("treats a lapsed verification exactly as an absent one", () => {
    const lapsed = emergencyVerification(
      organizationInput(ID.ORG.cascade),
      NOW,
    );
    const noNumber = emergencyVerification(
      organizationInput(ID.ORG.rainier),
      NOW,
    );
    const neverVerified = emergencyVerification(
      organizationInput(ID.ORG.olympic),
      NOW,
    );

    for (const result of [lapsed, noNumber, neverVerified]) {
      expect(result.isInForce).toBe(false);
    }

    // The reason differs, and it exists for a test to name the entry point — it
    // is never a second visual treatment.
    expect(lapsed.notInForceReason).toBe("lapsed");
    expect(noNumber.notInForceReason).toBe("no_number");
    expect(neverVerified.notInForceReason).toBe("never_verified");
  });

  it("keeps the recorded act visible even once the verification has lapsed", () => {
    const lapsed = emergencyVerification(
      organizationInput(ID.ORG.cascade),
      NOW,
    );
    // Rule 5.6 wants a person and a date, and they do not stop being true when
    // the verification stops standing.
    expect(lapsed.verifiedAt).not.toBeNull();
    expect(lapsed.verifiedBy).toBe(ID.USER.martaManager);
    expect(lapsed.lapsesAt).not.toBeNull();
  });

  it("reads a verification as standing while it is inside its interval", () => {
    const result = emergencyVerification(
      {
        phone: "+1-800-555-0142",
        verifiedAt: "2026-08-01T00:00:00.000Z",
        verifiedBy: ID.USER.martaManager,
        reverificationIntervalMonths: 12,
        platformDefaultIntervalMonths: PLATFORM_DEFAULT_MONTHS,
      },
      NOW,
    );

    expect(result.isInForce).toBe(true);
    expect(result.notInForceReason).toBeNull();
    expect(result.lapsesAt).toBe("2027-08-01T00:00:00.000Z");
  });

  it("measures an organization with no interval of its own against the platform default (D-32)", () => {
    const result = emergencyVerification(
      {
        phone: "+1-800-555-0197",
        verifiedAt: "2026-08-01T00:00:00.000Z",
        verifiedBy: ID.USER.rosaOlympicManager,
        reverificationIntervalMonths: null,
        platformDefaultIntervalMonths: PLATFORM_DEFAULT_MONTHS,
      },
      NOW,
    );
    expect(result.isInForce).toBe(true);
    expect(result.intervalSource).toBe("platform_default");
    expect(result.intervalMonths).toBe(PLATFORM_DEFAULT_MONTHS);
    expect(result.lapsesAt).toBe(
      addWholeMonths("2026-08-01T00:00:00.000Z", PLATFORM_DEFAULT_MONTHS),
    );
  });

  it("prefers the organization's own interval over the platform default", () => {
    const result = emergencyVerification(
      {
        phone: "+1-800-555-0142",
        verifiedAt: "2026-08-01T00:00:00.000Z",
        verifiedBy: ID.USER.martaManager,
        reverificationIntervalMonths: 1,
        platformDefaultIntervalMonths: PLATFORM_DEFAULT_MONTHS,
      },
      NOW,
    );
    expect(result.intervalSource).toBe("organization");
    expect(result.lapsesAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("blocks a verification lapsed under the platform default exactly as an absent one", () => {
    const verifiedAt = "2024-01-01T00:00:00.000Z";
    const lapsed = emergencyVerification(
      {
        phone: "+1-800-555-0197",
        verifiedAt,
        verifiedBy: ID.USER.rosaOlympicManager,
        reverificationIntervalMonths: null,
        platformDefaultIntervalMonths: PLATFORM_DEFAULT_MONTHS,
      },
      NOW,
    );
    const absent = emergencyVerification(
      {
        phone: null,
        verifiedAt: null,
        verifiedBy: null,
        reverificationIntervalMonths: null,
        platformDefaultIntervalMonths: PLATFORM_DEFAULT_MONTHS,
      },
      NOW,
    );
    // One state (D-32): the same `isInForce`, whichever door it came through.
    expect(lapsed.isInForce).toBe(false);
    expect(absent.isInForce).toBe(false);
    expect(lapsed.isInForce).toBe(absent.isInForce);
  });

  it("fails closed when the interval is unknown, and shows no date of its own", () => {
    const result = emergencyVerification(
      {
        phone: "+1-800-555-0142",
        verifiedAt: "2026-08-01T00:00:00.000Z",
        verifiedBy: ID.USER.martaManager,
        reverificationIntervalMonths: null,
        platformDefaultIntervalMonths: null,
      },
      NOW,
    );

    // Rule 1.23 — a component may not substitute an interval of its own, so
    // there is no lapse date; and a verification that cannot be shown to stand
    // does not stand.
    expect(result.lapsesAt).toBeNull();
    expect(result.isInForce).toBe(false);
    expect(result.notInForceReason).toBe("interval_unknown");
  });

  it("lapses on the boundary instant rather than after it", () => {
    const at = "2027-01-01T00:00:00.000Z";
    const result = emergencyVerification(
      {
        phone: "+1-800-555-0142",
        verifiedAt: "2026-01-01T00:00:00.000Z",
        verifiedBy: ID.USER.martaManager,
        reverificationIntervalMonths: 12,
        platformDefaultIntervalMonths: PLATFORM_DEFAULT_MONTHS,
      },
      at,
    );
    expect(result.isInForce).toBe(false);
  });
});

describe("addWholeMonths", () => {
  it("clamps to the end of the target month rather than rolling over", () => {
    // The earlier date is the one that fails closed, and this decides when a
    // number may no longer go on a shipping paper.
    expect(addWholeMonths("2026-01-31T09:00:00.000Z", 1)).toBe(
      "2026-02-28T09:00:00.000Z",
    );
    expect(addWholeMonths("2024-01-31T09:00:00.000Z", 1)).toBe(
      "2024-02-29T09:00:00.000Z",
    );
  });

  it("crosses a year boundary", () => {
    expect(addWholeMonths("2026-11-15T09:00:00.000Z", 3)).toBe(
      "2027-02-15T09:00:00.000Z",
    );
  });
});

describe("validateEmergencyContactConfiguration", () => {
  it("accepts the platform row", () => {
    expect(
      validateEmergencyContactConfiguration(
        PLATFORM_EMERGENCY_CONTACT_CONFIGURATION,
      ).ok,
    ).toBe(true);
  });

  it.each([
    ["no version", { reverificationIntervalMonths: 12 }],
    [
      "a zero interval",
      { configurationVersion: "v", reverificationIntervalMonths: 0 },
    ],
    [
      "a fractional interval",
      { configurationVersion: "v", reverificationIntervalMonths: 1.5 },
    ],
    [
      "a string interval",
      { configurationVersion: "v", reverificationIntervalMonths: "12" },
    ],
    ["not an object", null],
  ])("refuses %s rather than defaulting", (_name, row) => {
    expect(validateEmergencyContactConfiguration(row).ok).toBe(false);
  });
});
