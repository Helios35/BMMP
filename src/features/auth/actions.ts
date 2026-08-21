"use server";

import { redirect } from "next/navigation";

import { data } from "@/data";
import type { SessionIdentity, SessionMembership } from "@/data/contracts";
import { safeNextPath } from "@/domain/access/next-path";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import {
  clearSessionHandle,
  publicContext,
  readSessionHandle,
  resolveRequestContext,
  writeSessionHandle,
} from "@/lib/auth/session";
import {
  clearSignInFailures,
  recordSignInFailure,
  signInAttemptVerdict,
} from "@/lib/auth/rate-limit";
import {
  actionFailed,
  actionFailedFrom,
  type ActionResult,
} from "@/lib/action-result";
import { ConflictError } from "@/lib/errors";

import {
  acceptInvitationSchema,
  firstIssue,
  signInSchema,
  signUpSchema,
} from "./schemas";
import { TERMS_DOCUMENT_KEY, TERMS_DOCUMENT_VERSION } from "./terms-document";

/**
 * The authentication Server Actions — `TECHNICAL_SPEC.md` §7.1, D-39.
 *
 * **These are Server Actions rather than route handlers for two reasons.** The
 * response is not JSON and the caller is the BMMP UI, so §7.1's three exceptions
 * do not apply; and `writeSessionHandle` / `clearSessionHandle` are
 * Server-Action-only — Next.js refuses cookie mutation during a render, which is
 * the correct constraint and not one to work around.
 *
 * **Only the credential check is fake** (D-39). The validation, the copy, the
 * redirects, the tenancy and the audit are all real, and every one of them sits
 * on the contract in `src/data/contracts/identity.ts`. When Supabase Auth lands,
 * `src/lib/auth/session.ts` and `src/data/supabase/identity.ts` change and
 * nothing here does.
 *
 * ## Two shapes that repeat, and why
 *
 * Each action returns `ActionResult` from `@/lib/action-result` and **never
 * throws across the boundary** — a thrown error arrives in production as a
 * redacted digest, losing the field, the code the form branches on and the
 * correlation id a user reads back over the phone. `redirect()` is the one
 * exception, because it is control flow rather than a failure.
 *
 * Every `redirect()` is therefore called **outside** the `try`, since Next
 * signals it by throwing and a `catch` that turns it into an `ActionResult`
 * would leave the caller sitting on a form that has already succeeded.
 *
 * ## The audit gap, stated rather than worked around
 *
 * Rule 12.1 audits sign-in. **T-43 carries no `session.signed_in` event type,**
 * and `TAXONOMY.md` §1.1 is explicit that a builder never invents a value. So
 * sign-in, sign-up, sign-out and invitation acceptance write no `audit_event` in
 * this unit and the build-notes say so — see the `TODO(T-43)` markers below.
 * Route and write denials **are** audited: `denial.recorded` exists.
 */

/** One message for a wrong password and for an address that has no account (`UX_SPEC.md` §3.1). */
const CREDENTIALS_REJECTED = "That email or password didn't work.";

/**
 * Rules 1.9, 1.15 — only P2 and P6 invite, and only P2 and P6 issue a grant. The
 * labels come from `ROLE_LABELS` because a T-37 label written inline is a defect
 * even when it happens to match (`TAXONOMY.md` §5.3).
 */
const NO_ORGANIZATION_MESSAGE = `You don't have access to any organization right now. Ask a ${ROLE_LABELS.facility_manager} or a ${ROLE_LABELS.platform_admin} to invite you, or to issue a grant.`;

function optionalField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function requiredField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Which organization this session acts in — Rule 1.3, one at a time.
 *
 * `preferredOrganizationId` is the invitation's organization where one was just
 * accepted, or the organization the existing cookie already named. Anything not
 * in the in-force list is ignored rather than trusted: the list is resolved from
 * live membership data on this request, so a stale cookie cannot keep a revoked
 * organization alive (Rule 1.28).
 *
 * The fallback is the **first** entry, and the mock returns the list sorted by
 * organization name so "first" is the same entry on every run rather than
 * whatever insertion order produced.
 */
function chooseActiveMembership(
  memberships: readonly SessionMembership[],
  preferredOrganizationId: string | null,
): SessionMembership | null {
  const preferred =
    preferredOrganizationId === null
      ? undefined
      : memberships.find(
          (membership) => membership.organizationId === preferredOrganizationId,
        );
  return preferred ?? memberships[0] ?? null;
}

/**
 * The organization joined by this acceptance, by comparing the in-force lists
 * either side of it.
 *
 * `acceptInvitation` returns the whole identity rather than the membership it
 * created, and `ValidInvitation` deliberately carries no organization id — it
 * carries a name, a role and an inviter and nothing else, because it is rendered
 * before the reader has authenticated (Rule 1.2). The difference between the two
 * lists is therefore the honest way to find it, and an idempotent re-acceptance
 * correctly yields nothing new.
 */
