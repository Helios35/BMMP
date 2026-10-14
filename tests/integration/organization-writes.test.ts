import { beforeEach, describe, expect, it } from "vitest";

import type { RequestContext } from "@/data/contracts/context";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import { mockAdapter, mockStore, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import { PLATFORM_EMERGENCY_CONTACT_CONFIGURATION } from "@/data/mock/fixtures/platform-configuration";
import { emergencyVerification } from "@/domain/transport/emergency-verification";
import { ConflictError, PermissionError, ValidationError } from "@/lib/errors";
import type { Organization } from "@/types/tenancy";

/**
 * The 24-hour emergency contact's two writes, against the mock adapter —
 * D-32, D-63, Rules 5.6, 5.7.
 *
 * What is being proven, and each of it is a rule rather than a nicety:
 *
 * 1. **A change clears the verification in the same write** — a changed
 *    contact is an unchecked contact (D-63 #2).
 * 2. **Verification stamps the person from `ctx` and the instant from the
 *    adapter's own clock** — nothing the caller sends can set either (D-63 #3).
 * 3. Both are P2 and P6 only, and both are audited.
 * 4. The platform default is read through the seam, and a `null` organization
 *    interval reads it (D-63 #4).
 */

const NO_ATTRIBUTION: StorageWriteAttribution = {
  requestId: null,
  ipAddress: null,
  userAgent: null,
};

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: ID.USER.martaManager,
    organizationId: ID.ORG.cascade,
    role: "facility_manager",
    isPlatformAdmin: false,
    correlationId: "test-corr-emergency-contact",
    ...overrides,
  };
}

const MANAGER = ctx();
const HANDLER = ctx({
  userId: ID.USER.danaHandler,
  role: "compliance_handler",
});
const AUDITOR = ctx({ userId: ID.USER.samAuditor, role: "auditor" });
const ADMIN = ctx({
  userId: ID.USER.platformAdmin,
  role: "platform_admin",
  isPlatformAdmin: true,
});

async function cascade(): Promise<Organization> {
  const organization = await mockAdapter.organizations.get(
    MANAGER,
    ID.ORG.cascade,
  );
  if (organization === null) throw new Error("no Cascade");
  return organization;
}

function eventsOf(eventType: string) {
  return mockStore()
    .auditEvents.all()
    .filter(
      (event) =>
        event.organizationId === ID.ORG.cascade &&
        event.eventType === eventType,
    );
}

beforeEach(() => {
  resetMockStore();
});

