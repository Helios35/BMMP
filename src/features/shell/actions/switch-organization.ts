"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { actionFailed, type ActionResult } from "@/lib/action-result";
import {
  publicContext,
  resolveRequestContext,
  writeSessionHandle,
} from "@/lib/auth/session";

/**
 * Change the organisation the caller is acting in — Rules 1.3, 1.5.
 *
 * **A user acts in exactly one organisation at a time and the switch is an
 * explicit act**, so it is a Server Action reached by a form submit and never an
 * optimistic client-side state change. The session handle is rewritten here,
 * which is the only place it can be: Next.js refuses cookie mutation during a
 * render.
 *
 * The target is authorised against **the caller's own in-force membership list**
 * — `identity.memberships`, resolved on this request (Rule 1.28). That list is
 * keyed on the caller's user id and cannot be pointed at anyone else, so
 * refusing here is a `FORBIDDEN`, never a `NOT_FOUND`: it is not a cross-tenant
 * lookup and there is no existence to conceal (Rule 1.2 does not apply).
 *
 * **It redirects to `/` and never back to the current route** — the new role may
 * not be able to open the page the switch was made from
 * (`SITE_ARCHITECTURE.md` §2.4).
 */
export async function switchOrganization(
  _previous: ActionResult<never> | null,
  formData: FormData,
): Promise<ActionResult<never>> {
  const resolution = await resolveRequestContext();

  if (resolution.kind !== "resolved") {
    const pub = await publicContext();
    return actionFailed({
      code: "UNAUTHENTICATED",
      message: "You were signed out. Sign in again and try that once more.",
      correlationId: pub.correlationId,
    });
  }

  const { ctx, identity } = resolution.session;
  const requested = formData.get("organizationId");

  const target =
    typeof requested === "string"
      ? identity.memberships.find(
          (membership) => membership.organizationId === requested,
        )
      : undefined;

  if (target === undefined) {
    return actionFailed({
      code: "FORBIDDEN",
      message: "You can't act in that organisation.",
      field: "organizationId",
      correlationId: ctx.correlationId,
    });
  }

  if (target.organizationId === ctx.organizationId) {
    // Already there. Nothing to record and nothing to write — an act that
    // changes nothing is not an act (Rule 1.3).
    redirect("/");
  }

  // TODO(T-43): Rule 1.3 requires the switch to be recorded, and
  // `AUDIT_EVENT_TYPES` carries no value for it. `TAXONOMY.md` §1.1 forbids
  // inventing one, and writing it under a near neighbour would put a wrong row
  // in an append-only log that no role — including P6 — may edit (Rule 1.21).
  // A missing record is recoverable; a wrong one is not. Raised to P6 as a T-43
  // addition (`session.organization_switched`); the write lands here when the
  // value exists.

  await writeSessionHandle({
    userId: ctx.userId,
    organizationId: target.organizationId,
  });

  revalidatePath("/", "layout");
  redirect("/");
}
