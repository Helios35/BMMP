import "server-only";

import { redirect } from "next/navigation";

import type {
  RequestContext,
  SessionIdentity,
  SessionMembership,
} from "@/data/contracts";
import { canRead, canWrite, type Capability } from "@/domain/access/capability";
import { denialSentence, writeDenialMessage } from "@/domain/access/denial";
import { signInPath } from "@/domain/access/next-path";
import { capabilityFor } from "@/domain/access/route-capability";
import type { AppRoute } from "@/domain/access/routes";
import type { ActionResult } from "@/lib/action-result";

import { recordRouteDenial, recordWriteDenial } from "./record-denial";
import {
  publicContext,
  requestPathAndQuery,
  resolveRequestContext,
} from "./session";

/**
 * The guard every `(app)` segment and every Server Action passes through.
 *
 * **Middleware alone is not the guard.** It answers one cheap question — is
 * there a session cookie — and cannot see which route pattern a dynamic segment
 * resolved to without duplicating the matcher, and duplicating a route list is
 * the failure `SITE_ARCHITECTURE.md` §7.2 exists to prevent. So the role
 * decision happens here, server-side, in the segment, against **the same
 * `ROUTE_ACCESS` the navigation, the command palette and every cross-route link
 * read** (§5.3(3), §5.3(7)).
 *
 * **Never the only enforcement.** Every mutating Server Action re-checks,
 * `src/data/mock/policy.ts` refuses underneath that, and RLS refuses underneath
 * that again (§5.3(6), §5.3(9); `TECHNICAL_SPEC.md` §9.4, §9.5).
 *
 * **The two denials are different on purpose and this file only handles one of
 * them.** A member without the capability is redirected with a toast naming the
 * restriction (§5.3(4)). **An identifier belonging to another organization never
 * reaches this file**: the guard has already passed, the role may read the
 * route, and it is the *record* that is not theirs — `src/data` returns null for
 * it and the segment calls `notFound()`. No code path in `src/app` ever holds
 * enough information to tell "absent" from "another tenant's", which is what
 * makes Rule 1.2 structural rather than a habit. **Do not add a check here that
 * would.**
 */

export interface GuardedRequest {
  readonly ctx: RequestContext;
  readonly identity: SessionIdentity;
  readonly membership: SessionMembership;
  /**
   * This role's capability on this route. **`read` or `write`, never `none`** —
   * {@link requireRoute} does not return on a denial.
   */
  readonly capability: Capability;
}

/**
 * Resolve the caller and prove they may be on this route. **The first statement
 * of every `(app)` segment.**
 *
 * Redirects and does not return on any denial. The three redirects are three
 * different situations:
 *
 * | Situation | Where it goes | Audited |
 * |---|---|---|
 * | No session | `/sign-in?next=…` | No — nobody to attribute it to |
 * | Session ended (Rule 1.28) | `/sign-in?reason=grant_expired` | No — same reason |
 * | Role cannot open the route | `/?denied=<route>` | **Yes** (§5.3(8)) |
 *
 * The cookie is not cleared here: Next.js refuses cookie mutation during a
 * render, so the redirect carries `?reason=` and `src/middleware.ts` clears it
 * on that response — which is also what stops a stale cookie bouncing the caller
 * straight back off `/sign-in`.
 */
export async function requireRoute(route: AppRoute): Promise<GuardedRequest> {
  const resolution = await resolveRequestContext();

  if (resolution.kind === "anonymous") {
    const next = await requestPathAndQuery();
    redirect(
      signInPath({
        next,
        reason: resolution.hadSessionCookie ? "session_expired" : null,
      }),
    );
  }

  if (resolution.kind === "lapsed") {
    // Rule 1.28 — a revoked membership or an expired grant ends access inside an
    // already-open session. No `next`: the route may not be readable by whatever
    // access this person has when they come back.
    redirect(signInPath({ reason: "grant_expired" }));
  }

  const { ctx, identity, membership } = resolution.session;
  const capability = capabilityFor(ctx.role, route);

  if (!canRead(capability)) {
    await recordRouteDenial(ctx, route);
    redirect(`/?denied=${encodeURIComponent(route)}`);
  }

  return { ctx, identity, membership, capability };
}

/**
 * The Server Action guard — `TECHNICAL_SPEC.md` §7.1 step 3.
 *
 * **Records the denial and returns the error rather than redirecting.** A Server
 * Action that redirects on a refusal loses the field-level message, the code the
 * form branches on and the correlation id the user reads back over the phone.
 *
 * `attempted` names the action for the audit row; it defaults to the route,
 * which is right for a route with one write and wrong for a route with several.
 */
export async function requireWrite(
  route: AppRoute,
  attempted: string = route,
): Promise<WriteGuardResult> {
  const resolution = await resolveRequestContext();

  if (resolution.kind !== "resolved") {
    const pub = await publicContext();
    return {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "You were signed out. Sign in again and try that once more.",
        correlationId: pub.correlationId,
      },
    };
  }

  const { ctx } = resolution.session;
  const capability = capabilityFor(ctx.role, route);

  if (!canWrite(capability)) {
    await recordWriteDenial(ctx, route, attempted);
    return {
      ok: false,
      error: {
        // Rule 1.26 — the denial states the reason and names the governing rule,
        // built from ROUTE_ACCESS so it cannot disagree with the guard.
        code: "FORBIDDEN",
        message: denialSentence(writeDenialMessage(ctx.role, route)),
        correlationId: ctx.correlationId,
      },
    };
  }

  return { ok: true, ctx };
}

/**
 * What {@link requireWrite} returns.
 *
 * The failure arm is `ActionResult`'s own, by construction rather than by
 * copying it — so an action can `return guard` on a refusal and the user reads
 * one shape of error however it was produced (`src/lib/action-result.ts`).
 */
export type WriteGuardResult =
  | { readonly ok: true; readonly ctx: RequestContext }
  | Extract<ActionResult<never>, { ok: false }>;