function organizationJoined(
  before: readonly SessionMembership[],
  after: readonly SessionMembership[],
): string | null {
  const known = new Set(before.map((membership) => membership.membershipId));
  const joined = after.find(
    (membership) => !known.has(membership.membershipId),
  );
  return joined?.organizationId ?? null;
}

// --- sign in ----------------------------------------------------------------

export async function signIn(
  _previous: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const pub = await publicContext();
  let destination: string;

  try {
    const parsed = signInSchema.safeParse({
      email: requiredField(form, "email"),
      password: requiredField(form, "password"),
    });
    if (!parsed.success) {
      const issue = firstIssue(parsed.error);
      return actionFailed<never>({
        code: "VALIDATION",
        message: issue.message,
        ...(issue.field === undefined ? {} : { field: issue.field }),
        correlationId: pub.correlationId,
      });
    }

    const { email, password } = parsed.data;

    // Keyed on the address alone and checked before the credential lookup, so
    // the lockout message cannot differ between a registered address and an
    // unregistered one — a message that only appears for real accounts answers
    // "does this address exist" by omission.
    const verdict = signInAttemptVerdict(email);
    if (!verdict.allowed) {
      return actionFailed<never>({
        code: "FORBIDDEN",
        message: `Too many attempts. Try again in ${verdict.retryAfterMinutes} minutes.`,
        correlationId: pub.correlationId,
      });
    }

    const identity = await data.identity.verifyCredentials(pub, {
      email,
      password,
    });
    if (identity === null) {
      recordSignInFailure(email);
      // TODO(T-43): Rule 12.1 audits sign-in, and a failed attempt is evidence.
      // AUDIT_EVENT_TYPES carries no `session.signed_in_failed` value, and
      // TAXONOMY.md §1.1 forbids inventing one. Raised as OQ-2.
      return actionFailed<never>({
        code: "UNAUTHENTICATED",
        message: CREDENTIALS_REJECTED,
        correlationId: pub.correlationId,
      });
    }

    const token = optionalField(form, "token");
    let memberships = identity.memberships;
    let preferredOrganizationId: string | null = null;

    if (token !== undefined) {
      // Flow E step 6 — the invitation is accepted first, and the organization
      // it named becomes the one this session acts in.
      const joined = await data.identity.acceptInvitation(pub, {
        token,
        userId: identity.userId,
      });
      preferredOrganizationId = organizationJoined(
        identity.memberships,
        joined.memberships,
      );
      memberships = joined.memberships;
    }

    if (preferredOrganizationId === null) {
      const existing = await readSessionHandle();
      preferredOrganizationId =
        existing === null ? null : existing.organizationId;
    }

    const membership = chooseActiveMembership(
      memberships,
      preferredOrganizationId,
    );
    // A P6 with no grant anywhere, or a fully revoked member. **No session is
    // written** — an authenticated caller with no organization has nothing to
    // act in, and a cookie naming none of them would resolve as lapsed on the
    // next request and loop.
    if (membership === null) {
      return actionFailed<never>({
        code: "FORBIDDEN",
        message: NO_ORGANIZATION_MESSAGE,
        correlationId: pub.correlationId,
      });
    }

    clearSignInFailures(email);
    await writeSessionHandle({
      userId: identity.userId,
      organizationId: membership.organizationId,
    });
    // TODO(T-43): Rule 12.1 — a successful sign-in is an audited act and
    // AUDIT_EVENT_TYPES has no `session.signed_in` value. OQ-2.

    destination = safeNextPath(optionalField(form, "next"));
  } catch (error) {
    return actionFailedFrom<never>(error, pub.correlationId);
  }

  redirect(destination);
}

// --- sign up ----------------------------------------------------------------

