"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { firstIssue } from "@/features/intake/schemas";
import type { RequestAttribution } from "@/features/intake/server/audit";
import { requestAttribution } from "@/features/intake/server/session-action";
import {
  actionFailed,
  actionFailedFrom,
  actionSucceeded,
  type ActionResult,
} from "@/lib/action-result";
import { requireWrite } from "@/lib/auth/guard";

import {
  emergencyContactSchema,
  verifyEmergencyContactSchema,
} from "./schemas";

/**
 * The `/settings/organization` writes — the 24-hour emergency contact
 * (`UX_SPEC.md` §3.17, E-11; D-32, D-63; Rules 5.6, 5.7).
 *
 * The five steps of `TECHNICAL_SPEC.md` §7.1: the write guard for the route
 * (P2 and P6; every other role is refused and the attempt audited), a zod
 * parse, the adapter's one operation — which writes its own audit row — and a
 * revalidation of everything that reads the organization: this page, step 3's
 * checklist, the shipment pages.
 *
 * **Neither action accepts a date or a person.** A save clears the
 * verification in the same write; a verification is stamped by the adapter
 * from its clock and from the session (D-63 #2, #3).
 */

const ROUTE = "/settings/organization";

async function settingsAction<TInput, TData>(
  attempted: string,
  schema: z.ZodType<TInput>,
  input: unknown,
  run: (
    ctx: RequestContext,
    parsed: TInput,
    attribution: RequestAttribution,
  ) => Promise<TData>,
): Promise<ActionResult<TData>> {
  const guard = await requireWrite(ROUTE, attempted);
  if (!guard.ok) return guard;
  const { ctx } = guard;

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = firstIssue(parsed.error);
    return actionFailed<TData>({
      code: "VALIDATION",
      message: issue.message,
      ...(issue.field === undefined ? {} : { field: issue.field }),
      correlationId: ctx.correlationId,
    });
  }

  try {
    const result = await run(ctx, parsed.data, await requestAttribution());
    revalidatePath("/", "layout");
    return actionSucceeded(result);
  } catch (error) {
    return actionFailedFrom<TData>(error, ctx.correlationId);
  }
}

export interface EmergencyContactSaved {
  /** Whether anything changed — an unchanged save writes and clears nothing. */
  readonly changed: boolean;
}

/** **Save changes** — any change clears the verification (D-63 #2). */
export async function saveEmergencyContact(
  input: unknown,
): Promise<ActionResult<EmergencyContactSaved>> {
  return settingsAction(
    "save the 24-hour emergency contact",
    emergencyContactSchema,
    input,
    async (ctx, parsed, attribution) => {
      const before = await data.organizations.get(ctx, ctx.organizationId);
      const after = await data.organizations.updateEmergencyContact(ctx, {
        phone: parsed.phone,
        contractRef: parsed.contractRef,
        attribution,
      });
      return {
        changed:
          before?.emergencyResponsePhone !== after.emergencyResponsePhone ||
          before?.emergencyResponseContractRef !==
            after.emergencyResponseContractRef,
      };
    },
  );
}

/** **Verify** — the attestation, stamped by the server (D-63 #3). */
export async function verifyEmergencyContact(
  input: unknown,
): Promise<ActionResult<{ readonly verifiedAt: string | null }>> {
  return settingsAction(
    "verify the 24-hour emergency contact",
    verifyEmergencyContactSchema,
    input,
    async (ctx, parsed, attribution) => {
      const organization = await data.organizations.verifyEmergencyContact(
        ctx,
        { phone: parsed.phone, attribution },
      );
      return { verifiedAt: organization.emergencyVerifiedAt };
    },
  );
}
