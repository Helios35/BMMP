import { NextResponse, type NextRequest } from "next/server";

import { isSessionEndReason } from "@/domain/access/denial";
import { matchRoute } from "@/domain/access/match-route";
import { isPublicRoute } from "@/domain/access/routes";
import { REQUEST_PATHNAME_HEADER } from "@/lib/auth/request-pathname";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

/**
 * The authentication gate — `SITE_ARCHITECTURE.md` §5.3(1).
 *
 * **It answers one cheap question: is there a session cookie.** It reads no
 * role, no membership and nothing from `src/data` — `src/data/index.ts` imports
 * `server-only` and resolves the adapter at module load, and pulling that into
 * the edge runtime is the wrong design, not a configuration problem. The role
 * decision belongs to the segment guard (`src/lib/auth/guard.ts`), because
 * middleware cannot know which route pattern a dynamic segment resolved to
 * without a second route matcher, and a second route matcher is the duplication
 * §7.2 forbids.
 *
 * It does three things beyond that, all of them cheap and none of them a policy:
 *
 * - Forwards the pathname so a Server Component can know its own URL.
 * - Sends a signed-in caller away from `/sign-in` and `/sign-up`.
 *   **`/invite/[token]` is exempt** — a signed-in user following an invitation
 *   to a *second* organization is Rule 1.5, not an error.
 * - **Clears a stale session cookie** when the guard has just sent the caller to
 *   `/sign-in` saying the session ended. Cookies cannot be modified during a
 *   Server Component render, so the guard signals with `?reason=` and this is
 *   where the clearing happens. Without it a lapsed session bounces off
 *   `/sign-in` back to `/` and loops.
 */

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search, searchParams } = request.nextUrl;

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(REQUEST_PATHNAME_HEADER, `${pathname}${search}`);
  const forward = (): NextResponse =>
    NextResponse.next({ request: { headers: forwardedHeaders } });

  const route = matchRoute(pathname);
  // No route pattern matches — `not-found.tsx` answers it, and a 404 is not a
  // place to make an access decision.
  if (route === null) return forward();

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (isPublicRoute(route)) {
    if (hasSessionCookie && isSessionEndReason(searchParams.get("reason"))) {
      const response = forward();
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }
    if (hasSessionCookie && (route === "/sign-in" || route === "/sign-up")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return forward();
  }

  if (!hasSessionCookie) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  return forward();
}
