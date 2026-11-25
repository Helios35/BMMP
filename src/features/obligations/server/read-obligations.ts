import "server-only";

import { data } from "@/data";
import type { ProducerLastRun, RequestContext } from "@/data/contracts";
import { basisInstant } from "@/domain/hazard/words";
import {
  basisLine,
  FILING_DOCUMENT_TYPES,
  FILINGS_RULE_KEY,
  resolveFiling,
} from "@/domain/producer";
import { civilDateInZone } from "@/domain/storage/clock-display";
import { DOCUMENT_TYPE_LABELS } from "@/domain/taxonomy/document-type";
import type { IsoDate, IsoTimestamp, TimeZone, Uuid } from "@/types/common";
import type { CatalogEntry } from "@/types/catalog";
import type {
  ObligationDeadline,
  ProducerObligation,
  ProducerProduct,
  ProducerSalesRecord,
} from "@/types/producer";
import type { Jurisdiction } from "@/types/rules-as-data";

import {
  packetLinksByDeadline,
  type FilingSummary,
  type PacketLink,
} from "../packet-view";
import { obligationsReadModel, type ObligationsReadModel } from "../view";

/**
 * Everything `/obligations` shows, read through `src/data` — `UX_SPEC.md`
 * §3.21. **Nothing is decided here**: bands, statuses and dates are the runs'
 * stored rows (`../view.ts` arranges them); the rule versions are read only
 * to show the ones that take effect later (Rule 8.14).
 */

/** An engineering bound on one page's read — not a regulatory one (Rule 1.23). */
const READ_LIMIT = 2000;

export interface Option {
  readonly value: string;
  readonly label: string;
}

export interface ObligationsPage {
  readonly model: ObligationsReadModel;
  readonly today: IsoDate;
  readonly timeZone: TimeZone;
  readonly lastRun: ProducerLastRun | null;
  readonly basisLine: string;
  /** Published catalog entries not already declared — **Add product** (Rule 8.6). */
  readonly entryOptions: readonly Option[];
  /** Every state and DC, by name, with its T-40 code for the URL. */
  readonly stateOptions: readonly (Option & { readonly code: string })[];
  /** Who marked a deadline done, or recorded a sales entry, by id. */
  readonly people: ReadonlyMap<Uuid, string>;
  /** Every sales entry, replaced ones included (Rule 8.17). */
  readonly sales: readonly ProducerSalesRecord[];
  /** Each deadline's packets, newest first (Rule 8.19). */
  readonly packets: ReadonlyMap<Uuid, readonly PacketLink[]>;
  /** The filing in force today for each current obligation that has one (Rule 8.18). */
  readonly filings: ReadonlyMap<Uuid, FilingSummary>;
  /** The rows a product's plan reads (Rule 8.23). */
  readonly rows: {
    readonly jurisdictions: readonly Jurisdiction[];
    readonly products: readonly ProducerProduct[];
    readonly catalogEntries: readonly CatalogEntry[];
    readonly obligations: readonly ProducerObligation[];
    readonly deadlines: readonly ObligationDeadline[];
  };
}

/**
 * Which current obligations have a filing in force today — read from each
 * state's `producer.filings` versions, resolved on the state alone (Rules
 * 8.7, 8.18). Make packet shows on exactly these.
 */
async function filingsByObligation(
  ctx: RequestContext,
  today: IsoDate,
  jurisdictions: readonly Jurisdiction[],
  obligations: readonly ProducerObligation[],
): Promise<ReadonlyMap<Uuid, FilingSummary>> {
  const filings = new Map<Uuid, FilingSummary>();
  const stateIds = [...new Set(obligations.map((row) => row.jurisdictionId))];
  for (const jurisdictionId of stateIds) {
    const state = jurisdictions.find((row) => row.id === jurisdictionId);
    if (state === undefined) continue;
    const candidates = await data.ruleVersions.findCandidates(ctx, {
      ruleKeys: [FILINGS_RULE_KEY],
      jurisdictionId,
      asOf: today,
    });
    for (const obligation of obligations.filter(
      (row) => row.jurisdictionId === jurisdictionId,
    )) {
      const resolved = resolveFiling(
        {
          filingCandidates: candidates,
          state: { jurisdictionId, code: state.code, name: state.name },
          obligation,
        },
        today,
      );
      if (resolved !== null) {
        filings.set(obligation.id, {
          title: resolved.filing.title,
          typeLabel: DOCUMENT_TYPE_LABELS[resolved.filing.documentType],
        });
      }
    }
  }
  return filings;
}

export async function readObligationsPage(
  ctx: RequestContext,
  at: IsoTimestamp,
): Promise<ObligationsPage> {
  const [
    inputs,
    jurisdictions,
    products,
    entries,
    obligations,
    deadlines,
    configuration,
    lastRun,
    sales,
    ...packetPages
  ] = await Promise.all([
    data.producerObligations.inputs(ctx),
    data.jurisdictions.list(ctx, { level: "state", limit: READ_LIMIT }),
    data.producerProducts.list(ctx, { limit: READ_LIMIT }),
    data.catalogEntries.list(ctx, { status: "published", limit: READ_LIMIT }),
    data.producerObligations.list(ctx, { isCurrent: true, limit: READ_LIMIT }),
    data.obligationDeadlines.list(ctx, { limit: READ_LIMIT }),
    data.platformConfiguration.readObligationAlertConfiguration(ctx),
    data.producerObligations.lastRun(ctx),
    data.producerSales.list(ctx, { includeReplaced: true, limit: READ_LIMIT }),
    ...FILING_DOCUMENT_TYPES.map((documentType) =>
      data.documentRenders.list(ctx, { documentType, limit: READ_LIMIT }),
    ),
  ]);
  const timeZone = inputs.timeZone;
  const today = civilDateInZone(at, timeZone);
  const filings = await filingsByObligation(
    ctx,
    today,
    jurisdictions.items,
    obligations.items,
  );

  const model = obligationsReadModel({
    today,
    configuration,
    jurisdictions: jurisdictions.items,
    products: products.items,
    catalogEntries: entries.items,
    obligations: obligations.items,
    deadlines: deadlines.items,
    candidates: inputs.evaluation.candidates,
  });

  const declared = new Set(products.items.map((row) => row.catalogEntryId));
  const entryOptions = entries.items
    .filter((entry) => !declared.has(entry.id))
    .map((entry) => ({
      value: entry.id,
      label: `${entry.brandName ?? entry.manufacturerName}${entry.modelName === null ? "" : ` ${entry.modelName}`} — ${entry.manufacturerName}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const stateOptions = jurisdictions.items
    .map((row) => ({ value: row.id, label: row.name, code: row.code }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const people = new Map<Uuid, string>();
  for (const id of new Set([
    ...deadlines.items.flatMap((row) =>
      row.completedBy === null ? [] : [row.completedBy],
    ),
    ...sales.items.map((row) => row.recordedBy),
  ])) {
    const user = await data.users.get(ctx, id);
    if (user !== null) people.set(id, user.fullName ?? user.email);
  }
  const packets = packetLinksByDeadline(
    packetPages.flatMap((page) => page.items),
    timeZone,
  );

  return {
    model,
    today,
    timeZone,
    lastRun,
    basisLine: basisLine(
      lastRun === null ? null : basisInstant(lastRun.at, timeZone),
    ),
    entryOptions,
    stateOptions,
    people,
    sales: sales.items,
    packets,
    filings,
    rows: {
      jurisdictions: jurisdictions.items,
      products: products.items,
      catalogEntries: entries.items,
      obligations: obligations.items,
      deadlines: deadlines.items,
    },
  };
}
