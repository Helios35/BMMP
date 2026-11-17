import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * Who may set a hazard ranking running — Rule 10.24; D-77 #6;
 * `TECHNICAL_SPEC.md` §9.5.
 *
 * **Rank now** is the Facility Manager's and the Admin's (P2, P6). Every role
 * reads a ranking; no role sets or changes a band or a position by hand, P6
 * included (T-33) — a run is the only writer, and Rank now only starts one.
 *
 * One map, read by the screen, the Server Action and the adapter, so a button
 * and the refusal behind it can never disagree.
 */

export const HAZARD_RANKING_ACTIONS = ["rank_now"] as const;

export type HazardRankingAction = (typeof HAZARD_RANKING_ACTIONS)[number];

const BY_ROLE: Readonly<
  Partial<Record<RoleCode, readonly HazardRankingAction[]>>
> = {
  facility_manager: ["rank_now"],
  platform_admin: ["rank_now"],
};

export function mayTakeHazardRankingAction(
  role: RoleCode,
  action: HazardRankingAction,
): boolean {
  return BY_ROLE[role]?.includes(action) ?? false;
}

/** The roles that may take an action — for "ask a … to do this" copy. */
export function rolesForHazardRankingAction(
  action: HazardRankingAction,
): readonly RoleCode[] {
  return (Object.keys(BY_ROLE) as RoleCode[]).filter((role) =>
    mayTakeHazardRankingAction(role, action),
  );
}
