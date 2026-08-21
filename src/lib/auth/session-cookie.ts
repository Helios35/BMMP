import type { Uuid } from "@/types/common";

/**
 * The session cookie's name and its encoding — and **nothing that cannot run on
 * the edge.**
 *
 * `src/middleware.ts` answers one cheap question before every request: is a
 * session cookie present. It needs this name and it must not pull
 * `next/headers`, `server-only` or `src/data` into the edge runtime to get it —
 * `src/data/index.ts` resolves the adapter at module load and would follow the
 * import. So the name and the codec live here, alone, importing one type.
 */

export const SESSION_COOKIE_NAME = "bmmp_session";

/**
 * What the session cookie carries. **The same shape under Supabase; only the
 * mechanism changes.**
 *
 * Two identifiers and nothing else. **No role, no capability, no organization
 * name, no expiry.** The role is resolved from live membership data on every
 * request, so a revoked membership or a lapsed grant takes effect at once
 * (Rule 1.28) — a role baked into a cookie is a role that survives its own
 * revocation for as long as the cookie does.
 */
export interface SessionHandle {
  readonly userId: Uuid;
  readonly organizationId: Uuid;
}

/**
 * What was found in the cookie jar.
 *
 * Three outcomes rather than `SessionHandle | null`, because "no cookie" and "a
 * cookie that will not parse" need different handling: the first is an ordinary
 * signed-out request, the second is a stale or tampered cookie that must be
 * cleared or the caller loops between the guard and the sign-in page.
 * `src/lib/errors.ts` — nothing is swallowed, so the failure is a value the
 * caller acts on rather than a null it cannot interpret.
 */
export type SessionCookieRead =
  | { readonly kind: "absent" }
  | { readonly kind: "malformed" }
  | { readonly kind: "handle"; readonly handle: SessionHandle };

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  if (!BASE64URL_PATTERN.test(value)) return null;
  const remainder = value.length % 4;
  if (remainder === 1) return null;

  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    (remainder === 0 ? "" : "=".repeat(4 - remainder));
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * `base64url(JSON)`. **Not signed, and that is deliberate.**
 *
 * A forged cookie buys nothing a real one would not. `identity.resolveSession`
 * validates `(userId, organizationId)` against an in-force membership on **every**
 * request (Rule 1.28), so a tampered `organizationId` resolves to null and the
 * request is signed out; a tampered role is not possible because no role is
 * carried. Impersonating a different `userId` is the residual risk, and it is
 * bounded by the boot guard: `DATA_ADAPTER=mock` is refused under
 * `VERCEL_ENV=production` and throws rather than falling back (D-16), so this
 * cookie format never serves a real record. **Signing is `@supabase/ssr`'s job
 * and arrives with it.**
 */
export function encodeSessionHandle(handle: SessionHandle): string {
  return toBase64Url(
    JSON.stringify({
      userId: handle.userId,
      organizationId: handle.organizationId,
    }),
  );
}

export function decodeSessionCookie(
  raw: string | null | undefined,
): SessionCookieRead {
  if (raw === null || raw === undefined || raw === "")
    return { kind: "absent" };

  const json = fromBase64Url(raw);
  if (json === null) return { kind: "malformed" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Not swallowed: "will not parse" is one of this function's three documented
    // answers, and the caller clears the cookie and logs it (see `./session.ts`).
    return { kind: "malformed" };
  }

  if (typeof parsed !== "object" || parsed === null)
    return { kind: "malformed" };
  const candidate = parsed as Record<string, unknown>;
  const { userId, organizationId } = candidate;
  if (typeof userId !== "string" || userId === "") return { kind: "malformed" };
  if (typeof organizationId !== "string" || organizationId === "") {
    return { kind: "malformed" };
  }

  return { kind: "handle", handle: { userId, organizationId } };
}
