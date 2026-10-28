import type { ReactElement } from "react";

import { SectionCard } from "@/components/page";
import { StatusBadge } from "@/components/status/status-badge";
import { RECALLS_ANCHOR } from "@/features/battery-record/ddr-block-notice";

import {
  CHECKED_AGAINST,
  CONFIRMED_BY,
  DISMISSED_BY,
  LAST_CHECKED,
  MATCHED_ON,
  NO_RECALLS_LISTED,
  NO_TITLE,
  PUBLISHED,
  REASON,
  RECALLS_DESCRIPTION,
  RECALLS_TITLE,
  RECORDED_BY,
  REMEDY,
  WITHDRAWN,
  WITHDRAWN_BY,
} from "../recall-copy";
import type { RecallRowView, RecallSectionView } from "../server/read-recalls";
import {
  CheckNowButton,
  ConfirmRecallButton,
  DismissRecallDialog,
  RecordRecallDialog,
} from "./recall-controls";

/**
 * The record's **Recalls** section, on the Overview tab — `UX_SPEC.md` §3.7;
 * Rules 10.13–10.18.
 *
 * - **The standing line:** T-35's label — or why the record is not checked —
 *   the last checked time, and the sources. **A failure reads "Not checked —
 *   source unavailable", never "No match"** (Rule 10.17).
 * - **Each row:** source, recall number linked to the recall, title,
 *   published date and remedy, **"Matched on:" in words**, and status, who,
 *   when and why. Dismissed and withdrawn rows stay (Rule 6.24).
 * - **Colour:** a possible match is `attention`, T-35's own intent; a
 *   confirmed recall is the `HardBlockNotice` at the top of the record, named
 *   as a recall (§2.6).
 *
 * **No match-strength wording anywhere, and no number** (Rule 10.13).
 */
export function RecallsSection({
  view,
}: {
  readonly view: RecallSectionView;
}): ReactElement {
  const actions =
    view.canCheckNow || view.canRecord ? (
      <div className="flex flex-wrap items-start gap-2">
        {view.canCheckNow ? <CheckNowButton recordId={view.recordId} /> : null}
        {view.canRecord ? (
          <RecordRecallDialog recordId={view.recordId} />
        ) : null}
      </div>
    ) : undefined;

  return (
    <SectionCard
      id={RECALLS_ANCHOR}
      title={RECALLS_TITLE}
      description={RECALLS_DESCRIPTION}
      action={actions}
      className="scroll-mt-24"
      dataAttributes={{
        "data-recalls-section": "true",
        "data-recall-standing": view.standing.status,
        "data-recall-standing-reason": view.standing.reason ?? "",
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1" data-recall-standing-line="true">
          <p className="flex flex-wrap items-center gap-2 text-body-strong">
            {view.standing.status === "not_checked" ? (
              <span data-recall-standing-text="true">{view.standingText}</span>
            ) : (
              <span data-recall-standing-text="true">
                <StatusBadge
                  system="recall_match_status"
                  value={view.standing.status}
                />
              </span>
            )}
          </p>
          {view.lastChecked === null && view.sources === null ? null : (
            <p className="text-caption text-muted-foreground">
              {[
                view.lastChecked === null
                  ? null
                  : `${LAST_CHECKED} ${view.lastChecked}`,
                view.sources === null
                  ? null
                  : `${CHECKED_AGAINST}: ${view.sources}`,
              ]
                .filter((part): part is string => part !== null)
                .join(" · ")}
            </p>
          )}
          {view.note === null ? null : (
            <p
              className="max-w-[72ch] text-body text-muted-foreground"
              data-recall-standing-note="true"
            >
              {view.note}
            </p>
          )}
        </div>

        {view.rows.length === 0 ? (
          <p className="text-body text-muted-foreground">{NO_RECALLS_LISTED}</p>
        ) : (
          <ul className="flex flex-col gap-3" data-recall-matches="true">
            {view.rows.map((row) => (
              <RecallRow key={row.id} row={row} recordId={view.recordId} />
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

function RecallRow({
  row,
  recordId,
}: {
  readonly row: RecallRowView;
  readonly recordId: string;
}): ReactElement {
  const decision =
    row.status === "dismissed"
      ? {
          label: row.isWithdrawal ? WITHDRAWN_BY : DISMISSED_BY,
          by: row.dismissedBy,
          at: row.dismissedAt,
        }
      : row.status === "confirmed_match"
        ? {
            label: row.isByHand ? RECORDED_BY : CONFIRMED_BY,
            by: row.confirmedBy,
            at: row.confirmedAt,
          }
        : null;

  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-border p-3"
      data-recall-match={row.id}
      data-recall-status={row.status}
      data-recall-withdrawn={row.isWithdrawal ? "true" : "false"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge system="recall_match_status" value={row.status} />
        {row.isWithdrawal ? (
          <span className="text-label">{WITHDRAWN}</span>
        ) : null}
        <span className="text-label text-muted-foreground">
          {row.sourceLabel}
        </span>
        {row.recallUrl === null ? (
          <span
            className="font-mono text-body-strong"
            data-recall-number="true"
          >
            {row.recallNumber}
          </span>
        ) : (
          <a
            href={row.recallUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center font-mono text-body-strong underline underline-offset-4"
            data-recall-number="true"
          >
            {row.recallNumber}
          </a>
        )}
      </div>
      <p className="text-body">{row.title ?? NO_TITLE}</p>
      <p className="text-body" data-recall-matched-on="true">
        <span className="text-body-strong">{MATCHED_ON}</span> {row.matchedOn}
      </p>
      {row.publishedOn === null && row.remedy === null ? null : (
        <p className="text-caption text-muted-foreground">
          {[
            row.publishedOn === null ? null : `${PUBLISHED} ${row.publishedOn}`,
            row.remedy === null ? null : `${REMEDY}: ${row.remedy}`,
          ]
            .filter((part): part is string => part !== null)
            .join(" · ")}
        </p>
      )}
      {decision === null ? null : (
        <p className="text-caption text-muted-foreground">
          {`${decision.label} ${decision.by ?? "a person no longer on file"}${decision.at === null ? "" : `, ${decision.at}`}`}
        </p>
      )}
      {row.reason === null ? null : (
        <p className="max-w-[72ch] text-body" data-recall-reason="true">
          <span className="text-body-strong">{REASON}:</span> {row.reason}
        </p>
      )}
      {row.canConfirm || row.canDismiss || row.canWithdraw ? (
        <div className="flex flex-wrap items-start gap-2">
          {row.canConfirm ? (
            <ConfirmRecallButton recordId={recordId} matchId={row.id} />
          ) : null}
          {row.canDismiss ? (
            <DismissRecallDialog
              recordId={recordId}
              matchId={row.id}
              withdraw={false}
            />
          ) : null}
          {row.canWithdraw ? (
            <DismissRecallDialog
              recordId={recordId}
              matchId={row.id}
              withdraw
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
