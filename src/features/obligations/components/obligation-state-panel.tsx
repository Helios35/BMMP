import Link from "next/link";
import type { ReactElement } from "react";

import { SectionCard } from "@/components/page";
import { StatusBadge } from "@/components/status/status-badge";
import { notCheckedWords, stewardshipWords } from "@/domain/producer";

import {
  OBLIGATIONS_HEADING,
  PRODUCTS_IN_STATE,
  STATE_PANEL_CLOSE,
  STEWARDSHIP_HEADING,
} from "../obligation-copy";
import type { StateView } from "../view";

/**
 * `ObligationStatePanel` — `UX_SPEC.md` §3.21; Rule 8.14. Opened by
 * `?state=`. Every obligation shows the duty in plain words, the state's
 * citation and source link, the rule version and its effective date, the
 * products it applies to with their band in the law's own terms, and its
 * deadlines or "No date yet" and the event. A version that takes effect later
 * is shown with its date; the stewardship organizations the rule names are
 * shown as it names them, never as an endorsement.
 */
export function ObligationStatePanel({
  view,
  closeHref,
}: {
  readonly view: StateView;
  readonly closeHref: string;
}): ReactElement {
  const stewardship = stewardshipWords(view.stewardshipOrganizations);
  const notChecked = notCheckedWords(view.notChecked);
  return (
    <SectionCard
      title={view.state.name}
      action={
        <Link
          href={closeHref}
          className="text-label underline-offset-4 hover:underline"
          data-state-panel-close="true"
        >
          {STATE_PANEL_CLOSE}
        </Link>
      }
    >
      <div
        className="flex flex-col gap-4"
        data-obligation-state-panel={view.state.code}
      >
        {view.onFile ? (
          <div className="flex flex-col gap-1 text-body">
            <p data-state-law="true">
              {view.law}
              {view.lawUrl === null ? null : (
                <>
                  {" · "}
                  <a
                    href={view.lawUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                    data-state-source="true"
                  >
                    Source
                  </a>
                </>
              )}
            </p>
            {view.agency === null ? null : (
              <p className="text-caption text-muted-foreground">
                {view.agency}
              </p>
            )}
            <p
              className="text-caption text-muted-foreground"
              data-state-version="true"
            >
              Obligations: {view.obligationsVersionWords}
              {view.coverageVersionWords === null
                ? ""
                : ` · Battery classes: ${view.coverageVersionWords}`}
            </p>
          </div>
        ) : (
          <p className="text-body" data-no-rules={view.state.code}>
            {view.noRulesWords}
          </p>
        )}

        {view.laterVersions.length === 0 ? null : (
          <ul className="flex flex-col gap-1" data-state-later-versions="true">
            {view.laterVersions.map((words) => (
              <li key={words} className="text-body">
                {words}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1">
          <h3 className="text-label text-foreground">{PRODUCTS_IN_STATE}</h3>
          <p className="text-body">{view.products.join(" · ")}</p>
          {notChecked === null ? null : (
            <p
              className="text-caption text-muted-foreground"
              data-state-not-checked="true"
            >
              {notChecked}
            </p>
          )}
        </div>

        {view.obligations.length === 0 ? null : (
          <div className="flex flex-col gap-3">
            <h3 className="text-label text-foreground">
              {OBLIGATIONS_HEADING}
            </h3>
            <ul className="flex flex-col gap-3">
              {view.obligations.map((obligation) => (
                <li
                  key={obligation.id}
                  className="flex flex-col gap-2 rounded-md border border-border p-3"
                  data-state-obligation={obligation.key}
                  data-obligation-status={obligation.status}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      system="producer_obligation_status"
                      value={obligation.status}
                    />
                    <span className="text-body-strong">{obligation.duty}</span>
                  </div>
                  <p
                    className="text-caption text-muted-foreground"
                    data-obligation-citation="true"
                  >
                    {obligation.citation}
                  </p>
                  <p className="text-body" data-obligation-reasoning="true">
                    {obligation.reasoning}
                  </p>
                  {obligation.products.length === 0 ? null : (
                    <ul className="flex flex-col gap-1 text-caption">
                      {obligation.products.map((product) => (
                        <li key={product.label}>
                          {product.label}: {product.bandWords}
                        </li>
                      ))}
                    </ul>
                  )}
                  {obligation.noDateYet ? (
                    <p className="text-body" data-obligation-no-date="true">
                      {obligation.dueWords}
                    </p>
                  ) : obligation.deadlines.length === 0 ? (
                    <p className="text-caption text-muted-foreground">
                      {obligation.dueWords}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {obligation.deadlines.map((deadline) => (
                        <li
                          key={deadline.id}
                          className="flex flex-wrap items-center gap-2 text-body"
                          data-obligation-deadline={deadline.id}
                        >
                          <span>{deadline.dueWords}</span>
                          <StatusBadge
                            system="obligation_deadline_standing"
                            value={deadline.standing}
                            {...(deadline.intent === "attention"
                              ? { escalateTo: "attention" as const }
                              : {})}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {stewardship === null ? null : (
          <div className="flex flex-col gap-1">
            <h3 className="text-label text-foreground">
              {STEWARDSHIP_HEADING}
            </h3>
            <p className="text-body" data-state-stewardship="true">
              {stewardship}
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
