import { ROLE_LABELS, type RoleCode } from "@/domain/taxonomy/role";

/**
 * Who may accept the Terms of Service on an organization's behalf — Rules 7.3,
 * 7.4, 1.19; D-35.
 */

export interface BindingAuthorityCandidate {
  /** T-37. Role lives on the membership, never on the user (Rules 1.4, 1.5). */
  readonly role: RoleCode;
  /** D-35 — binding authority is an attribute of a P2 membership, assigned as its own act. */
  readonly holdsBindingAuthority: boolean;
  /** `user.is_platform_admin` resolved for the active organization. */
  readonly isPlatformAdmin: boolean;
}

/**
 * **`isPlatformAdmin` returns false first and unconditionally.**
 *
 * P6 can never accept the Terms of Service on a tenant's behalf, under any
 * circumstance, including under a recorded support grant — a platform admin
 * accepting a customer's terms is not consent (Rules 1.19, 7.4). The mock
 * already refuses `tosAcceptances.setStatus` for P6
 * (`src/data/mock/index.ts`); this is the UI-side half of the same rule, and
 * **neither is the only enforcement.**
 *
 * P1, P3 and P4 are false because the role check fails (Rule 7.3). P5 is false
 * for the same reason and additionally holds `write` on no route at all
 * (`auditorHoldsNoWrite()`, Rule 1.14).
 */
export function canAcceptTerms(candidate: BindingAuthorityCandidate): boolean {
  if (candidate.isPlatformAdmin) return false;
  return (
    candidate.role === "facility_manager" && candidate.holdsBindingAuthority
  );
}

/**
 * The remedy when nobody holds it — D-35's *"the UI names the remedy rather than
 * only refusing."*
 *
 * Rule 1.12 says an organization must retain at least one active holder at all
 * times, so an organization with none is a data defect rather than a normal
 * state. The copy still has to exist: refusing without naming a way forward
 * leaves the reader stuck, and Rule 1.26 is explicit that a denial states its
 * remedy.
 *
 * **It names Platform Admin rather than "an Admin"** — D-35 makes binding
 * authority assignable by a current holder or by P6, and with no current holder
 * P6 is the only remaining path. The label comes from `ROLE_LABELS`, because a
 * T-37 label written inline is a defect even when it happens to match
 * (`TAXONOMY.md` §5.3).
 */
export const NO_BINDING_AUTHORITY_REMEDY = `No one in this organization currently holds the authority to accept. Ask a ${ROLE_LABELS.platform_admin} to assign it.`;
