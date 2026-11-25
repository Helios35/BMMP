import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * Who may act on producer obligations — Rules 8.12, 8.15; `SITE_ARCHITECTURE.md`
 * §5.2; `TECHNICAL_SPEC.md` §9.5 (`W_PRODUCER` ∨ `PA`).
 *
 * P3 and P6 change products and states, run **Check now**, and mark or reopen
 * deadlines. P2 reads; P5 reads inside an unexpired grant and exports where
 * the grant allows (Rule 1.15); P1 and P4 have no obligations page. **No
 * role sets an obligation's status by hand** — a run is its only writer
 * (T-68).
 *
 * One map, read by the screen, the Server Action and the adapter, so a button
 * and the refusal behind it can never disagree.
 */

export const PRODUCER_ACTIONS = [
  "manage_products",
  "check_now",
  "mark_deadline",
  "export_obligations",
  /** Rules 8.17, 8.22 — P3 and P6 record sales. */
  "record_sales",
  /** Rules 8.19, 8.22 — P3 and P6 make and issue packets. */
  "make_packets",
] as const;

export type ProducerAction = (typeof PRODUCER_ACTIONS)[number];

const BY_ROLE: Readonly<Partial<Record<RoleCode, readonly ProducerAction[]>>> =
  {
    producer_compliance_officer: [
      "manage_products",
      "check_now",
      "mark_deadline",
      "export_obligations",
      "record_sales",
      "make_packets",
    ],
    platform_admin: [
      "manage_products",
      "check_now",
      "mark_deadline",
      "export_obligations",
      "record_sales",
      "make_packets",
    ],
    facility_manager: ["export_obligations"],
    auditor: ["export_obligations"],
  };

export function mayTakeProducerAction(
  role: RoleCode,
  action: ProducerAction,
): boolean {
  return BY_ROLE[role]?.includes(action) ?? false;
}

/** The roles that may take an action — for "ask a … to do this" copy. */
export function rolesForProducerAction(
  action: ProducerAction,
): readonly RoleCode[] {
  return (Object.keys(BY_ROLE) as RoleCode[]).filter((role) =>
    mayTakeProducerAction(role, action),
  );
}
