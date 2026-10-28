import { data } from "@/data";
import type { RequestContext } from "@/data/contracts";
import { mayTakeRecallAction } from "@/domain/access/recall-actions";
import type { RecallMatchField } from "@/domain/recalls/identity";
import { RECALL_MATCH_FIELDS } from "@/domain/recalls/identity";
import { matchedOnWords } from "@/domain/recalls/match";
import { recallStanding, type RecallStanding } from "@/domain/recalls/standing";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";
import {
  RECALL_MATCH_STATUSES,
  RECALL_MATCH_STATUS_LABELS,
  type RecallMatchStatus,
} from "@/domain/taxonomy/recall-match-status";
import {
  RECALL_SOURCES,
  RECALL_SOURCE_LABELS,
} from "@/domain/taxonomy/recall-source";
import {
  absoluteInstant,
  civilDateLabel,
} from "@/features/battery-record/format-instant";
import { resolveUserNames } from "@/features/battery-record/user-names";
import type { BatteryRecord } from "@/types/battery-record";
import type { TimeZone, Uuid } from "@/types/common";
import type { RecallMatch } from "@/types/condition";

import {
  NOT_CHECKED_TEXT,
  NOTHING_TO_MATCH_NOTE,
  NEVER_CHECKED_NOTE,
  RECORDED_BY_HAND,
  UNAVAILABLE_NOTE,
} from "../recall-copy";
import {
  CHECKABLE_STATUSES,
  identitiesOf,
  RECALLS_PER_RECORD_LIMIT,
} from "./check";

/**
 * The record's **Recalls** section, read — `UX_SPEC.md` §3.7; Rules 10.13,
 * 10.17, 10.18.
 *
 * The standing is derived from the check runs and the match rows by
 * `recallStanding`, never stored. Every row is shown, dismissed and withdrawn
 * ones included — nothing is deleted and both halves of a withdrawal stay
 * visible (Rule 6.24). Who may act is the recall action map, so a control and
 * the refusal behind it cannot disagree; P5 is offered nothing.
 */

export interface RecallRowView {
  readonly id: Uuid;
  readonly sourceLabel: string;
  readonly recallNumber: string;
  readonly recallUrl: string | null;
  readonly title: string | null;
  readonly publishedOn: string | null;
  readonly remedy: string | null;
  /** "Matched on:", in words — never a number (Rule 10.13). */
  readonly matchedOn: string;
  readonly status: RecallMatchStatus;
  readonly statusLabel: string;
  /** A dismissed row that had been confirmed — a withdrawal (Rule 10.16). */
  readonly isWithdrawal: boolean;
  readonly isByHand: boolean;
  readonly confirmedBy: string | null;
  readonly confirmedAt: string | null;
  readonly dismissedBy: string | null;
  readonly dismissedAt: string | null;
  readonly reason: string | null;
  readonly canConfirm: boolean;
  readonly canDismiss: boolean;
  readonly canWithdraw: boolean;
}

export interface RecallSectionView {
  readonly recordId: Uuid;
  readonly standing: RecallStanding;
  /** The T-35 label, or the reason it was not checked. */
  readonly standingText: string;
  readonly note: string | null;
  readonly lastChecked: string | null;
  readonly sources: string | null;
  readonly rows: readonly RecallRowView[];
  readonly canCheckNow: boolean;
  readonly canRecord: boolean;
}

/** Possible first — they need a person — then confirmed, then dismissed. */
const ROW_ORDER: Readonly<Record<RecallMatchStatus, number>> = {
  possible_match: 0,
  confirmed_match: 1,
  dismissed: 2,
  no_match: 3,
  not_checked: 4,
};

function fieldsOf(match: RecallMatch): readonly RecallMatchField[] {
  const fields = match.matchedOn.fields;
  return Array.isArray(fields)
    ? fields.filter((field): field is RecallMatchField =>
        (RECALL_MATCH_FIELDS as readonly unknown[]).includes(field),
      )
    : [];
}

function matchedOnText(match: RecallMatch): string {
  if (match.identity === null) return RECORDED_BY_HAND;
  return matchedOnWords(
    match.identity,
    fieldsOf(match),
    match.recallNumber ?? match.providerRecordId,
  );
}

