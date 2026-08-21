import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";

import { data } from "@/data";
import type {
  PublicContext,
  RequestContext,
  SessionIdentity,
  SessionMembership,
} from "@/data/contracts";
import { grantWindowLapseReason } from "@/domain/access/grant";
import type { IsoTimestamp } from "@/types/common";

import { REQUEST_PATHNAME_HEADER } from "./request-pathname";
import {
  decodeSessionCookie,
  encodeSessionHandle,
  SESSION_COOKIE_NAME,
  type SessionHandle,
} from "./session-cookie";

/**
 * **This is the module that changes when Supabase Auth lands, and it is the only
 * one** (D-39, `TECHNICAL_SPEC.md` §9.1).
 *
 * The screens are real, the guard is real, the tenancy is real, the audit is
 * real. Only the credential check is fake. When Supabase arrives, the three
 * cookie functions here are reimplemented over `@supabase/ssr`,
 * `src/data/supabase/identity.ts` is written against the contract the mock
 * already satisfies, and `DATA_ADAPTER` flips. **Nothing in `src/app`,
 * `src/features`, `src/components` or `src/domain` changes.** That claim is this
 * unit's deliverable; a change anywhere else at swap time means the seam leaked
 * and the fix belongs in the seam.
 *
 * Two rules govern everything below.
 *
 * **Rule 1.28 — access is re-checked on every request, never only at sign-in.**
 * {@link resolveRequestContext} resolves against live membership data every time
 * it is called, so a revoked membership or a grant that expired eleven seconds
 * ago ends access inside an already-open session. The instant is an argument on
 * {@link resolveRequestContextAt}, so mid-session expiry is provable by a test
 * that moves the clock rather than one that waits.
 *
 * **Rule 1.2 — existence is never disclosed across tenants.** Nothing here
 * compares an organization id for a screen. `ctx.organizationId` is minted by
 * `identity.resolveSession` from a membership that was in force on *this*
 * request, and `src/data` scopes every read by it.
 */

/** Re-exported so a caller needs one import to read, write and type the session. */
export type { SessionHandle };
export { SESSION_COOKIE_NAME };

/** The instant this request is being evaluated at. One place, so tests have one thing to control. */
export function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

// --- the cookie -------------------------------------------------------------

/**
 * Read the session cookie. Returns null when absent or unparseable, and **never
 * throws** — a broken cookie is a signed-out request, not a 500.
 *
 * An unparseable cookie is logged rather than ignored (`src/lib/errors.ts`), and
 * cleared by `src/middleware.ts` on the redirect that follows: cookies cannot be
 * modified during a Server Component render, so the guard signals with
 * `?reason=` and the middleware does the clearing.
 */
export async function readSessionHandle(): Promise<SessionHandle | null> {
  const store = await cookies();
  const read = decodeSessionCookie(store.get(SESSION_COOKIE_NAME)?.value);

  if (read.kind === "malformed") {
    console.warn(
      `[auth] ${SESSION_COOKIE_NAME} could not be decoded; treating the request as signed out`,
    );
    return null;
  }
  return read.kind === "handle" ? read.handle : null;
}

/**
 * Write the session cookie.
 *
 * `httpOnly` so no script can read it, `sameSite: "lax"` so a cross-site POST
 * cannot ride it while an emailed link still works, `secure` outside
 * development, and **no `maxAge`** — it is a session cookie, and a compliance
 * tool used on a shared warehouse terminal should not stay signed in after the
 * browser closes.
 *
 * **Callable from a Server Action or a Route Handler only.** Next.js refuses
 * cookie mutation during a render, which is the correct constraint and not one
 * to work around.
 */
export async function writeSessionHandle(handle: SessionHandle): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE_NAME,
    value: encodeSessionHandle(handle),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV !== "development",
    path: "/",
  });
}

/**
 * Clear the session cookie. Sign-out, and any Server Action that finds the
 * session no longer in force (Rule 1.28).
 *
 * **Callable from a Server Action or a Route Handler only**, for the same reason
 * as {@link writeSessionHandle}. The guard cannot call it — it runs during a
 * render — so it redirects with `?reason=` and `src/middleware.ts` clears the
 * cookie on that response.
 */
