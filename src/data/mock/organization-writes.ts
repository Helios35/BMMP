import type { RequestContext } from "@/data/contracts/context";
import type {
  EmergencyContactAttestation,
  EmergencyContactChange,
} from "@/data/contracts/tenancy";
import {
  ConflictError,
  DataIntegrityError,
  ValidationError,
} from "@/lib/errors";
import type { Organization } from "@/types/tenancy";

import { writeTriggerAudit as audit } from "./audit-row";
import { now } from "./factory";
import { assertPolicy } from "./policy";
import { mockStore } from "./store";

/**
 * The two writes the 24-hour emergency contact moves through — D-32, D-63,
 * Rules 5.5–5.7.
 *
 * **Each is one operation, all or nothing**, exactly as the storage and
 * shipment writes are: the organization row and its audit row land together
 * or neither does. In Postgres each is one function and the audit row comes
 * from the trigger; here it goes in through the `security definer` door.
 *
 * **Neither takes an id.** Both act on `ctx.organizationId`, so neither can
 * reach another tenant — and both are the `organization` UPDATE policy, which
 * is P2's (and P6's, under a grant). P1, P3, P4 and P5 are refused.
 */

const store = () => mockStore();

async function atomically<T>(write: () => Promise<T>): Promise<T> {
  const s = store();
  const organizations = [...s.organizations.all()];
  const auditEvents = [...s.auditEvents.all()];
  try {
    return await write();
  } catch (cause) {
    s.organizations.replaceAll(organizations);
    s.auditEvents.replaceAll(auditEvents);
    throw cause;
  }
}

async function activeOrganization(ctx: RequestContext): Promise<Organization> {
  const organization = await store().organizations.get(ctx, ctx.organizationId);
  if (organization === null) {
    throw new DataIntegrityError({
      userMessage: "Your organization could not be read. Nothing was changed.",
      correlationId: ctx.correlationId,
      context: { organizationId: ctx.organizationId },
    });
  }
  return organization;
}

/** Blank is absent: never an empty string where a document expects a value. */
function blankToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function contactState(organization: Organization) {
  return {
    phone: organization.emergencyResponsePhone,
    contractRef: organization.emergencyResponseContractRef,
    verifiedAt: organization.emergencyVerifiedAt,
    verifiedBy: organization.emergencyVerifiedBy,
  };
}

/**
 * D-63 #2 — **any change clears the verification in the same write.** A
 * changed contact is an unchecked contact; the stamp belonged to the number
 * that was called, not to this one.
 */
export async function updateEmergencyContact(
  ctx: RequestContext,
  change: EmergencyContactChange,
): Promise<Organization> {
  assertPolicy(ctx, "organization", "update");
  const before = await activeOrganization(ctx);
  const phone = blankToNull(change.phone);
  const contractRef = blankToNull(change.contractRef);

  const changedFields = [
    ...(phone === before.emergencyResponsePhone
      ? []
      : ["emergencyResponsePhone"]),
    ...(contractRef === before.emergencyResponseContractRef
      ? []
      : ["emergencyResponseContractRef"]),
  ];
  // Nothing changed: nothing is written, and a verification that still
  // describes the number on file is not cleared.
  if (changedFields.length === 0) return before;

  const at = now();
  return atomically(async () => {
    const after = await store().organizations.update(ctx, before.id, {
      emergencyResponsePhone: phone,
      emergencyResponseContractRef: contractRef,
      emergencyVerifiedAt: null,
      emergencyVerifiedBy: null,
      updatedAt: at,
      updatedBy: ctx.userId,
    });
    const clearedVerification = before.emergencyVerifiedAt !== null;
    await audit(ctx, at, change.attribution, {
      eventType: "organization.emergency_contact_updated",
      entityTable: "organization",
      entityId: before.id,
      beforeState: contactState(before),
      afterState: contactState(after),
      changedFields: clearedVerification
        ? [...changedFields, "emergencyVerifiedAt", "emergencyVerifiedBy"]
        : changedFields,
    });
    return after;
  });
}

/**
 * D-63 #3, Rule 5.6 — the verification is a person's attestation. The instant
 * is this adapter's clock and the person is `ctx`; the attestation carries
 * neither, so nothing a form sends can stamp one.
 */
export async function verifyEmergencyContact(
  ctx: RequestContext,
  attestation: EmergencyContactAttestation,
): Promise<Organization> {
  assertPolicy(ctx, "organization", "update");
  const before = await activeOrganization(ctx);
  const onFile = blankToNull(before.emergencyResponsePhone);

  if (onFile === null) {
    throw new ValidationError({
      userMessage:
        "There is no 24-hour number on file to verify. Record the number first.",
      correlationId: ctx.correlationId,
      context: { rule: "5.6" },
    });
  }
  if (blankToNull(attestation.phone) !== onFile) {
    // The person attested to a number that is no longer the one on file — it
    // changed underneath them. Stamping it would attest to a call nobody made.
    throw new ConflictError({
      userMessage:
        "The 24-hour number changed since you opened this page. Nothing was verified — check the number on file and verify it again.",
      correlationId: ctx.correlationId,
      context: { rule: "5.6" },
    });
  }

  const at = now();
  return atomically(async () => {
    const after = await store().organizations.update(ctx, before.id, {
      emergencyVerifiedAt: at,
      emergencyVerifiedBy: ctx.userId,
      updatedAt: at,
      updatedBy: ctx.userId,
    });
    await audit(ctx, at, attestation.attribution, {
      eventType: "organization.emergency_contact_verified",
      entityTable: "organization",
      entityId: before.id,
      beforeState: {
        phone: onFile,
        verifiedAt: before.emergencyVerifiedAt,
        verifiedBy: before.emergencyVerifiedBy,
      },
      afterState: {
        phone: onFile,
        verifiedAt: after.emergencyVerifiedAt,
        verifiedBy: after.emergencyVerifiedBy,
      },
      changedFields: ["emergencyVerifiedAt", "emergencyVerifiedBy"],
    });
    return after;
  });
}
