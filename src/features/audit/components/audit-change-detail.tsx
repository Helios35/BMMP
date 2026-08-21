"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JsonObject, JsonValue } from "@/types/common";

import type { AuditRowView } from "../audit-row";

/**
 * The expandable before/after detail — `UX_SPEC.md` §3.20.
 *
 * **Expansion is local state, not URL state.** `SITE_ARCHITECTURE.md` §7.4 puts
 * filter, sort, page and tab in the URL; a disclosure is none of those, and it is
 * one of the changes §6.4 permits to be optimistic because nothing is written
 * and nothing can roll back. The deep link a reader shares is the row's **entity
 * link**, which opens the record the event describes.
 *
 * **Nothing here is editable, for anyone.** No role, including P6, may edit or
 * delete an audit event (Rules 1.21, 12.4), so there is no menu, no delete and no
 * disabled placeholder for one — the absence is the enforcement.
 *
 * The applied rule versions render inside the panel because a decision has to
 * stay explainable after the rule has changed three times (Rules 12.15, 12.16).
 */

/** A side of the diff that holds nothing. Never blank, never an em dash. */
const ABSENT_VALUE = "Not recorded";

/** The button's label where the event carried neither a reason nor a diff. */
const NO_SUMMARY_LABEL = "View change detail";

/** Values render **as stored**: a diff a screen reformats is not a diff. */
function renderValue(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return ABSENT_VALUE;
  if (typeof value === "string") return value === "" ? ABSENT_VALUE : value;
  return JSON.stringify(value);
}

/**
 * The fields the panel lists, in `changedFields` order.
 *
 * Anything present on either side and not named in `changedFields` is appended
 * rather than dropped — a column that moved without being listed is exactly the
 * thing an auditor is looking for.
 */
function diffFields(row: AuditRowView): readonly string[] {
  const ordered: string[] = [...row.changedFields];
  const seen = new Set(ordered);
  for (const state of [row.beforeState, row.afterState]) {
    if (state === null) continue;
    for (const key of Object.keys(state)) {
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(key);
    }
  }
  return ordered;
}

function valueAt(state: JsonObject | null, field: string): string {
  if (state === null) return ABSENT_VALUE;
  return renderValue(state[field]);
}

export function AuditChangeDetail({ row }: { readonly row: AuditRowView }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const fields = diffFields(row);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div
      data-audit-detail={open ? "expanded" : "collapsed"}
      className="flex flex-col items-start gap-2"
    >
      <Button
        type="button"
        variant="ghost"
        size="lg"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="min-h-11 max-w-full justify-start rounded-md px-2 text-left whitespace-normal"
      >
        <Chevron aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 text-body">
          {row.summary === "" ? NO_SUMMARY_LABEL : row.summary}
        </span>
      </Button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={`Change detail, ${row.timestamp.full}`}
          className="flex w-full max-w-[72ch] flex-col gap-3 rounded-lg border border-border p-3"
        >
          {row.beforeState === null ? (
            <p className="text-body text-muted-foreground">
              This event recorded a new row, so there is no previous state.
            </p>
          ) : null}

          {fields.length === 0 ? (
            <p className="text-body text-muted-foreground">
              No field-level change was recorded on this event.
            </p>
          ) : (
            <>
              <div className="hidden gap-4 md:flex">
                <span className="w-48 shrink-0 text-label">Field</span>
                <span className="min-w-0 flex-1 text-label">Before</span>
                <span className="min-w-0 flex-1 text-label">After</span>
              </div>
              <dl className="flex flex-col gap-3">
                {fields.map((field) => (
                  <div
                    key={field}
                    className="flex flex-col gap-1 md:flex-row md:gap-4"
                  >
                    <dt className="text-label md:w-48 md:shrink-0">{field}</dt>
                    <dd className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:gap-4">
                      <span className="min-w-0 flex-1 text-mono break-words">
                        <span className="sr-only">Before: </span>
                        {valueAt(row.beforeState, field)}
                      </span>
                      <span className="min-w-0 flex-1 text-mono break-words">
                        <span className="sr-only">After: </span>
                        {valueAt(row.afterState, field)}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {row.ruleVersions.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-label">Rule versions applied</span>
              <ul className="flex flex-col gap-2">
                {row.ruleVersions.map((version) => (
                  <li
                    key={`${version.ruleKey}:${version.versionLabel}`}
                    className="flex flex-col gap-0.5"
                  >
                    <span className="text-body-strong">{version.ruleKey}</span>
                    <span className="text-mono">{version.versionLabel}</span>
                    <span className="text-body">{version.citation}</span>
                    <span className="text-body text-muted-foreground">
                      {version.outcome}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div
            className={cn(
              "flex flex-col gap-1",
              (row.ruleVersions.length > 0 || fields.length > 0) &&
                "border-t border-border pt-3",
            )}
          >
            <span className="text-label">Correlation id</span>
            <span data-correlation-id="true" className="text-mono break-all">
              {row.correlationId ?? ABSENT_VALUE}
            </span>
            {row.governingRuleVersionId !== null ? (
              <>
                <span className="text-label">Governing rule version</span>
                <span className="text-mono break-all">
                  {row.governingRuleVersionId}
                </span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
