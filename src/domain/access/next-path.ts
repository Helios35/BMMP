import {
  hasUnsafePathCharacter,
  matchRoute,
} from "@/domain/access/match-route";
import { isPublicRoute } from "@/domain/access/routes";
import type { SessionEndReason } from "@/domain/access/denial";

/**
 * Where a caller is sent, and where a caller may ask to be sent.
 *
 * **An open redirect out of a compliance product's sign-in page is a
 * credential-phishing primitive.** `/sign-in?next=https://bmmp-login.example`
 * puts this product's own domain in front of a page it does not control, and the
 * user has no way to tell. So the whole `?next=` decision is one function, in
 * one file, reviewed once, and every caller uses it rather than checking
 * `startsWith("/")` for itself.
 */

/** Anything that could carry a scheme, an authority or a re-encoded separator. */
const FORBIDDEN_IN_PATH = [":", "@", "%2f", "%5c", "%2e%2e"] as const;

/**
 * The `?next=` value, or `/`.
 *
 * Returns `/` unless the value begins with exactly one `/`, carries no scheme,
 * no backslash, no `@` and no re-encoded separator, and resolves through
 * `matchRoute` to a **non-public** `AppRoute`. The public arm matters as much as
 * the rest: `?next=/sign-in` is a redirect loop, and `?next=/invite/<token>`
 * hands a freshly signed-in user back to a token screen.
 *
 * A query string on the value is **kept**, because filter, sort, page and tab
 * state live in the URL (`SITE_ARCHITECTURE.md` §7.4) and a colleague's link
 * survives sign-in only if it arrives intact. It is the path that is validated;
 * the query is carried, and every screen reading it validates its own parameters.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "/";
  if (hasUnsafePathCharacter(raw)) return "/";
  if (raw.includes("\\")) return "/";

  const withoutFragment = raw.split("#")[0] ?? "";
  const queryIndex = withoutFragment.indexOf("?");
  const path =
    queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : withoutFragment.slice(queryIndex);

  const lowered = path.toLowerCase();
  if (FORBIDDEN_IN_PATH.some((token) => lowered.includes(token))) return "/";

  const route = matchRoute(path);
  if (route === null || isPublicRoute(route)) return "/";

  return `${path}${query}`;
}

/**
 * The sign-in URL the guard and the middleware both redirect to.
 *
 * One builder so the two parameters keep one spelling. `next` is passed through
 * {@link safeNextPath} on the way out as well as on the way in — the guard's own
 * input is the forwarded pathname header, which is trustworthy, and running it
 * through anyway costs nothing and removes the question.
 */
export function signInPath(input: {
  readonly next?: string | null;
  readonly reason?: SessionEndReason | null;
}): string {
  const params = new URLSearchParams();
  const next = safeNextPath(input.next);
  if (next !== "/") params.set("next", next);
  if (input.reason !== null && input.reason !== undefined) {
    params.set("reason", input.reason);
  }
  const query = params.toString();
  return query === "" ? "/sign-in" : `/sign-in?${query}`;
}
