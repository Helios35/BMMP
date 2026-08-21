import { StatusBadge } from "@/components/status/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Organization } from "@/types/tenancy";
import { formatAddressLine } from "../sites";
import { Field, FieldList, SettingsSection } from "./settings-primitives";

/**
 * §3.17 — the organization profile, read-only.
 *
 * **`handlerSizeClass` renders as a badge with no edit affordance for anyone**,
 * in this unit or any later one. It is set by rule evaluation against the
 * quantity on site and is **never typed by a user** (Rules 3.18–3.20) — a field
 * someone can type is a field someone can get wrong, and this one decides which
 * obligations apply.
 *
 * No **Save changes** control renders here. §3.17's primary action belongs to the
 * unit that writes; a Save with nothing behind it is a lie, and D-19 says these
 * field shapes are still being argued with.
 */

export const ORGANIZATION_PROFILE_SECTION_ID = "organization-profile";

export function OrganizationProfileCard({
  organization,
}: {
  readonly organization: Organization;
}) {
  return (
    <SettingsSection
      id={ORGANIZATION_PROFILE_SECTION_ID}
      title="Organization profile"
    >
      <Card>
        <CardContent>
          <FieldList>
            <Field label="Name" value={organization.name} />
            <Field label="Legal name" value={organization.legalName} />
            <Field
              label="Identifier in the URL"
              value={organization.slug}
              mono
            />
            <Field
              label="Handler identification"
              value={organization.handlerIdentifier}
              mono
            />
            <Field label="Handler size class">
              {/* T-15. Icon plus text plus colour, from the one statusIntent map. */}
              <StatusBadge
                system="handler_size_class"
                value={organization.handlerSizeClass}
              />
            </Field>
            <Field label="Time zone" value={organization.timeZone} mono />
            <Field
              label="Primary address"
              value={formatAddressLine(organization.primaryAddress)}
              span
            />
            {/* Null is not "missing" here: the column falls back to the primary
                address, so "Not recorded" would be false. */}
            <Field label="Mailing address" span>
              {organization.mailingAddress === null ? (
                <span className="text-body text-muted-foreground">
                  Same as the primary address.
                </span>
              ) : (
                formatAddressLine(organization.mailingAddress)
              )}
            </Field>
          </FieldList>
        </CardContent>
      </Card>
    </SettingsSection>
  );
}
