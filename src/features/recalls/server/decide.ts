import { data } from "@/data";
import type {
  RecallDecided,
  ReclassificationWrite,
  RequestContext,
} from "@/data/contracts";
import type { StorageWriteAttribution } from "@/data/contracts/storage";
import type { RecallRecordingSource } from "@/domain/recalls/hit";
import {
  holdsRecalledFlag,
  prohibitsAir,
  withRecalledFlag,
} from "@/domain/recalls/recalled-flag";
import type { DdrFlag } from "@/domain/taxonomy/ddr-flag";
import {
  planReclassification,
  resolveClassificationRule,
} from "@/features/battery-record/server/reclassify";
import { ConflictError, NotFoundError } from "@/lib/errors";
import type { BatteryRecord } from "@/types/battery-record";
import type { IsoTimestamp, Uuid } from "@/types/common";
import type { RecallMatch } from "@/types/condition";

import {
  assertCheckable,
  readCheckSubject,
  RECALLS_PER_RECORD_LIMIT,
} from "./check";

/**
 * Deciding a recall — Rules 6.23, 6.24, 10.14–10.16; D-73 #4, #7.
 *
 * **A confirmed recall is handled exactly like damage**: the `recalled` flag
 * is set and air prohibited, quarantine routing becomes a required action,
 * a re-classification check runs, and Rule 6.14 holds any open air shipment —
 * all inside the one operation `src/data` writes. This module computes the
 * one piece that needs the domain and the rules: the re-classification, from
 * the flags the decision will leave (`planReclassification`, the function
 * `reclassifyRecord` writes from), handed to the decision so every role that
 * may decide — P2 included — re-classifies alike.
 *
 * **Withdrawing is not a route around Rule 6.7.** `recalled` clears only when
 * no confirmed recall remains, air only when the damage assessment is clear
 * too, and the record is never moved out of quarantine here (Rule 10.16).
 */

function sameFlags(a: readonly DdrFlag[], b: readonly DdrFlag[]): boolean {
  return a.length === b.length && a.every((flag) => b.includes(flag));
}

async function matchesOf(
  ctx: RequestContext,
  recordId: Uuid,
): Promise<readonly RecallMatch[]> {
  const page = await data.recalls.listMatches(ctx, {
    batteryRecordId: recordId,
    limit: RECALLS_PER_RECORD_LIMIT,
  });
  return page.items;
}

function matchOn(
  ctx: RequestContext,
  matches: readonly RecallMatch[],
  matchId: Uuid,
): RecallMatch {
  const match = matches.find((row) => row.id === matchId);
  if (match === undefined) {
    throw new NotFoundError({
      userMessage: "This recall is not on the record. Refresh the record.",
      correlationId: ctx.correlationId,
      context: { entity: "recall_match", id: matchId },
    });
  }
  return match;
}

/** The re-classification a change to `recalled` causes, or null where the flags stand. */
async function reclassificationFor(
  ctx: RequestContext,
  record: BatteryRecord,
  recalled: boolean,
  at: IsoTimestamp,
): Promise<ReclassificationWrite | null> {
  const flags = withRecalledFlag(record.ddrFlags, recalled);
  if (sameFlags(flags, record.ddrFlags)) return null;
  const next: BatteryRecord = {
    ...record,
    ddrFlags: flags,
    isAirTransportProhibited: prohibitsAir(flags),
  };
  const rule = await resolveClassificationRule(ctx, record, at);
  const plan = await planReclassification(ctx, {
    record: next,
    rule,
    at,
    trigger: "recall_change",
  });
  // Rule 3.10 — no rule in force means no decision and no default; the
  // record keeps the classification it had, and the flag still moves.
  return plan.kind === "unresolved" ? null : plan.write;
}

export async function confirmRecallMatchFor(
  ctx: RequestContext,
  input: { readonly recordId: Uuid; readonly matchId: Uuid },
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<RecallDecided> {
  const { record } = await readCheckSubject(ctx, input.recordId);
  assertCheckable(ctx, record);
  const match = matchOn(ctx, await matchesOf(ctx, record.id), input.matchId);
  if (match.status !== "possible_match") {
    throw new ConflictError({
      userMessage:
        "This match was already decided. Refresh the record to see how.",
      correlationId: ctx.correlationId,
      context: { status: match.status },
    });
  }
  return data.recalls.confirm(ctx, {
    matchId: match.id,
    reclassification: await reclassificationFor(ctx, record, true, at),
    at,
    attribution,
  });
}

/** Dismiss a possible match, or withdraw a confirmed one — the row says which. */
export async function dismissRecallMatchFor(
  ctx: RequestContext,
  input: {
    readonly recordId: Uuid;
    readonly matchId: Uuid;
    readonly reason: string;
  },
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<RecallDecided> {
  const { record } = await readCheckSubject(ctx, input.recordId);
  assertCheckable(ctx, record);
  const matches = await matchesOf(ctx, record.id);
  const match = matchOn(ctx, matches, input.matchId);
  const remaining = matches.map((row) =>
    row.id === match.id ? { ...row, status: "dismissed" as const } : row,
  );
  return data.recalls.dismiss(ctx, {
    matchId: match.id,
    reason: input.reason,
    reclassification: await reclassificationFor(
      ctx,
      record,
      holdsRecalledFlag(remaining),
      at,
    ),
    at,
    attribution,
  });
}

export async function recordRecallFor(
  ctx: RequestContext,
  input: {
    readonly recordId: Uuid;
    readonly source: RecallRecordingSource;
    readonly reference: string;
    readonly title: string | null;
  },
  at: IsoTimestamp,
  attribution: StorageWriteAttribution,
): Promise<RecallDecided> {
  const { record } = await readCheckSubject(ctx, input.recordId);
  assertCheckable(ctx, record);
  return data.recalls.record(ctx, {
    batteryRecordId: record.id,
    source: input.source,
    reference: input.reference,
    title: input.title,
    reclassification: await reclassificationFor(ctx, record, true, at),
    at,
    attribution,
  });
}
