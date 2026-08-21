import { CircleCheck, CircleSlash } from "lucide-react";

import { StatusBadge } from "@/components/status/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { GrantLapseReason } from "@/domain/access/grant";
import type { TimeZone } from "@/types/common";
import { GRANT_ALWAYS_EXPIRES_NOTE } from "../member-rules";
import type { MemberRow } from "../read-members";
import {
  Field,
  FieldList,
  SettingsSection,
  ZonedDate,
} from "./settings-primitives";

/**
 * §3.18, D-31, Rules 1.15, 1.17, 1.18, 1.28 — the recorded access grants.
 *
 * **The grant, its scope, its expiry and whether it is in force.** These are
 * what make Rules 1.15 and 1.28 testable rather than aspirational: an auditor
 * and a platform admin hold access **by grant rather than by employment**, and a
 * grant that could exist without an expiry would make "access always ends" a
 * sentence in a document instead of a property of the data.
 *
 * **There is no "never" anywhere in this vocabulary** — not a value, not a
 * sentinel, not a checkbox. A row whose expiry is absent reads as *no access*,
 * never as *no limit* (`src/domain/access/grant.ts` fails closed on it), and
 * `auditorGrantSchema` makes it unwritable in the first place.
 *
 * **Renewal reminders, the scope editor and P5 onboarding are B1b** (D-31) and
 * are not built here. No grant control renders on this route in this unit.
 *
 * Whether a grant is in force renders as **plain text**: the lapse reasons are a
 * domain vocabulary, not a `TAXONOMY.md` system, and a badge over an ungoverned
 * string is how an invented vocabulary acquires a colour.
 */

export const ACCESS_GRANTS_SECTION_ID = "access-grants";

/**
 * Why a grant is not in force. Order matches `GRANT_LAPSE_REASONS`; a revoked
 * grant reads as revoked even where its expiry had also passed, because
 * revocation is the act someone performed.
 */
const LAPSE_REASON_TEXT: Readonly<Record<GrantLapseReason, string>> = {
  not_accepted: "Not accepted yet",
  revoked: "Withdrawn",
  grant_expired: "Expired",
  // Rule 1.15 — a grant without an expiry cannot be created, so a row that has
  // one is a data defect. The only safe reading of it is "no access".
  grant_missing_expiry: "No end date recorded — read as no access",
};

export function AccessGrantsCard({
  rows,
  timeZone,
}: {
  readonly rows: readonly MemberRow[];
  readonly timeZone: TimeZone;
}) {
  return (
    <SettingsSection
      id={ACCESS_GRANTS_SECTION_ID}
      title="Access grants"
      description="Access held by grant rather than by employment — an external auditor, or a platform administrator working inside this organization under a recorded support request."
    >
      <Card>
        <CardContent className="flex flex-col gap-4">
          {rows.length === 0 ? (
            <p className="text-body text-muted-foreground">
              No access grants are recorded for this organization.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {rows.map((row) => (
                <GrantRow
                  key={row.membership.id}
                  row={row}
                  timeZone={timeZone}
                />
              ))}
            </ul>
          )}

          <p className="max-w-[72ch] text-body text-muted-foreground">
            {GRANT_ALWAYS_EXPIRES_NOTE}
          </p>
        </CardContent>
      </Card>
    </SettingsSection>
  );
}

function GrantRow({
  row,
  timeZone,
}: {
  readonly row: MemberRow;
  readonly timeZone: TimeZone;
}) {
  const grant = row.grant;
  if (grant === null) return null;

  return (
    <li
      data-grant-state={grant.isInForce ? "in-force" : "not-in-force"}
      data-grant-lapse-reason={grant.lapseReason ?? undefined}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-body-strong break-words">{row.displayName}</span>
        <StatusBadge system="role" value={row.membership.role} />
      </div>

      <FieldList>
        <Field label="Access">
          <span className="inline-flex items-center gap-2">
            {grant.isInForce ? (
              <CircleCheck aria-hidden="true" className="size-4" />
            ) : (
              <CircleSlash aria-hidden="true" className="size-4" />
            )}
            {grant.isInForce
              ? "In force"
              : grant.lapseReason === null
                ? "Not in force"
                : LAPSE_REASON_TEXT[grant.lapseReason]}
          </span>
        </Field>
        <Field label="Ends">
          {grant.expiresAt === null ? (
            <span className="text-body text-muted-foreground">
              No end date recorded.
            </span>
          ) : (
            <ZonedDate instant={grant.expiresAt} timeZone={timeZone} />
          )}
        </Field>
        <Field label="Reason" value={grant.reason} span />
        <Field label="Scope" value={grant.scope} span />
      </FieldList>
    </li>
  );
}