export async function signUp(
  _previous: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const pub = await publicContext();

  try {
    const invitationToken = optionalField(form, "token");
    const parsed = signUpSchema.safeParse({
      fullName: requiredField(form, "fullName"),
      email: requiredField(form, "email"),
      password: requiredField(form, "password"),
      organizationName: optionalField(form, "organizationName"),
      invitationToken,
      acceptsTerms: form.get("acceptsTerms") === "on",
    });
    if (!parsed.success) {
      const issue = firstIssue(parsed.error);
      return actionFailed<never>({
        code: "VALIDATION",
        message: issue.message,
        ...(issue.field === undefined ? {} : { field: issue.field }),
        correlationId: pub.correlationId,
      });
    }

    const input = parsed.data;
    let identity: SessionIdentity;
    try {
      // Rule 1.8 — founding an organization or accepting an invitation, and
      // there is no third way. Rule 7.5 — the acceptance records the exact
      // version, the accepting user and the instant, permanently and never
      // editably; the founding member is its first binding-authority holder
      // (Rules 1.8, 7.3; D-35).
      identity = await data.identity.createAccount(pub, {
        email: input.email,
        password: input.password,
        fullName: input.fullName,
        invitationToken: invitationToken ?? null,
        organizationName:
          invitationToken === undefined
            ? (input.organizationName ?? null)
            : null,
        tosDocumentKey: TERMS_DOCUMENT_KEY,
        tosDocumentVersion: TERMS_DOCUMENT_VERSION,
        trainingRightsGranted: true,
      });
    } catch (error) {
      // Put the one recoverable failure on the field it belongs to, so the form
      // renders it inline rather than replacing the page (§10.3). Everything
      // else falls through to the outer catch untouched.
      if (error instanceof ConflictError) {
        return actionFailed<never>({
          code: "CONFLICT",
          message: "An account already exists for this email.",
          field: "email",
          correlationId: pub.correlationId,
        });
      }
      throw error;
    }

    const membership = chooseActiveMembership(identity.memberships, null);
    if (membership === null) {
      return actionFailed<never>({
        code: "FORBIDDEN",
        message: NO_ORGANIZATION_MESSAGE,
        correlationId: pub.correlationId,
      });
    }

    clearSignInFailures(input.email);
    await writeSessionHandle({
      userId: identity.userId,
      organizationId: membership.organizationId,
    });
    // TODO(T-43): Rule 7.5 records the acceptance and Rule 12.1 audits the
    // account creation. AUDIT_EVENT_TYPES has neither `tos_acceptance.recorded`
    // nor `session.signed_in`, and TAXONOMY.md §1.1 forbids inventing one. OQ-2.
  } catch (error) {
    return actionFailedFrom<never>(error, pub.correlationId);
  }

  redirect("/");
}

// --- sign out ---------------------------------------------------------------

/**
 * Invoked from `<form action={signOut}>` — **never a `<Link href="/sign-out">`.**
 *
 * A GET sign-out is prefetched by the router and followed by anything that
 * crawls a page, which signs a warehouse user out because a link scrolled into
 * view. It is a POST, and it is a Server Action because clearing the cookie
 * cannot happen during a render.
 */
export async function signOut(): Promise<never> {
  await clearSessionHandle();
  // TODO(T-43): Rule 12.1 audits the end of a session as well as its start, and
  // AUDIT_EVENT_TYPES carries no value for it. OQ-2.
  redirect("/sign-in");
}

// --- accept an invitation, already signed in --------------------------------

/**
 * Accept an invitation as a caller who is already signed in — Rule 1.5.
 *
 * A user may be invited to a **second** organization while signed in to the
 * first, which is why `src/middleware.ts` exempts `/invite/[token]` from the
 * signed-in redirect. It also means Flow E step 2's "carry the token to
 * `/sign-in`" cannot serve this caller: the middleware would send them straight
 * to `/`, and the invitation would never be accepted. So a signed-in reader gets
 * a submit button calling this action instead of a link.
 *
 * The new organization becomes the active one, because landing back on the first
 * organization after accepting an invitation to the second reads as a failure.
 */
export async function acceptInvitation(
  _previous: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const pub = await publicContext();

  try {
    const parsed = acceptInvitationSchema.safeParse({
      token: requiredField(form, "token"),
    });
    if (!parsed.success) {
      return actionFailed<never>({
        code: "VALIDATION",
        message: "That invitation link isn't valid.",
        correlationId: pub.correlationId,
      });
    }

    const resolution = await resolveRequestContext();
    if (resolution.kind !== "resolved") {
      // Not an error the reader can act on from here — they are signed out, and
      // the public path through Flow E step 2 is the one that applies.
      return actionFailed<never>({
        code: "UNAUTHENTICATED",
        message: "You were signed out. Sign in to accept this invitation.",
        correlationId: pub.correlationId,
      });
    }

    const before = resolution.session.identity.memberships;
    const after = await data.identity.acceptInvitation(pub, {
      token: parsed.data.token,
      userId: resolution.session.ctx.userId,
    });

    const joinedOrganizationId = organizationJoined(before, after.memberships);
    const membership = chooseActiveMembership(
      after.memberships,
      joinedOrganizationId,
    );
    if (membership === null) {
      return actionFailed<never>({
        code: "FORBIDDEN",
        message: NO_ORGANIZATION_MESSAGE,
        correlationId: pub.correlationId,
      });
    }

    await writeSessionHandle({
      userId: after.userId,
      organizationId: membership.organizationId,
    });
    // TODO(T-43): `UX_SPEC.md` §3.18 says an invitation writes an `audit_event`.
    // AUDIT_EVENT_TYPES has no `membership.accepted` value. OQ-2.
  } catch (error) {
    return actionFailedFrom<never>(error, pub.correlationId);
  }

  redirect("/");
}
