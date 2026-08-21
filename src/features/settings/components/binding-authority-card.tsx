import { CircleAlert, Info } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { NO_BINDING_AUTHORITY_REMEDY } from "@/domain/consent/binding-authority";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import { cn } from "@/lib/utils";
import {
  LAST_BINDING_AUTHORITY_HEADLINE,
  LAST_BINDING_AUTHORITY_REMEDY,
} from "../member-rules";
import type { MemberRow } from "../read-members";
import { SettingsSection } from "./settings-primitives";

/**
 * §3.18, D-35, Rules 1.12, 7.3 — who may accept on the organization's behalf.
 *
 * **Binding authority is an attribute of a membership, not a role of its own.**
 * An organization has several Facility Managers and only some of them can sign,
 * which a seventh role could not express without duplicating the other six.
 *
 * **An organization always retains at least one holder** (Rule 1.12). That is a
 * partial unique index in the schema rather than a check in a form — but the
 * copy still has to exist, because **the UI names the remedy rather than only
 * refusing** (D-35). Both remedies are authored here and unit-tested, so the
 * unit that builds the write path renders the same sentences rather than writing
 * them a second time.
 *
 * **P6 never holds it**, under any grant: a platform admin accepting a
 * customer's terms is not consent (Rules 1.19, 7.4).
 */

export const BINDING_AUTHORITY_SECTION_ID = "binding-authority";

export function BindingAuthorityCard({
  holders,
}: {
  readonly holders: readonly MemberRow[];
}) {
  return (
    <SettingsSection
      id={BINDING_AUTHORITY_SECTION_ID}
      title="Binding authority"
      description={`Who can accept the Terms of Service on this organization's behalf. It is held by a ${ROLE_LABELS.facility_manager} membership, assigned as its own recorded act.`}
    >
      <Card>
        <CardContent className="flex flex-col gap-4">
          {holders.length === 0 ? (
            <Alert
              role="status"
              data-binding-authority-state="none"
              className={cn(
                INTENT_SURFACE_CLASSES.attention,
                "gap-2 px-4 py-4",
              )}
            >
              <CircleAlert aria-hidden="true" className="size-5" />
              <AlertTitle className="text-body-strong">
                No one currently holds binding authority.
              </AlertTitle>
              <AlertDescription className="max-w-[72ch] text-body text-current">
                {NO_BINDING_AUTHORITY_REMEDY}
              </AlertDescription>
            </Alert>
          ) : (
            <ul
              className="flex flex-col gap-2"
              data-holder-count={holders.length}
            >
              {holders.map((holder) => (
                <li
                  key={holder.membership.id}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                >
                  <span className="text-body-strong break-words">
                    {holder.displayName}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {ROLE_LABELS[holder.membership.role]}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {holders.length === 1 ? (
            <Alert
              role="status"
              data-binding-authority-state="last-holder"
              className={cn(
                "gap-2 border px-4 py-4",
                INTENT_SURFACE_CLASSES.neutral,
              )}
            >
              <Info aria-hidden="true" className="size-5" />
              <AlertTitle className="text-body-strong">
                {LAST_BINDING_AUTHORITY_HEADLINE}
              </AlertTitle>
              <AlertDescription className="max-w-[72ch] text-body text-current">
                {LAST_BINDING_AUTHORITY_REMEDY}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </SettingsSection>
  );
}
