import { StatusBadge } from "@/components/status/status-badge";
import {
  IntakeBlockedNotice,
  IntakeGraceNotice,
} from "@/features/consent/components/intake-blocked-notice";
import type { IntakeGateView } from "@/features/consent/read-intake-gate";
import type { TimeZone } from "@/types/common";
import { SectionCard } from "@/components/page";
import { TOS_PRIOR_VERSION_NOTE } from "../copy";
import type { ConsentRow } from "../read-organization-settings";
import {
  CalendarDay,
  Field,
  FieldList,
  SettingsSection,
  ZonedDate,
} from "./settings-primitives";

/**
 * §3.17, §3.18's neighbour, Rules 7.1–7.18 — the Terms of Service state.
 *
 * Three states, and the first two reuse the components `/batteries/new` already
 * renders rather than authoring a second copy of the same sentences. Two
 * surfaces that say different things about why intake is closed is exactly the
 * drift a shared component prevents.
 *
 * - **Blocked** (`not_accepted`, `lapsed`, `revoked`, or an acceptance without
 *   the training-rights grant): the E-12 block, naming **who in this
 *   organization can accept it**. **P6 can never accept on a tenant's behalf,
 *   under any circumstance including a recorded support grant** (Rules 1.19,
 *   7.4) — so for a platform admin the block names the tenant's own members and
 *   offers no control. `canAcceptTerms` returns false for P6 first and
 *   unconditionally, and the mock refuses `tosAcceptances.setStatus` for P6
 *   underneath that.
 * - **Grace**: a neutral banner with the deadline, which **must not imply that
 *   accepting now covers records already captured** (Rules 7.13, 7.15).
 * - **In force**: renders plainly. No alert, because nothing is wrong.
 *
 * Rules 7.6 and 7.7 are worth stating here and not in copy: a record captured
 * while no acceptance was in force is **permanently** not training-eligible, and
 * no later acceptance reverses it. Nothing on this screen may suggest otherwise.
 *
 * **No Accept control renders in this unit.** Accepting is a write, and the
 * write paths on this route belong to a later unit.
 */

export const TERMS_SECTION_ID = "terms-of-service";

/** Unaccepted rows first — they are the live ones — then newest acceptance first. */
function consentOrder(a: ConsentRow, b: ConsentRow): number {
  const left = a.acceptance.acceptedAt;
  const right = b.acceptance.acceptedAt;
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left < right ? 1 : left > right ? -1 : 0;
}

export function TermsOfServiceCard({
  consent,
  gate,
  timeZone,
}: {
  readonly consent: readonly ConsentRow[];
  readonly gate: IntakeGateView;
  readonly timeZone: TimeZone;
}) {
  const rows = [...consent].sort(consentOrder);

  return (
    <SettingsSection
      id={TERMS_SECTION_ID}
      title="Terms of Service"
      description="Which version this organization accepted, who accepted it and when. Every accepted version is retained, because it governs the records captured under it."
    >
      {gate.status === "blocked" ? (
        <IntakeBlockedNotice
          gate={gate}
          // Already on the page the block would link to.
          canReachOrganizationSettings={false}
        />
      ) : null}
      <IntakeGraceNotice gate={gate} />

      <SectionCard>
        {rows.length === 0 ? (
          <p className="text-body text-muted-foreground">
            No Terms of Service record exists for this organization.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map(({ acceptance, acceptedByName }) => (
              <li
                key={acceptance.id}
                data-tos-status={acceptance.status}
                className="rounded-md border border-border p-4"
              >
                <FieldList>
                  <Field label="Status">
                    {/* T-47. `not_accepted` is a real value, not an absent row. */}
                    <StatusBadge
                      system="tos_acceptance_status"
                      value={acceptance.status}
                    />
                  </Field>
                  <Field
                    label="Version"
                    value={acceptance.documentVersion}
                    mono
                  />
                  <Field label="Accepted by" value={acceptedByName} />
                  <Field label="Accepted on">
                    {acceptance.acceptedAt === null ? (
                      <span className="text-body text-muted-foreground">
                        Not accepted.
                      </span>
                    ) : (
                      <ZonedDate
                        instant={acceptance.acceptedAt}
                        timeZone={timeZone}
                      />
                    )}
                  </Field>
                  <Field label="In force from">
                    {acceptance.inForceOn === null ? null : (
                      <CalendarDay value={acceptance.inForceOn} />
                    )}
                  </Field>
                  <Field label="Re-acceptance deadline">
                    {acceptance.reacceptanceDeadlineOn === null ? (
                      // Absent is not the same as missing here: an acceptance
                      // with no grace window has no deadline to state
                      // (Rule 7.13).
                      <span className="text-body text-muted-foreground">
                        No grace window.
                      </span>
                    ) : (
                      <CalendarDay value={acceptance.reacceptanceDeadlineOn} />
                    )}
                  </Field>
                  <Field label="Data training-rights grant">
                    {/* D-2. Promoted to its own column because the intake
                          trigger reads it — an acceptance that withholds it is
                          not consent to capture (Rule 7.1). */}
                    <span className="text-body-strong">
                      {acceptance.trainingRightsGranted
                        ? "Granted"
                        : "Not granted"}
                    </span>
                  </Field>
                  {/* Proves *what* was agreed to, not merely that something
                        was (Rule 7.5). Never truncated: it is read back
                        character by character in a dispute. */}
                  <Field
                    label="Document content hash"
                    value={acceptance.documentContentHash}
                    mono
                    span
                  />
                </FieldList>
              </li>
            ))}
          </ul>
        )}

        <p className="max-w-[72ch] text-body text-muted-foreground">
          {TOS_PRIOR_VERSION_NOTE}
        </p>
      </SectionCard>
    </SettingsSection>
  );
}
