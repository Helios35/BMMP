import { describe, expect, it } from "vitest";

import { intakeLandingStatus } from "@/domain/intake/landing-status";

describe("intakeLandingStatus — T-22 after a commit", () => {
  it("places a flagged record in quarantine, never in general stock (Rules 6.15, 6.17)", () => {
    expect(
      intakeLandingStatus({ placed: true, ddrFlagged: true, decided: true }),
    ).toBe("quarantined");
    expect(
      intakeLandingStatus({ placed: true, ddrFlagged: true, decided: false }),
    ).toBe("quarantined");
  });

  it("stores a placed, unflagged record", () => {
    expect(
      intakeLandingStatus({ placed: true, ddrFlagged: false, decided: true }),
    ).toBe("stored");
  });

  it("leaves an unplaced record classified when a decision exists", () => {
    expect(
      intakeLandingStatus({ placed: false, ddrFlagged: false, decided: true }),
    ).toBe("classified");
  });

  it("leaves an unplaced record confirmed when classification could not run (EC-16)", () => {
    expect(
      intakeLandingStatus({ placed: false, ddrFlagged: false, decided: false }),
    ).toBe("confirmed");
    // A flag without a container still has nowhere to be quarantined; the
    // status says what was written, and the flag row says what it means.
    expect(
      intakeLandingStatus({ placed: false, ddrFlagged: true, decided: false }),
    ).toBe("confirmed");
  });
});
