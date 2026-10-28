import type { RoleCode } from "@/domain/taxonomy/role";

import type { AppRoute } from "./routes";
import { canReadRoute } from "./route-capability";

/**
 * Who may export a list — `SITE_ARCHITECTURE.md` §5.2; `UX_SPEC.md` §3.5,
 * §3.8b, §3.11, §3.20; D-50.
 *
 * **Export is P2's, P5's and P6's**, on each list one of them can read: §5.2
 * says so for `/batteries` and `/audit`, and §3.11 for `/shipments`. P1 reads
 * those lists and does not take a copy of them. `/review` is read by P2 and
 * P6 only (P5 cannot reach it), so its export is theirs. One table, read by
 * the button and by the route handler, so a button and the refusal behind it
 * cannot disagree — and an export never holds a record from a list the
 * requester could not open (Rule 12.17).
 */
const EXPORTING_ROLES: readonly RoleCode[] = [
  "facility_manager",
  "auditor",
  "platform_admin",
];

/** The lists a CSV export exists for. */
export type ExportableList = Extract<
  AppRoute,
  "/audit" | "/batteries" | "/shipments" | "/review"
>;

export function mayExportList(role: RoleCode, list: ExportableList): boolean {
  return EXPORTING_ROLES.includes(role) && canReadRoute(role, list);
}
