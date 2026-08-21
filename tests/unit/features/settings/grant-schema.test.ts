import { describe, expect, it } from "vitest";

import { auditorGrantSchema } from "@/features/settings/schemas";

/**
 * D-31, Rule 1.15 — **a grant without an expiry cannot be created.**
 *
 * The form is B1b's; the constraint is not deferrable. These assertions are what
 * make "access always ends" a property of the schema rather than a sentence in a
 * document, and they fail the moment someone reaches for `.optional()`,
 * `.nullable()`, a default, or a sentinel that means "never".
 */

const VALID = {
  membershipId: "0f9c9a3f-3b6d-4a1d-9d5f-0c7a1b2c3d4e",
  reason: "Annual insurance underwriting review",
  scope: ["Full audit scope"],
  expiresOn: "2027-01-31",
} as const;

describe("auditorGrantSchema", () => {
  it("accepts a grant carrying a reason, a scope and an end date", () => {
    expect(auditorGrantSchema.safeParse(VALID).success).toBe(true);
  });

  it("refuses a grant with no expiry", () => {
    const withoutExpiry: Record<string, unknown> = { ...VALID };
    delete withoutExpiry.expiresOn;
    expect(auditorGrantSchema.safeParse(withoutExpiry).success).toBe(false);
  });

  it("offers no null, no empty string and no 'never' as an expiry", () => {
    // There is no indefinite value anywhere in this vocabulary: a row whose
    // expiry is absent reads as no access, never as no limit.
    for (const expiresOn of [null, "", "never", "9999-99-99"]) {
      expect(
        auditorGrantSchema.safeParse({ ...VALID, expiresOn }).success,
      ).toBe(false);
    }
  });

  it("refuses a grant that covers nothing", () => {
    // Rule 12.19 narrows an export by the scope; a grant with none narrows
    // nothing.
    expect(auditorGrantSchema.safeParse({ ...VALID, scope: [] }).success).toBe(
      false,
    );
  });

  it("refuses a grant with no stated reason", () => {
    // Rule 1.18 — a support or audit grant with no recorded reason is not a
    // recorded grant, whatever the log says afterwards.
    expect(
      auditorGrantSchema.safeParse({ ...VALID, reason: "   " }).success,
    ).toBe(false);
  });
});
