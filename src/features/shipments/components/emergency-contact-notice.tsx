import Link from "next/link";
import type { ReactElement } from "react";
import { CircleAlert } from "lucide-react";

import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { canReadRoute } from "@/domain/access/route-capability";
import type { RoleCode } from "@/domain/taxonomy/role";
import { emergencyContactSettingsHref } from "@/features/settings/return-to";
import { cn } from "@/lib/utils";

import {
  E11_ASK_WHO,
  E11_BODY,
  E11_SET_IT_NOW,
  E11_TITLE,
} from "../shipment-copy";

/**
 * E-11 — the 24-hour emergency contact number is not in force
 * (`UX_SPEC.md` E-11; Rules 5.6, 5.7; D-32).
 *
 * An `attention` `Alert`, one state for missing, never verified and lapsed.
 * A role that can reach `/settings/organization` (P2, P6 — the route map
 * decides, not this file) gets **Set it now**, which carries `returnTo` so a
 * recorded verification lands them back on the draft they left. **Every other
 * role is told who can** — never a link the guard would turn them away from.
 *
 * `role="status"`, not `alert`: a standing condition announced politely, the
 * same register as the settings page's own E-11 alert.
 */
export function EmergencyContactNotice({
  role,
  returnTo,
}: {
  readonly role: RoleCode;
  /** The draft this notice sits on — step 3, or the shipment page. */
  readonly returnTo: string;
}): ReactElement {
  const canSet = canReadRoute(role, "/settings/organization");
  return (
    <Alert
      role="status"
      data-e11-notice={canSet ? "set-it-now" : "ask"}
      className={cn(INTENT_SURFACE_CLASSES.attention, "gap-2 px-4 py-4")}
    >
      <CircleAlert aria-hidden="true" className="size-5" />
      <AlertTitle className="text-body-strong text-balance">
        {E11_TITLE}
      </AlertTitle>
      <AlertDescription className="grid gap-3 text-body text-current">
        <p className="max-w-[72ch]">{E11_BODY}</p>
        {canSet ? (
          <div>
            <Button
              asChild
              variant="outline"
              size="lg"
              className={ACTION_BUTTON_CLASS}
            >
              <Link
                href={emergencyContactSettingsHref(returnTo)}
                data-e11-set-it-now="true"
              >
                {E11_SET_IT_NOW}
              </Link>
            </Button>
          </div>
        ) : (
          <p className="max-w-[72ch]" data-e11-ask="true">
            {E11_ASK_WHO}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
