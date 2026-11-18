import type { ReactElement } from "react";

import { Field, FieldList, SectionCard } from "@/components/page";
import { StatusBadge } from "@/components/status/status-badge";
import { CHANGED_SINCE } from "@/domain/hazard/words";
import type { HazardRankingView } from "@/domain/hazard/view";

import {
  AS_OF,
  BASIS,
  FACTORS,
  FROM,
  NOT_PLACED,
  PANEL_DESCRIPTION,
  PANEL_TITLE,
  POSITION,
  RANKED_AGAINST,
  WHY,
} from "./ranking-copy";

/**
 * `HazardRankingPanel` — `UX_SPEC.md` §3.7, §3.10; Rules 10.24, 10.25; T-33.
 *
 * **One shared component**, on the battery record, the container and the
 * lot. It shows, in this order: the band label; the position, the set and
 * the as-of time; the basis statement; why the item sits where it does
 * against the item just above and just below; and each factor with this
 * item's level and where it came from. **A band never appears without its
 * set, its size and its as-of time** (T-33).
 *
 * One neutral colour for every band (`StatusBadge` maps every T-33 value to
 * `neutral`). "Not recorded" is said as a level, never as low or safe. No
 * number here reads as a chance: positions and set sizes only (Rule 10.3).
 */
export function HazardRankingPanel({
  view,
  headingLevel = 2,
  inDialog = false,
}: {
  readonly view: HazardRankingView;
  readonly headingLevel?: 2 | 3;
  /** In a dialog the dialog carries the title, so the card drops its own. */
  readonly inDialog?: boolean;
}): ReactElement {
  const body =
    view.kind === "ranked" ? (
      <RankedBody view={view} />
    ) : (
      <p className="text-body-strong" data-hazard-ranking-message="true">
        {view.message}
      </p>
    );

  const attributes = {
    "data-hazard-ranking-panel": "true",
    "data-hazard-ranking-state":
      view.kind === "ranked"
        ? view.changedSince
          ? "changed_since"
          : "ranked"
        : view.kind,
  };

  if (inDialog) {
    return (
      <div className="flex flex-col gap-4" {...attributes}>
        {body}
      </div>
    );
  }
  return (
    <SectionCard
      title={PANEL_TITLE}
      description={PANEL_DESCRIPTION}
      headingLevel={headingLevel}
      dataAttributes={attributes}
    >
      {body}
    </SectionCard>
  );
}

function RankedBody({
  view,
}: {
  readonly view: Extract<HazardRankingView, { kind: "ranked" }>;
}): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span data-hazard-band={view.band}>
            <StatusBadge system="hazard_ranking_band" value={view.band} />
          </span>
        </div>
        {view.changedSince ? (
          <p
            className="text-body-strong"
            data-hazard-changed-since="true"
            role="status"
          >
            {CHANGED_SINCE}
          </p>
        ) : null}
      </div>

      <FieldList>
        <Field label={POSITION}>
          <span data-hazard-position="true">
            {view.positionText ?? NOT_PLACED}
          </span>
        </Field>
        <Field label={RANKED_AGAINST}>
          <span data-hazard-set="true">{view.setText}</span>
        </Field>
        <Field label={AS_OF}>
          <span data-hazard-as-of={view.asOfInstant}>{view.asOf}</span>
        </Field>
      </FieldList>

      <section className="flex flex-col gap-2" aria-label={WHY}>
        <h3 className="text-label text-foreground">{WHY}</h3>
        <ul className="flex flex-col gap-1" data-hazard-why="true">
          {view.why.map((statement) => (
            <li key={statement} className="text-body">
              {statement}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2" aria-label={FACTORS}>
        <h3 className="text-label text-foreground">{FACTORS}</h3>
        <FieldList columns={1}>
          {view.factors.map((factor) => (
            <Field
              key={factor.code}
              label={factor.label}
              note={`${FROM}: ${factor.basis}`}
            >
              <span
                data-hazard-factor={factor.code}
                data-hazard-factor-not-recorded={
                  factor.isNotRecorded ? "true" : undefined
                }
              >
                {factor.level}
              </span>
            </Field>
          ))}
        </FieldList>
      </section>

      <section className="flex flex-col gap-2" aria-label={BASIS}>
        <h3 className="text-label text-foreground">{BASIS}</h3>
        <p
          className="max-w-[72ch] text-body text-foreground"
          data-hazard-basis="true"
        >
          {view.basisStatement}
        </p>
      </section>
    </div>
  );
}
