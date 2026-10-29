import type { RecallMatchStatus } from "@/domain/taxonomy/recall-match-status";
import type { IsoTimestamp } from "@/types/common";

import type { RecallSearchSource } from "./hit";
import type { RecallIdentityKind } from "./identity";

/**
 * A record's recall standing — Rules 10.17, 10.18; T-35; D-73 #3.
 *
 * **Check runs and matches are different things.** Every check run is kept,
 * append-only; a match row is one per record, source and recall. `not_checked`
 * and `no_match` are never match rows — they are this function's answer,
 * derived from the runs. The order is the rule's:
 *
 * 1. **Confirmed match** — any confirmed recall
 * 2. **Possible match** — any open possible match
 * 3. **No match** — the last run on every applicable source found none
 * 4. **Not checked** — otherwise, with the reason
 *
 * **A failure is never "no match"** (Rule 10.17): one failed last run on any
 * applicable identity makes the standing "Not checked — source unavailable",
 * with the time it failed.
 *
 * "Found none" counts a candidate a person has since dismissed as found and
 * ruled out: a dismissed recall found again on a later run makes no second
 * row (Rule 10.18), so reading its run as "not none" would hold the record at
 * "Not checked" forever. Reported in `b2-09`'s build-notes.
 */

/** What one check run concluded (Rule 10.18). */
export const RECALL_CHECK_OUTCOMES = [
  "no_match",
  "candidates_found",
  "nothing_to_match",
  "failed",
] as const;

export type RecallCheckOutcome = (typeof RECALL_CHECK_OUTCOMES)[number];

/** Why a check ran (Rule 10.10). */
export const RECALL_CHECK_TRIGGERS = [
  "intake_commit",
  "identity_change",
  "check_now",
  "nightly",
] as const;

export type RecallCheckTrigger = (typeof RECALL_CHECK_TRIGGERS)[number];

export interface StandingRun {
  /** Null on a run that found nothing to match against. */
  readonly source: RecallSearchSource | null;
  readonly identity: RecallIdentityKind | null;
  readonly outcome: RecallCheckOutcome;
  readonly ranAt: IsoTimestamp;
}

export interface StandingMatch {
  readonly status: RecallMatchStatus;
}

export type RecallStandingReason =
  "never_checked" | "source_unavailable" | "nothing_to_match";

export interface RecallStanding {
  readonly status: Extract<
    RecallMatchStatus,
    "confirmed_match" | "possible_match" | "no_match" | "not_checked"
  >;
  /** Set only on `not_checked`. */
  readonly reason: RecallStandingReason | null;
  /** The last run the standing rests on — for a failure, when it failed. */
  readonly lastCheckedAt: IsoTimestamp | null;
  /** The sources those runs asked. */
  readonly sources: readonly RecallSearchSource[];
}

function newestFirst(runs: readonly StandingRun[]): readonly StandingRun[] {
  return [...runs].sort((a, b) => b.ranAt.localeCompare(a.ranAt));
}

export function recallStanding(input: {
  readonly matches: readonly StandingMatch[];
  readonly runs: readonly StandingRun[];
  /** The identities the record can be checked on now (`recallIdentities`). */
  readonly identities: readonly RecallIdentityKind[];
}): RecallStanding {
  const runs = newestFirst(input.runs);
  const latestPerIdentity = input.identities
    .map((identity) => runs.find((run) => run.identity === identity))
    .filter((run): run is StandingRun => run !== undefined);
  const sources = [
    ...new Set(
      latestPerIdentity
        .map((run) => run.source)
        .filter((source): source is RecallSearchSource => source !== null),
    ),
  ];
  const lastCheckedAt = latestPerIdentity[0]?.ranAt ?? runs[0]?.ranAt ?? null;

  if (input.matches.some((match) => match.status === "confirmed_match")) {
    return { status: "confirmed_match", reason: null, lastCheckedAt, sources };
  }
  if (input.matches.some((match) => match.status === "possible_match")) {
    return { status: "possible_match", reason: null, lastCheckedAt, sources };
  }

  if (input.identities.length === 0) {
    const last = runs[0];
    return {
      status: "not_checked",
      reason:
        last?.outcome === "nothing_to_match"
          ? "nothing_to_match"
          : "never_checked",
      lastCheckedAt: last?.ranAt ?? null,
      sources: [],
    };
  }

  const failed = latestPerIdentity.find((run) => run.outcome === "failed");
  if (failed !== undefined) {
    return {
      status: "not_checked",
      reason: "source_unavailable",
      lastCheckedAt: failed.ranAt,
      sources,
    };
  }
  if (latestPerIdentity.length < input.identities.length) {
    return {
      status: "not_checked",
      reason: "never_checked",
      lastCheckedAt,
      sources,
    };
  }
  return { status: "no_match", reason: null, lastCheckedAt, sources };
}
