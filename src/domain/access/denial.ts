import {
  canReadRoute,
  canWriteRoute,
  ROUTE_ACCESS,
} from "@/domain/access/route-capability";
import {
  APP_ROUTES,
  APP_ROUTE_NAMES,
  type AppRoute,
} from "@/domain/access/routes";
import { ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/domain/taxonomy/role";

/**
 * What the product says when it refuses.
 *
 * **Rule 1.26 — every permission denial states its reason in plain language and,
 * where a rule governs it, names the rule. A silently disabled control is a
 * defect.** So the copy is not optional and it is not a per-screen decision.
 *
 * **Every string here is derived from `ROUTE_ACCESS` and `ROLE_LABELS`.** A
 * second structure keyed by route — a message map, a "who can reach this" list,
 * a role description table — is exactly the duplication `SITE_ARCHITECTURE.md`
 * §7.2 forbids, and it is how a nav item, a toast and a route come to disagree
 * about who may open a page. If a denial needs to say something new, the fact it
 * needs is a field on {@link RouteAccessRule}, not a new lookup.
 *
 * **The two denials this module serves are different on purpose.** A member
 * without the capability is told the page exists and is not theirs (§5.3(4)).
 * **A record belonging to another organization is not this module's business at
 * all** — it resolves as not found inside `src/data`, and nothing in the
 * application layer ever holds enough information to say otherwise (§5.3(5),
 * Rule 1.2). There is deliberately no cross-tenant message here to reach for.
 */

export interface RouteDenialMessage {
  /** "Audit log isn't available to the Compliance Handler role." */
  readonly headline: string;
  /** "A Facility Manager, an Auditor / Underwriter or a Platform Admin can open it." */
  readonly remedy: string;
  /** "Rule 12.8", or null where no numbered rule governs. Rule 1.26. */
  readonly governingRule: string | null;
}

/**
 * `a` or `an`, by the label's first letter.
 *
 * This prefixes a T-37 label; it never transforms one. `TAXONOMY.md` §5.1 rules
 * out deriving a label from a value by string transform, and that stands — the
 * label still comes from `ROLE_LABELS` unaltered, and only the article in front
 * of it is computed.
 */
function withArticle(label: string): string {
  const article = /^[aeiou]/i.test(label) ? "an" : "a";
  return `${article} ${label}`;
}

function capitaliseFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * "A Facility Manager, an Auditor / Underwriter or a Platform Admin", in T-37
 * value order — which is the display order (`TAXONOMY.md` §5.7).
 */
function nameRoles(roles: readonly RoleCode[]): string {
  const named = roles.map((role) => withArticle(ROLE_LABELS[role]));
  if (named.length === 0) return "";

  const last = named[named.length - 1] ?? "";
  const leading = named.slice(0, -1);
  const sentence =
    leading.length === 0 ? last : `${leading.join(", ")} or ${last}`;
  return capitaliseFirst(sentence);
}

/** Every role that may reach and read a route, in T-37 order. */
export function rolesAllowedOn(route: AppRoute): readonly RoleCode[] {
  return ROLE_CODES.filter((role) => canReadRoute(role, route));
}

/** Every role that may perform a route's mutating actions, in T-37 order. */
export function rolesWritingOn(route: AppRoute): readonly RoleCode[] {
  return ROLE_CODES.filter((role) => canWriteRoute(role, route));
}

function governingRuleFor(route: AppRoute): string | null {
  const deniedRule = ROUTE_ACCESS[route].deniedRule;
  return deniedRule === undefined ? null : `Rule ${deniedRule}`;
}

/**
 * The copy for `SITE_ARCHITECTURE.md` §5.3(4) — a member of this organization
 * reached a route their role cannot open.
 *
 * Rendered as a toast on `/`, never as a 403 page: this is a single-tenant
 * internal tool and telling a colleague that a page exists but is not theirs is
 * correct. The toast fires on the destination, never on the page being left
 * (`UX_SPEC.md` §6.1).
 */
export function routeDenialMessage(
  role: RoleCode,
  route: AppRoute,
): RouteDenialMessage {
  const allowed = rolesAllowedOn(route);
  return {
    headline: `${APP_ROUTE_NAMES[route]} isn't available to the ${ROLE_LABELS[role]} role.`,
    remedy:
      allowed.length === 0
        ? "No role in this organization can open it."
        : `${nameRoles(allowed)} can open it.`,
    governingRule: governingRuleFor(route),
  };
}

/**
 * The copy for a refused **write** — Rules 1.16, 1.26, and
 * `TECHNICAL_SPEC.md` §7.1's returned error rather than a redirect.
 *
 * Separate from {@link routeDenialMessage} because the two are not the same
 * refusal: a role that holds `read` here reached the page legitimately, and
 * telling her the page "isn't available" when she is looking at it is the kind
 * of copy that teaches people the product is wrong about them.
 */
export function writeDenialMessage(
  role: RoleCode,
  route: AppRoute,
): RouteDenialMessage {
  const writers = rolesWritingOn(route);
  return {
    headline: `The ${ROLE_LABELS[role]} role can't make changes on ${APP_ROUTE_NAMES[route]}.`,
    remedy:
      writers.length === 0
        ? "No role in this organization can make this change."
        : `${nameRoles(writers)} can make this change.`,
    governingRule: governingRuleFor(route),
  };
}

/**
 * The one-string rendering, so a toast, an inline error and a Server Action
 * result all say the same thing in the same order.
 */
export function denialDescription(message: RouteDenialMessage): string {
  return message.governingRule === null
    ? message.remedy
    : `${message.remedy} ${message.governingRule}.`;
}

/** Headline and remedy as one sentence pair, for a boundary that carries a single string. */
export function denialSentence(message: RouteDenialMessage): string {
  return `${message.headline} ${denialDescription(message)}`;
}

/**
 * Validate a `?denied=` value against `APP_ROUTES`.
 *
 * The route travels in the URL because the toast fires on the destination and a
 * redirect carries nothing else. **The role does not travel with it** — the
 * layout resolves that server-side and hands it to the toast as a prop, because
 * a role in a query string is a role a reader can edit.
 */
export function deniedRouteFrom(
  value: string | null | undefined,
): AppRoute | null {
  if (value === null || value === undefined) return null;
  return (APP_ROUTES as readonly string[]).includes(value)
    ? (value as AppRoute)
    : null;
}

/**
 * Why a session ended, as it travels in `/sign-in?reason=`.
 *
 * Two values and no more. **Neither says which account, which organization or
 * which grant** — the reader of a sign-in page has proved nothing yet
 * (Rule 1.2).
 */
export const SESSION_END_REASONS = [
  "session_expired",
  "grant_expired",
] as const;

export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

export function isSessionEndReason(
  value: string | null | undefined,
): value is SessionEndReason {
  return (
    value !== null &&
    value !== undefined &&
    (SESSION_END_REASONS as readonly string[]).includes(value)
  );
}

export interface SessionEndMessage {
  readonly headline: string;
  readonly body: string;
}

/**
 * The `neutral` `Alert` above the sign-in form, per the guard's two lapse paths.
 *
 * `grant_expired` is what Rule 1.28 looks like from the outside: access ended
 * mid-session because a grant expired or a membership was revoked, and the
 * remedy names the roles that can issue a new one — read from `ROLE_LABELS`,
 * because a hand-written "an Admin" is a T-37 label written inline
 * (`TAXONOMY.md` §5.3).
 */
export const SESSION_END_MESSAGES: Readonly<
  Record<SessionEndReason, SessionEndMessage>
> = {
  session_expired: {
    headline: "You were signed out.",
    body: "Sign in again to pick up where you left off.",
  },
  grant_expired: {
    headline: "Your access to that organization has ended.",
    body: `A grant expired or was revoked. ${nameRoles([
      "facility_manager",
      "platform_admin",
    ])} can issue a new one.`,
  },
};
