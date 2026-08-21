import { CircleAlert } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { StatusBadge } from "@/components/status/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import {
  JURISDICTION_LEVELS,
  JURISDICTION_LEVEL_LABELS,
} from "@/domain/taxonomy/jurisdiction-level";
import type { JsonValue } from "@/types/common";
import { cn } from "@/lib/utils";
import {
  NO_JURISDICTION_BODY,
  NO_JURISDICTION_HEADLINE,
  NO_RULE_VERSION_IN_FORCE,
  NO_RULES_FOR_JURISDICTION,
  RULE_PAYLOAD_NOTE,
} from "../copy";
import type {
  SiteJurisdictionProfile,
  SiteRuleRow,
} from "../read-organization-settings";
import { formatAddressLine } from "../sites";
import {
  CalendarDay,
  Field,
  FieldList,
  SettingsSection,
} from "./settings-primitives";

/**
 * §3.17, Rules 1.23, 3.5, 3.10 — the jurisdiction profile, **per site, never
 * organisation-wide.**
 *
 * **This section is a list even when there is one site**, and that is the whole
 * point. An organization with sites in two states holds two profiles and
 * classifies the same battery two ways, correctly; a single org-wide field can
 * only ever hold one state's answer, which makes every other state's answer
 * wrong. Nothing on this page reads "Jurisdiction: <one place>".
 *
 * **No threshold, deadline, citation or unit is a literal anywhere in this
 * file.** Every number and every unit comes out of `rule_version.payload` and
 * `rule_version.citation`, and the payload renders **generically** — key as
 * stored, value as stored, nothing humanised and no unit inferred. Rendering
 * "Retention: 3 years" would require this component to know that a key named for
 * years means years; that is an assumption about jurisdiction data, and the next
 * jurisdiction measures by energy rather than by volume.
 *
 * **A draft version never appears.** The read filters on published versions in
 * force on the site's day (T-42), so a proposed rule cannot sit beside a rule a
 * document was produced under.
 */

export const SITES_SECTION_ID = "sites-and-jurisdiction";

