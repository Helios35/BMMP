import { canWrite, type Capability } from "@/domain/access/capability";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * Whether a control renders, renders disabled with a reason, or is not there at
 * all — `UX_SPEC.md` §2.9's decision table, as a function.
 *
 * **Disabled for the auditor, absent for the colleague.** A disabled control
 * tells a colleague she is missing a permission; an absent one tells her this is
 * not her job. Both are honest, and which is correct depends entirely on why the
 * person is on the screen — P5 is on it to inspect, and a screen that hides its
 * controls from her hides what the organization can do, which is the thing she
 * came to assess.
 *
 * **`/review` is not this function's table** (E-8b): P2's view there is composed
 * for her question rather than being a disabled copy of P1's, and unit 03 owns
 * it. Generalising this to cover it would blur the distinction the two edge
 * cases exist to keep.
 */
export const CONTROL_TREATMENTS = [
  "enabled",
  "disabled_with_reason",
  "absent",
] as const;

export type ControlTreatment = (typeof CONTROL_TREATMENTS)[number];

/**
 * The stated reason on a control disabled for the read-only role.
 *
 * One string, because Rule 1.26 requires the reason and a reason written per
 * button is a reason that drifts per button.
 */
export const AUDITOR_READ_ONLY_REASON = "Read-only access — Auditor role.";

export interface ControlTreatmentInput {
  readonly role: RoleCode;
  /** This role's capability on the route the control sits on. */
  readonly capability: Capability;
  /** Void, delete, revoke, remove — anything with no undo. */
  readonly isDestructive: boolean;
  /**
   * Print, download or export. **Rule 5.27 — never disabled, for any role**, and
   * checked before everything else because the read-only role is exactly the one
   * who came to take a copy away.
   */
  readonly isExportOrPrint: boolean;
}

export function controlTreatment(
  input: ControlTreatmentInput,
): ControlTreatment {
  if (input.isExportOrPrint) return "enabled";
  if (canWrite(input.capability)) return "enabled";
  if (input.role === "auditor") {
    // Rule 1.14 — read-only, externally, everywhere, always. A destructive
    // control shown greyed out to an auditor invites the question "who can?",
    // which on a void or a delete is not a question the screen should raise.
    return input.isDestructive ? "absent" : "disabled_with_reason";
  }
  return "absent";
}

/**
 * The reason string for a treatment, or null where none is shown.
 *
 * **Never the only enforcement.** Every mutating Server Action re-checks the
 * role and rejects, the mock's policy matrix refuses underneath that, and RLS
 * refuses underneath that again (`SITE_ARCHITECTURE.md` §5.3(6), §5.3(9)). A
 * disabled button is a courtesy, never a control.
 */
export function controlTreatmentReason(
  treatment: ControlTreatment,
): string | null {
  return treatment === "disabled_with_reason" ? AUDITOR_READ_ONLY_REASON : null;
}

/**
 * Whether the read-only banner belongs on this route.
 *
 * `UX_SPEC.md` §2.9 — P5's, and **explicitly not P2's on `/review`.** It renders
 * where the role is the auditor and the route carries at least one mutating
 * control for someone; a banner on a page nobody can change says nothing.
 */
export function showsReadOnlyBanner(input: {
  readonly role: RoleCode;
  readonly routeHasMutatingControls: boolean;
}): boolean {
  return input.role === "auditor" && input.routeHasMutatingControls;
}