function label<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
  stored: string,
): string {
  const read = readTaxonomyValue(values, labels, stored);
  return read.recognised ? read.label : read.storedValue;
}

export async function readRecallSection(
  ctx: RequestContext,
  record: BatteryRecord,
  timeZone: TimeZone,
): Promise<RecallSectionView> {
  const [matchesPage, runsPage, catalogEntry] = await Promise.all([
    data.recalls.listMatches(ctx, {
      batteryRecordId: record.id,
      limit: RECALLS_PER_RECORD_LIMIT,
    }),
    data.recalls.listCheckRuns(ctx, {
      batteryRecordId: record.id,
      limit: RECALLS_PER_RECORD_LIMIT,
    }),
    record.catalogEntryId === null
      ? Promise.resolve(null)
      : data.catalogEntries.get(ctx, record.catalogEntryId),
  ]);
  const matches = matchesPage.items;
  const identities = identitiesOf({ record, catalogEntry });

  const standing = recallStanding({
    matches,
    runs: runsPage.items,
    identities: identities.map((identity) => identity.kind),
  });

  const names = await resolveUserNames(
    ctx,
    matches.flatMap((match) => [match.confirmedBy, match.dismissedBy]),
  );
  const when = (at: string | null) =>
    at === null ? null : absoluteInstant(at, timeZone);
  const who = (id: Uuid | null) =>
    id === null ? null : (names.get(id) ?? null);
  const checkable = CHECKABLE_STATUSES.includes(record.status);

  const rows: RecallRowView[] = [...matches]
    .sort(
      (a, b) =>
        ROW_ORDER[a.status] - ROW_ORDER[b.status] ||
        b.createdAt.localeCompare(a.createdAt),
    )
    .map((match) => ({
      id: match.id,
      sourceLabel: label(RECALL_SOURCES, RECALL_SOURCE_LABELS, match.source),
      recallNumber: match.recallNumber ?? match.providerRecordId,
      recallUrl: match.recallUrl,
      title: match.recallTitle,
      publishedOn:
        match.recallPublishedOn === null
          ? null
          : civilDateLabel(match.recallPublishedOn),
      remedy: match.remedySummary,
      matchedOn: matchedOnText(match),
      status: match.status,
      statusLabel: label(
        RECALL_MATCH_STATUSES,
        RECALL_MATCH_STATUS_LABELS,
        match.status,
      ),
      isWithdrawal: match.status === "dismissed" && match.confirmedBy !== null,
      isByHand: match.identity === null,
      confirmedBy: who(match.confirmedBy),
      confirmedAt: when(match.confirmedAt),
      dismissedBy: who(match.dismissedBy),
      dismissedAt: when(match.dismissedAt),
      reason: match.dismissedReason,
      canConfirm:
        checkable &&
        match.status === "possible_match" &&
        mayTakeRecallAction(ctx.role, "confirm"),
      canDismiss:
        checkable &&
        match.status === "possible_match" &&
        mayTakeRecallAction(ctx.role, "dismiss"),
      canWithdraw:
        checkable &&
        match.status === "confirmed_match" &&
        mayTakeRecallAction(ctx.role, "withdraw"),
    }));

  const standingText =
    standing.status === "not_checked"
      ? NOT_CHECKED_TEXT[standing.reason ?? "never_checked"]
      : RECALL_MATCH_STATUS_LABELS[standing.status];
  const note =
    standing.status !== "not_checked"
      ? null
      : standing.reason === "source_unavailable"
        ? UNAVAILABLE_NOTE
        : standing.reason === "nothing_to_match"
          ? NOTHING_TO_MATCH_NOTE
          : NEVER_CHECKED_NOTE;

  return {
    recordId: record.id,
    standing,
    standingText,
    note,
    lastChecked: when(standing.lastCheckedAt),
    sources:
      standing.sources.length === 0
        ? null
        : standing.sources
            .map((source) => RECALL_SOURCE_LABELS[source])
            .join(", "),
    rows,
    canCheckNow: checkable && mayTakeRecallAction(ctx.role, "check_now"),
    canRecord: checkable && mayTakeRecallAction(ctx.role, "record"),
  };
}
