import { ROUTE_ACCESS } from "@/domain/access/route-capability";
import { ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/domain/taxonomy/role";
import { roleCapabilitySummary } from "./role-capability-summary";

/**
 * The rules the `/settings/users` write paths must carry, expressed now so the
 * unit that builds them implements the same thing — `UX_SPEC.md` §3.18,
 * Rules 1.11, 1.12, 1.13, 1.26; D-35.
 *
 * **This unit renders the route read-only** (D-19: the field shapes are still
 * being argued with, and a Save with no action behind it is a lie). Every
 * mutating control is **absent**, not disabled — P5 cannot reach this route and
 * every role that can reach it holds `write`, so a disabled control here would
 * be disabled for a reason that is not a permission, which `UX_SPEC.md` §2.9's
 * decision table does not admit.
 *
 * What is captured here is the part that would otherwise have to be rediscovered:
 * the predicates, the copy and the reasons. Each is unit-tested against
 * `ROUTE_ACCESS` and `ROLE_CODES` today.
 */

// --- Rule 1.11 — no user changes their own role -----------------------------

/**
 * The role control is **absent** on the actor's own row, never disabled.
 *
 * Rule 1.11 is not a permission she might later be granted — it is a property of
 * the act — so there is nothing for a disabled state to explain. A person who
 * needs their own role changed asks another holder, which is what the copy says.
 */
export function canChangeRoleOf(
  actorUserId: string,
  subjectUserId: string | null,
): boolean {
  return subjectUserId !== actorUserId;
}

export const OWN_ROLE_UNCHANGEABLE_NOTE =
  "No one changes their own role. Another member with access to this page can change it for you.";

// --- Only P6 grants or revokes P6 -------------------------------------------

export interface RoleOption {
  readonly role: RoleCode;
  readonly label: string;
  /** The plain-language capability line, computed from `ROUTE_ACCESS`. */
  readonly description: string;
  /**
   * `true` renders the option **disabled inside the `Select`, with the reason
   * visible** — Rule 1.26: a silently disabled control is a defect.
   */
  readonly isDisabled: boolean;
  readonly disabledReason?: string;
}

/**
 * The reason a Facility Manager cannot hand out the platform role.
 *
 * The label comes from `ROLE_LABELS`; a T-37 label written inline is a defect
 * even when it happens to match (`TAXONOMY.md` §5.3).
 */
export const PLATFORM_ROLE_GRANT_REASON = `Only a ${ROLE_LABELS.platform_admin} can grant the ${ROLE_LABELS.platform_admin} role.`;

/**
 * Every role, in T-37's declared order — which is the display order
 * (`TAXONOMY.md` §5.7) — with the ones this actor cannot grant marked.
 *
 * **Marked, not removed.** `ROUTE_ACCESS["/settings/users"].note` fixes the
 * rule; hiding the option would leave a Facility Manager wondering where the
 * role went, and Rule 1.26 wants the reason stated.
 */
export function roleOptionsFor(actorRole: RoleCode): readonly RoleOption[] {
  const actorMayGrantPlatformRole = actorRole === "platform_admin";

  return ROLE_CODES.map((role) => {
    const isDisabled = role === "platform_admin" && !actorMayGrantPlatformRole;
    return {
      role,
      label: ROLE_LABELS[role],
      description: roleCapabilitySummary(role).sentence,
      isDisabled,
      ...(isDisabled ? { disabledReason: PLATFORM_ROLE_GRANT_REASON } : {}),
    } satisfies RoleOption;
  });
}

/** The map row the rule is read from, so the copy and the guard cannot disagree. */
export const SETTINGS_USERS_ACCESS_NOTE =
  ROUTE_ACCESS["/settings/users"].note ?? "";

// --- Rule 1.13 — deactivated, never deleted ---------------------------------

/** The control says this. It never says "Delete". */
export const DEACTIVATE_CONTROL_LABEL = "Deactivate";

export const DEACTIVATE_CONFIRMATION_BODY =
  "Their name stays attached to every record and audit event they created, permanently. Deactivating ends their access; it removes nothing they did.";

// --- Rule 1.12 / D-35 — the last binding-authority holder --------------------

/**
 * The block the write path will render, authored once, here.
 *
 * D-35 is explicit that **the UI names the remedy rather than only refusing**,
 * so the second line is a requirement rather than a courtesy. The role names come
 * from `ROLE_LABELS`.
 */
export const LAST_BINDING_AUTHORITY_HEADLINE =
  "This is the organization's only member with binding authority.";

export const LAST_BINDING_AUTHORITY_REMEDY = `Assign binding authority to another ${ROLE_LABELS.facility_manager} first, then change this one. A current holder, or a ${ROLE_LABELS.platform_admin} under a recorded support grant, can assign it.`;

// --- D-31, Rule 1.15 — grants always expire ---------------------------------

export const GRANT_ALWAYS_EXPIRES_NOTE =
  "Every access grant carries a stated scope and an end date. There is no indefinite option, and an expiry ends access inside a session that is already open.";
