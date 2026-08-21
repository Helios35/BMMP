import { APP_ROUTES, type AppRoute } from "@/domain/access/routes";

/**
 * The one place a URL becomes an {@link AppRoute}.
 *
 * `ROUTE_ACCESS` is keyed on route patterns, so every consumer that starts from
 * a concrete URL — the middleware, a segment naming itself, a `?next=` value —
 * has to turn `/batteries/9f1c…` into `/batteries/[id]` first. **A second
 * pathname-to-route matcher is the duplication `SITE_ARCHITECTURE.md` §7.2
 * forbids**, so the patterns are derived from `APP_ROUTES` at module load and
 * there is no second list.
 */

interface RoutePattern {
  readonly route: AppRoute;
  readonly segments: readonly string[];
  /** Parameter name per segment, or null where the segment is a literal. */
  readonly parameterNames: readonly (string | null)[];
}

function parameterNameOf(segment: string): string | null {
  return segment.startsWith("[") && segment.endsWith("]")
    ? segment.slice(1, -1)
    : null;
}

const ROUTE_PATTERNS: readonly RoutePattern[] = APP_ROUTES.map((route) => {
  const segments = route === "/" ? [] : route.slice(1).split("/");
  return {
    route,
    segments,
    parameterNames: segments.map(parameterNameOf),
  };
});

/** The highest code point no route pattern contains: the space and everything below it. */
const LOWEST_PRINTABLE_CODE_POINT = 0x21;
const DELETE_CODE_POINT = 0x7f;

/**
 * Whether the value carries a control character or a space.
 *
 * No route pattern contains either, and a crafted `?next=` uses them to smuggle
 * one shape past a check written for another. Written as a scan rather than as a
 * regular expression because a control-character class is the kind of literal
 * that survives one copy-paste and not two.
 */
export function hasUnsafePathCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < LOWEST_PRINTABLE_CODE_POINT) return true;
    if (codePoint === DELETE_CODE_POINT) return true;
  }
  return false;
}

/**
 * A pathname's segments, or null where the value is not a pathname this
 * application would ever serve.
 *
 * Rejected outright: anything not beginning with exactly one `/`, a protocol
 * relative `//host`, a backslash, an empty segment, a `.` or `..` traversal, a
 * control character, and a value carrying its own query string or fragment.
 * **`//evil.example` is a URL, not a path**, and the cheapest place to refuse it
 * is before anything treats it as one.
 */
function pathSegments(pathname: string): readonly string[] | null {
  if (!pathname.startsWith("/")) return null;
  if (pathname.startsWith("//")) return null;
  if (pathname.includes("\\")) return null;
  if (pathname.includes("?") || pathname.includes("#")) return null;
  if (hasUnsafePathCharacter(pathname)) return null;

  const trimmed =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  if (trimmed === "/") return [];

  const segments = trimmed.slice(1).split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return null;
  }
  return segments;
}

function patternMatches(
  pattern: RoutePattern,
  segments: readonly string[],
): boolean {
  if (pattern.segments.length !== segments.length) return false;
  return pattern.segments.every((patternSegment, index) => {
    if (pattern.parameterNames[index] !== null) return true;
    return patternSegment === segments[index];
  });
}

/**
 * Whether `candidate` is a closer match than `incumbent`.
 *
 * Literal segments beat dynamic ones, left to right, so `/batteries/new` never
 * resolves to `/batteries/[id]`. Getting this backwards would hand the intake
 * route's identifier `"new"` to a record lookup, which then resolves as not
 * found — a defect that reads as a missing record rather than as a router fault.
 */
function isMoreSpecific(
  candidate: RoutePattern,
  incumbent: RoutePattern,
): boolean {
  for (let index = 0; index < candidate.segments.length; index += 1) {
    const candidateIsDynamic = candidate.parameterNames[index] !== null;
    const incumbentIsDynamic = incumbent.parameterNames[index] !== null;
    if (candidateIsDynamic !== incumbentIsDynamic) return !candidateIsDynamic;
  }
  return false;
}

/**
 * Resolve a concrete pathname to its route pattern, or null.
 *
 * Trailing slashes are ignored. **Query strings are the caller's to strip** — a
 * value carrying one is refused rather than silently truncated, because a
 * matcher that quietly discards half its input is a matcher nobody checks.
 */
export function matchRoute(pathname: string): AppRoute | null {
  const segments = pathSegments(pathname);
  if (segments === null) return null;

  let best: RoutePattern | null = null;
  for (const pattern of ROUTE_PATTERNS) {
    if (!patternMatches(pattern, segments)) continue;
    if (best === null || isMoreSpecific(pattern, best)) best = pattern;
  }
  return best === null ? null : best.route;
}

/**
 * The dynamic segment values, keyed by parameter name. Empty for a static route,
 * and empty where the pathname does not belong to the route.
 *
 * The values are returned exactly as they arrived. **A value here is untrusted
 * input** — an identifier from a URL is checked by `src/data`, which returns
 * null for a row in another organization (Rule 1.2), never by a caller comparing
 * organization ids for itself.
 */
export function routeParams(
  route: AppRoute,
  pathname: string,
): Readonly<Record<string, string>> {
  const pattern = ROUTE_PATTERNS.find((entry) => entry.route === route);
  if (pattern === undefined) return {};

  const segments = pathSegments(pathname);
  if (segments === null || !patternMatches(pattern, segments)) return {};

  const params: Record<string, string> = {};
  pattern.parameterNames.forEach((parameterName, index) => {
    const value = segments[index];
    if (parameterName !== null && value !== undefined) {
      params[parameterName] = value;
    }
  });
  return params;
}
