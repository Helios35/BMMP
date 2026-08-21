import Link from "next/link";
import type { ReactElement } from "react";
import { SquarePen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  controlTreatment,
  controlTreatmentReason,
} from "@/domain/access/control-treatment";
import { capabilityFor } from "@/domain/access/route-capability";
import type { RoleCode } from "@/domain/taxonomy/role";
import type { Uuid } from "@/types/common";
import { DisabledEditEntryButton } from "./disabled-edit-entry-button";

/**
 * **Edit this entry** — the one control on `/catalog/[id]`, and the one place
 * two documents disagree.
 *
 * `UX_SPEC.md` §3.16 says *"No edit affordance renders for non-P6 roles."* §5
 * E-8a says an auditor's mutating controls **render disabled with a stated
 * reason**, because a control she cannot see is a control she cannot assess.
 * P5 is a non-P6 role, so both cannot hold. **This is built to E-8a for P5 and
 * to §3.16 for everyone else** — which is exactly E-8's own rule, *disabled for
 * the auditor, absent for the colleague* — and the contradiction is reported for
 * a one-sentence amendment to §3.16 rather than resolved quietly here.
 *
 * | Role | Treatment |
 * |---|---|
 * | `platform_admin` | enabled, to `/settings/catalog?entry=<id>` |
 * | `auditor` | rendered disabled, with the reason, beneath `ReadOnlyBanner` |
 * | P1–P4 | absent — not in the DOM, and no banner |
 *
 * **The capability read is the capability on the route the control leads to.**
 * Editing happens on `/settings/catalog`, which is P6's; asking about
 * `/catalog/[id]` would say `read` for everyone and render the control for
 * nobody. One map, and the control and the destination cannot disagree
 * (`SITE_ARCHITECTURE.md` §7.2).
 */

export const EDIT_ENTRY_LABEL = "Edit this entry";

/** Unit 03's page. The link is correct against the map now (§1.6). */
const EDIT_ENTRY_ROUTE = "/settings/catalog";

export interface EditEntryControlProps {
  readonly role: RoleCode;
  readonly entryId: Uuid;
}

export function EditEntryControl({
  role,
  entryId,
}: EditEntryControlProps): ReactElement | null {
  const treatment = controlTreatment({
    role,
    capability: capabilityFor(role, EDIT_ENTRY_ROUTE),
    // Editing an entry is not a void, a delete or a revoke. An auditor is shown
    // it disabled; a destructive control she would be shown not at all.
    isDestructive: false,
    isExportOrPrint: false,
  });

  if (treatment === "absent") return null;

  if (treatment === "disabled_with_reason") {
    const reason = controlTreatmentReason(treatment);
    if (reason === null) return null;
    return <DisabledEditEntryButton reason={reason} label={EDIT_ENTRY_LABEL} />;
  }

  return (
    <Button asChild size="lg" className="min-h-11 rounded-md">
      <Link
        href={`${EDIT_ENTRY_ROUTE}?entry=${encodeURIComponent(entryId)}`}
        data-mutating="true"
      >
        <SquarePen aria-hidden="true" />
        {EDIT_ENTRY_LABEL}
      </Link>
    </Button>
  );
}
