import { CircleAlert, ShieldCheck } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import type { TimeZone } from "@/types/common";
import { cn } from "@/lib/utils";
import {
  EMERGENCY_NO_NUMBER,
  EMERGENCY_UNVERIFIED_BODY,
  EMERGENCY_UNVERIFIED_HEADLINE,
  EMERGENCY_UNVERIFIED_REMEDY,
} from "../copy";
import type { EmergencyContactView } from "../read-organization-settings";
import {
  Field,
  FieldList,
  SettingsSection,
  ZonedDate,
} from "./settings-primitives";

/**
 * §3.17, D-32, Rules 5.6, 5.7 — the 24-hour emergency contact number and its
 * verification.
 *
 * **A lapsed verification is treated exactly as an absent one.** One state, one
 * alert, one sentence, one consequence — whether the number was never verified,
 * was verified and has since lapsed, or carries no interval to measure against.
 * A distinct "expired" treatment is a defect (D-32), so the alert below is
 * rendered from `isInForce` alone and never from the reason.
 *
 * **The re-verification interval is never printed as a literal.** It is
 * organization configuration with a platform default; where the effective
 * interval is unknown the lapse date renders as nothing at all — not a duration,
 * not "in a year". A number typed into a component here is the same defect class
 * as a hard-coded jurisdiction threshold (Rule 1.23).
 *
 * **No "Verify this number" control renders in this unit.** Verification is a
 * recorded act with a date and a person (Rule 5.6); the unit that writes it adds
 * the control.
 */

export const EMERGENCY_CONTACT_SECTION_ID = "emergency-contact";

export function EmergencyContactUnverifiedAlert({
  contact,
  className,
}: {
  readonly contact: EmergencyContactView;
  readonly className?: string;
}) {
  if (contact.isInForce) return null;

  return (
    <Alert
      // A standing condition the reader has to act on, not an error that just
      // happened — `status`, announced politely on arrival (§G7).
      role="status"
      data-emergency-verification="not-in-force"
      className={cn(
        INTENT_SURFACE_CLASSES.attention,
        "gap-2 px-4 py-4 text-body",
        className,
      )}
    >
      {/* Icon plus text plus colour. Colour is never the only signal. */}
      <CircleAlert aria-hidden="true" className="size-5" />
      <AlertTitle className="text-body-strong">
        {EMERGENCY_UNVERIFIED_HEADLINE}
      </AlertTitle>
      <AlertDescription className="grid gap-2 text-body text-current">
        <p className="max-w-[72ch]">{EMERGENCY_UNVERIFIED_BODY}</p>
        <p className="max-w-[72ch]">{EMERGENCY_UNVERIFIED_REMEDY}</p>
      </AlertDescription>
    </Alert>
  );
}

export function EmergencyContactCard({
  contact,
  timeZone,
}: {
  readonly contact: EmergencyContactView;
  readonly timeZone: TimeZone;
}) {
  return (
    <SettingsSection
      id={EMERGENCY_CONTACT_SECTION_ID}
      title="24-hour emergency contact"
      description="The number and the emergency response information reference that go on a shipping paper, and the record of the verification behind them."
    >
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FieldList>
            <Field label="Emergency contact number">
              {contact.phone === null || contact.phone.trim() === "" ? (
                <span className="text-body text-muted-foreground">
                  {EMERGENCY_NO_NUMBER}
                </span>
              ) : (
                <span className="text-mono">{contact.phone}</span>
              )}
            </Field>
            <Field
              label="Emergency response information reference"
              value={contact.contractRef}
              mono
            />

            {/* The facts of the recorded act. These are data, not a second
                treatment: the alert above is identical however this reads. */}
            <Field label="Verification">
              <span
                className="inline-flex items-center gap-2"
                data-verification-state={
                  contact.isInForce ? "in-force" : "not-in-force"
                }
              >
                {contact.isInForce ? (
                  <ShieldCheck aria-hidden="true" className="size-4" />
                ) : (
                  <CircleAlert aria-hidden="true" className="size-4" />
                )}
                {contact.isInForce ? "In force" : "Not in force"}
              </span>
            </Field>
            <Field label="Verified by" value={contact.verifiedByName} />
            <Field label="Verified on">
              {contact.verifiedAt === null ? (
                <span className="text-body text-muted-foreground">
                  Never verified.
                </span>
              ) : (
                <ZonedDate instant={contact.verifiedAt} timeZone={timeZone} />
              )}
            </Field>
            <Field label={contact.isInForce ? "Lapses on" : "Lapsed on"}>
              {contact.lapsesAt === null ? (
                // Rule 1.23. The interval is unknown, so there is no date — and
                // a component does not supply one of its own.
                <span className="text-body text-muted-foreground">
                  No re-verification interval is configured, so no date is
                  shown.
                </span>
              ) : (
                <ZonedDate instant={contact.lapsesAt} timeZone={timeZone} />
              )}
            </Field>
          </FieldList>
        </CardContent>
      </Card>
    </SettingsSection>
  );
}