describe("verifyEmergencyContact", () => {
  it("stamps the signed-in person and the adapter's own now", async () => {
    const before = Date.now();
    const organization = await mockAdapter.organizations.verifyEmergencyContact(
      MANAGER,
      { phone: "+1-800-555-0142", attribution: NO_ATTRIBUTION },
    );
    const after = Date.now();

    expect(organization.emergencyVerifiedBy).toBe(ID.USER.martaManager);
    const stamped = Date.parse(organization.emergencyVerifiedAt ?? "");
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);

    const [event] = eventsOf("organization.emergency_contact_verified");
    expect(event?.actorUserId).toBe(ID.USER.martaManager);
    expect(event?.actorType).toBe("user");
    expect(event?.afterState).toMatchObject({
      verifiedBy: ID.USER.martaManager,
    });
  });

  it("brings a lapsed verification back into force", async () => {
    const lapsed = await cascade();
    const at = new Date().toISOString();
    const input = (row: Organization) => ({
      phone: row.emergencyResponsePhone,
      verifiedAt: row.emergencyVerifiedAt,
      verifiedBy: row.emergencyVerifiedBy,
      reverificationIntervalMonths: row.emergencyReverificationIntervalMonths,
      platformDefaultIntervalMonths:
        PLATFORM_EMERGENCY_CONTACT_CONFIGURATION.reverificationIntervalMonths,
    });
    expect(emergencyVerification(input(lapsed), at).isInForce).toBe(false);

    const verified = await mockAdapter.organizations.verifyEmergencyContact(
      MANAGER,
      {
        phone: "+1-800-555-0142",
        attribution: NO_ATTRIBUTION,
      },
    );
    expect(emergencyVerification(input(verified), at).isInForce).toBe(true);
  });

  it("records a platform admin's verification as a platform action", async () => {
    const organization = await mockAdapter.organizations.verifyEmergencyContact(
      ADMIN,
      { phone: "+1-800-555-0142", attribution: NO_ATTRIBUTION },
    );
    expect(organization.emergencyVerifiedBy).toBe(ID.USER.platformAdmin);
    const [event] = eventsOf("organization.emergency_contact_verified");
    expect(event?.actorType).toBe("platform_admin");
  });

  it("refuses an attestation to a number that is no longer on file", async () => {
    await expect(
      mockAdapter.organizations.verifyEmergencyContact(MANAGER, {
        phone: "+1-800-555-0000",
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await cascade()).emergencyVerifiedBy).toBe(ID.USER.martaManager);
    expect(eventsOf("organization.emergency_contact_verified")).toHaveLength(0);
  });

  it("refuses when there is no number to verify", async () => {
    await mockAdapter.organizations.updateEmergencyContact(MANAGER, {
      phone: "   ",
      contractRef: "ERI-CASCADE-2026-0117",
      attribution: NO_ATTRIBUTION,
    });
    await expect(
      mockAdapter.organizations.verifyEmergencyContact(MANAGER, {
        phone: "",
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([
    ["P1", HANDLER],
    ["P5", AUDITOR],
  ])("refuses %s", async (_persona, caller) => {
    await expect(
      mockAdapter.organizations.verifyEmergencyContact(caller, {
        phone: "+1-800-555-0142",
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("updateEmergencyContact", () => {
  it("clears the verification in the same write as any change", async () => {
    await mockAdapter.organizations.verifyEmergencyContact(MANAGER, {
      phone: "+1-800-555-0142",
      attribution: NO_ATTRIBUTION,
    });

    const changed = await mockAdapter.organizations.updateEmergencyContact(
      MANAGER,
      {
        phone: "+1-800-555-0177",
        contractRef: "ERI-CASCADE-2026-0117",
        attribution: NO_ATTRIBUTION,
      },
    );

    expect(changed.emergencyResponsePhone).toBe("+1-800-555-0177");
    expect(changed.emergencyVerifiedAt).toBeNull();
    expect(changed.emergencyVerifiedBy).toBeNull();

    const [event] = eventsOf("organization.emergency_contact_updated");
    expect(event?.beforeState).toMatchObject({ phone: "+1-800-555-0142" });
    expect(event?.afterState).toMatchObject({
      phone: "+1-800-555-0177",
      verifiedAt: null,
      verifiedBy: null,
    });
    expect(event?.changedFields).toEqual(
      expect.arrayContaining(["emergencyResponsePhone", "emergencyVerifiedAt"]),
    );
  });

  it("clears it when only the emergency response reference changes", async () => {
    await mockAdapter.organizations.verifyEmergencyContact(MANAGER, {
      phone: "+1-800-555-0142",
      attribution: NO_ATTRIBUTION,
    });
    const changed = await mockAdapter.organizations.updateEmergencyContact(
      MANAGER,
      {
        phone: "+1-800-555-0142",
        contractRef: "ERI-CASCADE-2026-0999",
        attribution: NO_ATTRIBUTION,
      },
    );
    expect(changed.emergencyVerifiedAt).toBeNull();
  });

  it("writes nothing and clears nothing when nothing changed", async () => {
    const verified = await mockAdapter.organizations.verifyEmergencyContact(
      MANAGER,
      {
        phone: "+1-800-555-0142",
        attribution: NO_ATTRIBUTION,
      },
    );
    const saved = await mockAdapter.organizations.updateEmergencyContact(
      MANAGER,
      {
        phone: " +1-800-555-0142 ",
        contractRef: "ERI-CASCADE-2026-0117",
        attribution: NO_ATTRIBUTION,
      },
    );
    expect(saved.emergencyVerifiedAt).toBe(verified.emergencyVerifiedAt);
    expect(eventsOf("organization.emergency_contact_updated")).toHaveLength(0);
  });

  it.each([
    ["P1", HANDLER],
    ["P5", AUDITOR],
  ])("refuses %s and changes nothing", async (_persona, caller) => {
    await expect(
      mockAdapter.organizations.updateEmergencyContact(caller, {
        phone: "+1-800-555-0177",
        contractRef: null,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toBeInstanceOf(PermissionError);
    expect((await cascade()).emergencyResponsePhone).toBe("+1-800-555-0142");
  });
});

describe("readEmergencyContactConfiguration", () => {
  it("reads the platform default through the seam, validated", async () => {
    const configuration =
      await mockAdapter.platformConfiguration.readEmergencyContactConfiguration(
        MANAGER,
      );
    expect(configuration).toEqual(PLATFORM_EMERGENCY_CONTACT_CONFIGURATION);
  });
});
