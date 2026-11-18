import "server-only";

import { data } from "@/data";
import type { ProducerLastRun, RequestContext } from "@/data/contracts";
import { basisInstant } from "@/domain/hazard/words";
import { basisLine } from "@/domain/producer";
import { civilDateInZone } from "@/domain/storage/clock-display";
import type { IsoDate, IsoTimestamp, TimeZone, Uuid } from "@/types/common";

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
  /** Who marked a deadline done, by id. */
  readonly people: ReadonlyMap<Uuid, string>;
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
  ] = await Promise.all([
    data.producerObligations.inputs(ctx),
    data.jurisdictions.list(ctx, { level: "state", limit: READ_LIMIT }),
    data.producerProducts.list(ctx, { limit: READ_LIMIT }),
    data.catalogEntries.list(ctx, { status: "published", limit: READ_LIMIT }),
    data.producerObligations.list(ctx, { isCurrent: true, limit: READ_LIMIT }),
    data.obligationDeadlines.list(ctx, { limit: READ_LIMIT }),
    data.platformConfiguration.readObligationAlertConfiguration(ctx),
    data.producerObligations.lastRun(ctx),
  ]);
  const timeZone = inputs.timeZone;
  const today = civilDateInZone(at, timeZone);

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
  for (const id of new Set(
    deadlines.items.flatMap((row) =>
      row.completedBy === null ? [] : [row.completedBy],
    ),
  )) {
    const user = await data.users.get(ctx, id);
    if (user !== null) people.set(id, user.fullName ?? user.email);
  }

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
  };
}
