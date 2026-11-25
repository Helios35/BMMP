import "server-only";

import { data } from "@/data";
import type {
  FilingPacketSource,
  IssuedFilingPacket,
  RequestContext,
  StorageWriteAttribution,
} from "@/data/contracts";
import {
  buildFilingPacketContent,
  type FilingPacketContent,
} from "@/domain/documents/build-filing-packet-payload";
import {
  filingPacketInputs,
  pickableYears,
  PICK_A_YEAR,
  resolveFiling,
  resolvePeriod,
  type FilingDocumentType,
  type FilingPeriodRule,
  type PeriodChoice,
  type ResolvedFiling,
} from "@/domain/producer";
import type { RuleOutcome } from "@/domain/rules/outcome";
import { civilDateInZone } from "@/domain/storage/clock-display";
import { DOCUMENT_TYPE_LABELS } from "@/domain/taxonomy/document-type";
import { composeFilingPacket } from "@/features/documents/server/compose";
import { ValidationError } from "@/lib/errors";
import type { IsoTimestamp, Uuid } from "@/types/common";

/**
 * Making a packet — Rules 8.19–8.21; `UX_SPEC.md` §3.21.
 *
 * **The adapter fetches; the domain decides; the adapter writes.** One read
 * of what the deadline's packet stands on, the filing in force today on the
 * state alone, the period Rule 8.21 names (or the year the person picked),
 * and the one builder. The dialog previews exactly what Issue would issue:
 * both run this path, and issuing re-checks on the server that nothing it
 * read has changed.
 */

export type PacketPreview =
  /** No packet: the obligation doesn't apply, can't be told, or has no filing. */
  | { readonly kind: "refused"; readonly words: string }
  /** The law names no period and no year is picked yet (Rule 8.21). */
  | {
      readonly kind: "needs_year";
      readonly heading: PacketHeading;
      readonly years: readonly number[];
      readonly words: string;
    }
  | {
      readonly kind: "ready";
      readonly heading: PacketHeading;
      /** Where the law states no period, the years the person may pick. */
      readonly years: readonly number[] | null;
      readonly content: FilingPacketContent;
    };

export interface PacketHeading {
  readonly title: string;
  readonly documentType: FilingDocumentType;
  readonly documentTypeLabel: string;
  readonly sendTo: string;
  readonly period: FilingPeriodRule;
}

function headingOf(resolved: ResolvedFiling): PacketHeading {
  return {
    title: resolved.filing.title,
    documentType: resolved.filing.documentType,
    documentTypeLabel: DOCUMENT_TYPE_LABELS[resolved.filing.documentType],
    sendTo: resolved.filing.sendTo,
    period: resolved.filing.period,
  };
}

type Built =
  | { readonly kind: "refused"; readonly words: string }
  | {
      readonly kind: "needs_year";
      readonly resolved: ResolvedFiling;
      readonly years: readonly number[];
    }
  | {
      readonly kind: "ready";
      readonly source: FilingPacketSource;
      readonly resolved: ResolvedFiling;
      readonly years: readonly number[] | null;
      readonly outcome: RuleOutcome<FilingPacketContent>;
    };

async function build(
  ctx: RequestContext,
  deadlineId: Uuid,
  at: IsoTimestamp,
  chosenYear: number | null,
): Promise<Built> {
  const source = await data.filingPackets.source(ctx, deadlineId);
  const today = civilDateInZone(at, source.timeZone);
  const resolved = resolveFiling(source, today);
  const years = pickableYears(today);

  if (chosenYear !== null && !years.includes(chosenYear)) {
    throw new ValidationError({
      userMessage: `Pick a full calendar year from ${String(years[years.length - 1])} to ${String(years[0])}.`,
      correlationId: ctx.correlationId,
      field: "year",
      context: { rule: "8.21", year: chosenYear },
    });
  }
  const choice: PeriodChoice | null =
    chosenYear === null
      ? null
      : {
          year: chosenYear,
          chosenByUserId: source.contact.userId,
          chosenByName: source.contact.name ?? source.contact.email,
        };
  const rule: FilingPeriodRule = resolved?.filing.period ?? { kind: "none" };
  const picks = rule.kind === "chosen_year" ? years : null;
  // A year is only ever taken where the law names none (Rule 8.21).
  const period = resolvePeriod(
    rule,
    source.deadline.dueOn,
    rule.kind === "chosen_year" ? choice : null,
  );

  // The obligation, the filing and the period are checked in Rule 8.19's
  // order: no packet for an obligation that doesn't apply, before anything
  // asks for a year.
  const content = buildFilingPacketContent(
    filingPacketInputs(
      source,
      resolved,
      period.ok ? period.period : { kind: "none", years: [] },
    ),
  );
  if (!content.ok) return { kind: "refused", words: content.words };
  if (resolved === null) {
    throw new Error("A packet was built with no filing on file.");
  }
  if (!period.ok) return { kind: "needs_year", resolved, years };
  return {
    kind: "ready",
    source,
    resolved,
    years: picks,
    outcome: content.outcome,
  };
}

/** What the Make packet dialog shows (UX §3.21). */
export async function readPacketPreview(
  ctx: RequestContext,
  deadlineId: Uuid,
  at: IsoTimestamp,
  chosenYear: number | null,
): Promise<PacketPreview> {
  const built = await build(ctx, deadlineId, at, chosenYear);
  switch (built.kind) {
    case "refused":
      return built;
    case "needs_year":
      return {
        kind: "needs_year",
        heading: headingOf(built.resolved),
        years: built.years,
        words: PICK_A_YEAR,
      };
    case "ready":
      return {
        kind: "ready",
        heading: headingOf(built.resolved),
        years: built.years,
        content: built.outcome.result,
      };
  }
}

/**
 * Issue Packet — one deliberate act, no draft (Rule 8.19). **It never marks
 * the deadline done.**
 */
export async function issuePacketFor(
  ctx: RequestContext,
  deadlineId: Uuid,
  at: IsoTimestamp,
  chosenYear: number | null,
  attribution: StorageWriteAttribution,
): Promise<IssuedFilingPacket> {
  const built = await build(ctx, deadlineId, at, chosenYear);
  if (built.kind !== "ready") {
    throw new ValidationError({
      userMessage: built.kind === "refused" ? built.words : PICK_A_YEAR,
      correlationId: ctx.correlationId,
      context: { rule: built.kind === "refused" ? "8.19" : "8.21" },
    });
  }
  return data.filingPackets.issue(ctx, {
    deadlineId,
    packet: built.outcome,
    compose: composeFilingPacket({
      content: built.outcome,
      timeZone: built.source.timeZone,
    }),
    at,
    attribution,
  });
}
