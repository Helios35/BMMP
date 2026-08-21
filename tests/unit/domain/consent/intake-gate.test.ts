import { describe, expect, it } from "vitest";

import {
  canAcceptTerms,
  evaluateIntakeGate,
  type ConsentRecord,
} from "@/domain/consent";
import { ROLE_CODES } from "@/domain/taxonomy/role";

/**
 * The Terms of Service gate — Rules 7.1, 7.2, 7.13, 7.14, 7.18; D-2, D-35.
 *
 * Two properties carry most of the weight here and both are asserted rather than
 * assumed: **the gate fails closed** on anything it does not recognise, and
 * **P6 can never accept**, under any circumstance (Rules 1.19, 7.4).
 */

const TODAY = "2026-08-21";

function record(patch: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    status: "in_force",
    documentKey: "terms_of_service",
    documentVersion: "2026-06",
    trainingRightsGranted: true,
    reacceptanceDeadlineOn: null,
    revokedAt: null,
    ...patch,
  };
}

describe("evaluateIntakeGate", () => {
  it("blocks with no_acceptance when there is no row at all", () => {
    const gate = evaluateIntakeGate([], TODAY);
    expect(gate.status).toBe("blocked");
    expect(gate.reason).toBe("no_acceptance");
  });

  it("blocks with no_acceptance when the only row is not_accepted", () => {
    const gate = evaluateIntakeGate(
      [record({ status: "not_accepted", trainingRightsGranted: false })],
      TODAY,
    );
    expect(gate.status).toBe("blocked");
    expect(gate.reason).toBe("no_acceptance");
    expect(gate.documentVersion).toBe("2026-06");
  });

  it("opens on an in_force row that carries the training-rights grant", () => {
    const gate = evaluateIntakeGate([record()], TODAY);
    expect(gate.status).toBe("open");
    expect(gate.reason).toBeNull();
  });

  it("fails closed on an in_force row that withholds the training-rights grant", () => {
    // D-2 and Rule 7.1 — the grant is the thing that must be in force, not
    // merely an acceptance.
    const gate = evaluateIntakeGate(
      [record({ trainingRightsGranted: false })],
      TODAY,
    );
    expect(gate.status).toBe("blocked");
    expect(gate.reason).toBe("no_training_rights");
  });

  it("keeps intake open inside the grace window (Rule 7.13)", () => {
    const gate = evaluateIntakeGate(
      [record({ status: "grace", reacceptanceDeadlineOn: "2026-09-30" })],
      TODAY,
    );
    expect(gate.status).toBe("grace");
    expect(gate.reacceptanceDeadlineOn).toBe("2026-09-30");
  });

  it("keeps intake open on the deadline day itself", () => {
    const gate = evaluateIntakeGate(
      [record({ status: "grace", reacceptanceDeadlineOn: TODAY })],
      TODAY,
    );
    expect(gate.status).toBe("grace");
  });

  it("blocks the day after the deadline (Rule 7.14)", () => {
    const gate = evaluateIntakeGate(
      [record({ status: "grace", reacceptanceDeadlineOn: "2026-08-20" })],
      TODAY,
    );
    expect(gate.status).toBe("blocked");
    expect(gate.reason).toBe("lapsed");
    expect(gate.reacceptanceDeadlineOn).toBe("2026-08-20");
  });

  it("fails closed on a grace row with no deadline", () => {
    const gate = evaluateIntakeGate([record({ status: "grace" })], TODAY);
    expect(gate.status).toBe("blocked");
    expect(gate.reason).toBe("lapsed");
  });

  it("blocks a lapsed row", () => {
    const gate = evaluateIntakeGate([record({ status: "lapsed" })], TODAY);
    expect(gate.status).toBe("blocked");
    expect(gate.reason).toBe("lapsed");
  });

  it("blocks a revoked row (Rule 7.18)", () => {
    const gate = evaluateIntakeGate([record({ status: "revoked" })], TODAY);
    expect(gate.status).toBe("blocked");
    expect(gate.reason).toBe("revoked");
  });

  it("blocks on a revokedAt instant even where the status has not caught up", () => {
    const gate = evaluateIntakeGate(
      [record({ revokedAt: "2026-08-01T00:00:00.000Z" })],
      TODAY,
    );
    expect(gate.status).toBe("blocked");
    expect(gate.reason).toBe("revoked");
  });

  it("puts revocation ahead of an otherwise in-force row", () => {
    const gate = evaluateIntakeGate(
      [record(), record({ status: "revoked", documentVersion: "2026-01" })],
      TODAY,
    );
    expect(gate.reason).toBe("revoked");
    expect(gate.documentVersion).toBe("2026-01");
  });

  it("ignores a superseded row and blocks where nothing live remains", () => {
    // Rule 7.16 — every prior row is retained permanently. Retained is not live.
    const gate = evaluateIntakeGate([record({ status: "superseded" })], TODAY);
    expect(gate.status).toBe("blocked");
    expect(gate.reason).toBe("no_acceptance");
  });

  it("opens where a live row sits beside a superseded one", () => {
    const gate = evaluateIntakeGate(
      [record({ status: "superseded", documentVersion: "2025-11" }), record()],
      TODAY,
    );
    expect(gate.status).toBe("open");
    expect(gate.documentVersion).toBe("2026-06");
  });
});

describe("canAcceptTerms", () => {
  it("admits a Facility Manager holding binding authority (Rules 7.3, D-35)", () => {
    expect(
      canAcceptTerms({
        role: "facility_manager",
        holdsBindingAuthority: true,
        isPlatformAdmin: false,
      }),
    ).toBe(true);
  });

  it("refuses a Facility Manager who does not hold it", () => {
    expect(
      canAcceptTerms({
        role: "facility_manager",
        holdsBindingAuthority: false,
        isPlatformAdmin: false,
      }),
    ).toBe(false);
  });

  it("refuses every other role, holding authority or not (Rule 7.3)", () => {
    for (const role of ROLE_CODES) {
      if (role === "facility_manager") continue;
      expect(
        canAcceptTerms({
          role,
          holdsBindingAuthority: true,
          isPlatformAdmin: false,
        }),
      ).toBe(false);
    }
  });

  it("refuses a platform admin under every combination (Rules 1.19, 7.4)", () => {
    for (const role of ROLE_CODES) {
      for (const holdsBindingAuthority of [true, false]) {
        expect(
          canAcceptTerms({
            role,
            holdsBindingAuthority,
            isPlatformAdmin: true,
          }),
        ).toBe(false);
      }
    }
  });
});