export function SiteJurisdictionSection({
  profiles,
}: {
  readonly profiles: readonly SiteJurisdictionProfile[];
}) {
  return (
    <SettingsSection
      id={SITES_SECTION_ID}
      title="Sites and jurisdiction profile"
      description="Each site sits in its own jurisdiction, and the rules in force there supply every threshold, deadline and citation this product shows. Read-only."
    >
      <ul className="flex flex-col gap-4" data-site-count={profiles.length}>
        {profiles.map((profile) => (
          <li key={profile.site.key}>
            <SiteCard profile={profile} />
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}

function SiteCard({ profile }: { readonly profile: SiteJurisdictionProfile }) {
  const { site, chain, rules, asOfDate } = profile;

  return (
    <Card data-site-key={site.key}>
      <CardHeader>
        <CardTitle className="text-h2 break-words">
          {formatAddressLine(site.address)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldList>
          <Field label="Time zone" value={site.timeZone} mono />
          <Field label="Containers at this site">
            <span className="text-body-strong">{site.containerCount}</span>
          </Field>
          <Field label="Jurisdiction chain" span>
            {chain.length === 0 ? (
              <span className="text-body text-muted-foreground">
                None recorded.
              </span>
            ) : (
              <JurisdictionChain chain={chain} />
            )}
          </Field>
        </FieldList>

        {site.jurisdictionId === null ? (
          <NoJurisdictionNotice />
        ) : (
          <>
            <Separator />
            <div className="flex flex-col gap-1">
              <h3 className="text-body-strong">Rules in force</h3>
              <p className="max-w-[72ch] text-caption text-muted-foreground">
                Resolved on <CalendarDay value={asOfDate} /> in this
                site&rsquo;s time zone. {RULE_PAYLOAD_NOTE}
              </p>
            </div>

            {rules.length === 0 ? (
              <p className="text-body text-muted-foreground">
                {NO_RULES_FOR_JURISDICTION}
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {rules.map((row) => (
                  <li key={row.rule.id}>
                    <RuleRow row={row} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Most specific first — the chain is walked, never enumerated. */
function JurisdictionChain({
  chain,
}: {
  readonly chain: SiteJurisdictionProfile["chain"];
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {chain.map((link, index) => (
        <li key={link.id} className="flex items-center gap-2">
          {index > 0 ? (
            <span aria-hidden="true" className="text-muted-foreground">
              &rarr;
            </span>
          ) : null}
          <span className="inline-flex flex-wrap items-baseline gap-1">
            <span className="text-mono">{link.code}</span>
            <span className="text-body-strong">{link.name}</span>
            <span className="text-caption text-muted-foreground">
              <JurisdictionLevelLabel level={link.level} />
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * T-40, read through the taxonomy lookup rather than through a string transform.
 *
 * An unrecognised level renders **as stored, in mono** — never blank, never
 * coerced to a default (`TAXONOMY.md` §5.8).
 */
function JurisdictionLevelLabel({ level }: { readonly level: string }) {
  const read = readTaxonomyValue(
    JURISDICTION_LEVELS,
    JURISDICTION_LEVEL_LABELS,
    level,
  );
  if (!read.recognised) {
    return <span className="text-mono">{read.storedValue}</span>;
  }
  return <>{read.label}</>;
}

function NoJurisdictionNotice() {
  return (
    <Alert
      role="status"
      data-site-jurisdiction="absent"
      className={cn(INTENT_SURFACE_CLASSES.attention, "gap-2 px-4 py-4")}
    >
      <CircleAlert aria-hidden="true" className="size-5" />
      <AlertTitle className="text-body-strong">
        {NO_JURISDICTION_HEADLINE}
      </AlertTitle>
      <AlertDescription className="max-w-[72ch] text-body text-current">
        {NO_JURISDICTION_BODY}
      </AlertDescription>
    </Alert>
  );
}

function RuleRow({ row }: { readonly row: SiteRuleRow }) {
  const { rule, jurisdiction, version } = row;

  return (
    <div
      data-rule-key={rule.ruleKey}
      data-rule-version-status={version?.status}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-body-strong break-words">{rule.title}</p>
          <p className="text-caption text-muted-foreground">
            <span className="text-mono">{rule.ruleKey}</span>
          </p>
        </div>
        {version !== null ? (
          // T-42, from the one statusIntent map.
          <StatusBadge system="rule_version_status" value={version.status} />
        ) : null}
      </div>

      {version === null ? (
        <p className="text-body text-muted-foreground">
          {NO_RULE_VERSION_IN_FORCE}
        </p>
      ) : (
        <>
          <FieldList>
            <Field label="Source">
              <span className="inline-flex flex-wrap items-baseline gap-1">
                <span className="text-mono">{jurisdiction.code}</span>
                <span className="text-body-strong">{jurisdiction.name}</span>
              </span>
            </Field>
            <Field label="Version" value={version.versionLabel} mono />
            <Field label="Effective from">
              <CalendarDay value={version.effectiveOn} />
            </Field>
            <Field label="Effective until">
              {version.expiresOn === null ? (
                <span className="text-body text-muted-foreground">
                  Open-ended.
                </span>
              ) : (
                <CalendarDay value={version.expiresOn} />
              )}
            </Field>
            {/* Rule 1.23 — the citation is the rule's own text, never authored
                here and never abbreviated. */}
            <Field label="Citation" value={version.citation} span />
          </FieldList>

          <RulePayload payload={version.payload} />
        </>
      )}
    </div>
  );
}

/**
 * The rule's values, **exactly as stored.**
 *
 * Keys are rendered as stored, in mono, and are not humanised. Values are
 * rendered as stored, and no unit is inferred or appended. A nested value is
 * serialised rather than flattened, because flattening would be a reading of the
 * shape and the shape belongs to the rule.
 */
function RulePayload({
  payload,
}: {
  readonly payload: Readonly<Record<string, JsonValue>>;
}) {
  const entries = Object.entries(payload);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-label text-muted-foreground">Values, as stored</h4>
      {/* Wide values scroll inside this container; the page body never scrolls
          sideways (A8). */}
      <div className="overflow-x-auto">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-mono break-words text-muted-foreground">
                {key}
              </dt>
              <dd className="text-mono break-words">
                {stringifyStored(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** As stored. A string is not quoted; anything else is serialised verbatim. */
function stringifyStored(value: JsonValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
