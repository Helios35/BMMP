import { Card, CardContent } from "@/components/ui/card";
import {
  CLOCK_METHOD_NOT_INFERRED,
  CLOCK_METHOD_NOT_RECORDED,
  CLOCK_METHOD_REMEDY,
} from "../copy";
import { formatAddressLine, type OrganizationSite } from "../sites";
import { Field, FieldList, SettingsSection } from "./settings-primitives";

/**
 * §3.17, Rules 4.2, 4.3 — the clock demonstration method, **per site**.
 *
 * Recorded per site with its effective date and included in every audit and
 * evidence export. **No column holds it yet**, so every site reads
 * `Not recorded` and the screen says who records it.
 *
 * **It is never inferred.** The fixtures have container-marking evidence lying
 * around — a container label exists, and every storage clock hangs off a
 * container — and inferring a compliance fact from adjacent data is precisely
 * what this product forbids. A method the system guessed is a method nobody
 * demonstrated.
 *
 * Per site rather than per organization, for the same reason the jurisdiction
 * profile is: two sites can demonstrate differently, and one org-wide field can
 * only ever hold one of the two answers.
 */

export const CLOCK_METHOD_SECTION_ID = "clock-demonstration-method";

export function ClockMethodCard({
  sites,
}: {
  readonly sites: readonly OrganizationSite[];
}) {
  return (
    <SettingsSection
      id={CLOCK_METHOD_SECTION_ID}
      title="Clock demonstration method"
      description="How each site demonstrates when its accumulation clock started, recorded with the date it took effect and included in every audit and evidence export."
    >
      <Card>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-4">
            {sites.map((site) => (
              <li key={site.key} data-site-key={site.key}>
                <FieldList>
                  <Field
                    label="Site"
                    value={formatAddressLine(site.address)}
                    span
                  />
                  <Field label="Method">
                    <span
                      className="text-body text-muted-foreground"
                      data-clock-method="not-recorded"
                    >
                      {CLOCK_METHOD_NOT_RECORDED}
                    </span>
                  </Field>
                  <Field label="Effective from" value={null} />
                </FieldList>
              </li>
            ))}
          </ul>

          <p className="max-w-[72ch] text-body text-muted-foreground">
            {CLOCK_METHOD_REMEDY} {CLOCK_METHOD_NOT_INFERRED}
          </p>
        </CardContent>
      </Card>
    </SettingsSection>
  );
}
