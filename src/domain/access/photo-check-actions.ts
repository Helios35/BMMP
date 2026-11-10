import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * Who may do what with the photo checks — Rules 2.36, 6.2, 6.25; D-75 #2;
 * `SITE_ARCHITECTURE.md` §5.2.
 *
 * - **Run a check** — the act that sets one running: storing a photo, picking
 *   a catalog entry, a read. Those are `/batteries/new` and `/batteries/[id]`
 *   writes, P1 and P6 (Rule 2.22); the run itself is the system step's
 *   (Rule 12.5).
 * - **Decide a proposal** — accept or reject an AI-suggested finding. The
 *   people who confirm a condition: P1 and P6 (Rules 6.2, 6.6).
 * - **Set a reference photo** — P6 only, on `/settings/catalog?entry=`
 *   (D-75 #2). A reference is a platform photo, never a tenant's (D-75 #1).
 *
 * P5 holds none of them, on any surface (Rule 1.16).
 */

export const PHOTO_CHECK_ACTIONS = [
  "run_check",
  "decide_proposal",
  "set_reference_photo",
] as const;

export type PhotoCheckAction = (typeof PHOTO_CHECK_ACTIONS)[number];

const BY_ROLE: Readonly<
  Partial<Record<RoleCode, readonly PhotoCheckAction[]>>
> = {
  compliance_handler: ["run_check", "decide_proposal"],
  platform_admin: [...PHOTO_CHECK_ACTIONS],
};

export function mayTakePhotoCheckAction(
  role: RoleCode,
  action: PhotoCheckAction,
): boolean {
  return BY_ROLE[role]?.includes(action) ?? false;
}

export function rolesForPhotoCheckAction(
  action: PhotoCheckAction,
): readonly RoleCode[] {
  return (Object.keys(BY_ROLE) as RoleCode[]).filter((role) =>
    mayTakePhotoCheckAction(role, action),
  );
}