export async function clearSessionHandle(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

// --- the caller -------------------------------------------------------------

function firstForwardedAddress(value: string | null): string | null {
  if (value === null) return null;
  const first = value.split(",")[0]?.trim();
  return first === undefined || first === "" ? null : first;
}

/**
 * The caller before a session exists — `/sign-in`, `/sign-up`, `/invite/[token]`.
 *
 * Cached per request, so `correlationId` is stable across every segment, log
 * line and `audit_event` one request produces (`TECHNICAL_SPEC.md` §10.2).
 * **`React.cache` is per-request and does not persist between requests**; a
 * correlation id shared by two requests would join two users' rows in the log.
 */
export const publicContext: () => Promise<PublicContext> = cache(
  async (): Promise<PublicContext> => {
    const headerList = await headers();
    return {
      correlationId: crypto.randomUUID(),
      ipAddress: firstForwardedAddress(headerList.get("x-forwarded-for")),
      userAgent: headerList.get("user-agent"),
    };
  },
);

/** The pathname and query string of the request being served, as the middleware forwarded it. */
export async function requestPathAndQuery(): Promise<string | null> {
  const headerList = await headers();
  return headerList.get(REQUEST_PATHNAME_HEADER);
}

/** Just the pathname — no query string. */
export async function requestPathname(): Promise<string | null> {
  const value = await requestPathAndQuery();
  if (value === null) return null;
  return value.split("?")[0] ?? null;
}

/**
 * A caller resolved against live membership data on this request.
 *
 * `identity` carries every organization the user may act in **right now**, which
 * is the organization switcher's only source and the reason E-16 — a
 * single-organization user, whose switcher is absent rather than disabled — is
 * decidable without a second read.
 */
export interface ResolvedSession {
  readonly ctx: RequestContext;
  readonly identity: SessionIdentity;
  /** The active organization's membership, from the same in-force list. */
  readonly membership: SessionMembership;
}

/**
 * Three outcomes, because the guard owes each of them different behaviour.
 *
 * `anonymous` with `hadSessionCookie` false is an ordinary signed-out request.
 * With it true, a cookie was presented and could not be decoded — the caller is
 * told they were signed out, and the cookie is cleared. `lapsed` is Rule 1.28:
 * the cookie was fine and the membership behind it is not in force any more.
 */
export type ContextResolution =
  | { readonly kind: "anonymous"; readonly hadSessionCookie: boolean }
  | { readonly kind: "lapsed" }
  | { readonly kind: "resolved"; readonly session: ResolvedSession };

/**
 * Resolve the caller **at a stated instant**.
 *
 * The order is the enforcement, and each step refuses for its own reason:
 *
 * 1. No cookie, or one that will not decode → anonymous.
 * 2. `identity.listSessionMemberships` returns only memberships in force at
 *    `at`. The cookie's organization missing from that list is a revoked
 *    membership, an unaccepted invitation or a lapsed grant, and all three end
 *    access now (Rule 1.28).
 * 3. **The grant window is re-checked here as well**, in pure code, so a null
 *    expiry on a role that requires one fails closed at the application layer
 *    too (Rules 1.15, 1.17, 1.18). Belt and braces on purpose: this is the check
 *    whose failure mode is "unlimited platform access to a customer's tenant".
 * 4. `identity.resolveSession` mints the `RequestContext` — it is the only thing
 *    that does, and it applies the same rules underneath.
 *
 * Nothing here reads the clock: `at` arrives from the caller.
 */
export async function resolveRequestContextAt(
  at: IsoTimestamp,
): Promise<ContextResolution> {
  const handle = await readSessionHandle();
  if (handle === null) {
    const store = await cookies();
    return {
      kind: "anonymous",
      hadSessionCookie: store.has(SESSION_COOKIE_NAME),
    };
  }

  const pub = await publicContext();
  const memberships = await data.identity.listSessionMemberships(pub, {
    userId: handle.userId,
    at,
  });

  const membership = memberships.find(
    (candidate) => candidate.organizationId === handle.organizationId,
  );
  if (membership === undefined) return { kind: "lapsed" };
  if (grantWindowLapseReason(membership, at) !== null)
    return { kind: "lapsed" };

  const ctx = await data.identity.resolveSession(pub, {
    userId: handle.userId,
    organizationId: handle.organizationId,
    at,
  });
  if (ctx === null) return { kind: "lapsed" };

  const user = await data.users.get(ctx, ctx.userId);
  if (user === null) return { kind: "lapsed" };

  const identity: SessionIdentity = {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    isPlatformAdmin: user.isPlatformAdmin,
    memberships,
  };

  return { kind: "resolved", session: { ctx, identity, membership } };
}

/**
 * Resolve the caller for **this** request.
 *
 * Wrapped in `React.cache` so one request resolves once however many segments
 * ask — and **per request only.** `React.cache` is scoped to the request that
 * created it and is not a process-wide memo; making it one would keep a
 * signed-out user's context alive, and would defeat Rule 1.28 by construction
 * rather than by accident.
 */
export const resolveRequestContext: () => Promise<ContextResolution> = cache(
  (): Promise<ContextResolution> => resolveRequestContextAt(nowIso()),
);
