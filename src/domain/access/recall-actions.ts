import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * Who may act on a record's recalls — Rules 6.23, 6.24, 10.10, 10.14–10.16;
 * D-73 #4; `TECHNICAL_SPEC.md` §9.5.
 *
 * `/batteries/[id]` is read-only for P2 (`SITE_ARCHITECTURE.md` §5.2), and P2
 * may still confirm a possible match, record a recall by hand and press
 * **Check now** — recording a recall increases handling restrictions, the safe
 * direction to let the person who receives the notice move in quickly (Rule
 * 6.23). Removing one is held to a stricter bar: dismissing a possible match
 * and withdrawing a confirmed one are P1's and P6's, with a reason (Rule
 * 6.24). **P5 may do none of these**, and neither may P3 or P4.
 *
 * One map, read by the screen, the Server Actions and the adapter, so a button
 * and the refusal behind it can never disagree.
 */

export const RECALL_ACTIONS = [
  "check_now",
  "confirm",
  "dismiss",
  "withdraw",
  "record",
] as const;

export type RecallAction = (typeof RECALL_ACTIONS)[number];

const BY_ROLE: Readonly<Partial<Record<RoleCode, readonly RecallAction[]>>> = {
  compliance_handler: [...RECALL_ACTIONS],
  facility_manager: ["check_now", "confirm", "record"],
  platform_admin: [...RECALL_ACTIONS],
};

export function mayTakeRecallAction(
  role: RoleCode,
  action: RecallAction,
): boolean {
  return BY_ROLE[role]?.includes(action) ?? false;
}

/** The roles that may take an action — for "ask a … to do this" copy. */
export function rolesForRecallAction(
  action: RecallAction,
): readonly RoleCode[] {
  return (Object.keys(BY_ROLE) as RoleCode[]).filter((role) =>
    mayTakeRecallAction(role, action),
  );
}
