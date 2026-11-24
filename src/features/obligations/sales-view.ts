import { basisInstant } from "@/domain/hazard/words";
import type { TimeZone, Uuid } from "@/types/common";
import type { CatalogEntry } from "@/types/catalog";
import type { ProducerProduct, ProducerSalesRecord } from "@/types/producer";

import type { StateLabel } from "./view";

/**
 * The Sales tab's read model — `UX_SPEC.md` §3.21; Rule 8.17.
 *
 * **One row per product and state it is declared in**, for the year in the
 * URL: the current entry, or "Not on file" — **a missing entry is a gap,
 * never zero**, and zero is an entry someone typed. A replaced entry is kept
 * and listed under the entry that replaced it, marked replaced. Nothing here
 * decides a number; it arranges the stored entries for reading.
 */

export interface SalesEntryView {
  readonly id: Uuid;
  readonly units: number;
  /** "37,250" — grouped, never a decimal. */
  readonly unitsText: string;
  readonly basisNote: string;
  readonly recordedBy: string;
  readonly recordedAtText: string;
}

export interface SalesRowView {
  /** Unique within the table. */
  readonly key: string;
  readonly productId: Uuid;
  readonly productLabel: string;
  readonly state: StateLabel;
  readonly year: number;
  /** `null` reads "Not on file" (Rule 8.20). */
  readonly entry: SalesEntryView | null;
  /** A replaced entry, kept and shown as replaced (Rule 8.17). */
  readonly replaced: boolean;
  readonly replacedAtText: string | null;
}

function productLabelOf(entry: CatalogEntry): string {
  const maker = entry.brandName ?? entry.manufacturerName;
  return entry.modelName === null ? maker : `${maker} ${entry.modelName}`;
}

function unitsText(units: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    units,
  );
}

export function salesReadModel(input: {
  readonly year: number;
  readonly timeZone: TimeZone;
  readonly products: readonly ProducerProduct[];
  readonly catalogEntries: readonly CatalogEntry[];
  readonly states: ReadonlyMap<Uuid, StateLabel>;
  /** This year's entries, replaced ones included. */
  readonly sales: readonly ProducerSalesRecord[];
  readonly people: ReadonlyMap<Uuid, string>;
}): readonly SalesRowView[] {
  const entries = new Map(input.catalogEntries.map((row) => [row.id, row]));
  const view = (row: ProducerSalesRecord): SalesEntryView => ({
    id: row.id,
    units: row.units,
    unitsText: unitsText(row.units),
    basisNote: row.basisNote,
    recordedBy: input.people.get(row.recordedBy) ?? "a member",
    recordedAtText: basisInstant(row.recordedAt, input.timeZone),
  });
  const rows: SalesRowView[] = [];
  const products = input.products
    .flatMap((product) => {
      const entry = entries.get(product.catalogEntryId);
      return entry === undefined
        ? []
        : [{ product, label: productLabelOf(entry) }];
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  for (const { product, label } of products) {
    const states = product.jurisdictionIds
      .flatMap((id) => {
        const state = input.states.get(id);
        return state === undefined ? [] : [state];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const state of states) {
      const mine = input.sales.filter(
        (row) =>
          row.producerProductId === product.id &&
          row.jurisdictionId === state.jurisdictionId &&
          row.year === input.year,
      );
      const current = mine.find((row) => row.supersededById === null) ?? null;
      rows.push({
        key: `${product.id}:${state.jurisdictionId}`,
        productId: product.id,
        productLabel: label,
        state,
        year: input.year,
        entry: current === null ? null : view(current),
        replaced: false,
        replacedAtText: null,
      });
      for (const old of mine
        .filter((row) => row.supersededById !== null)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))) {
        rows.push({
          key: old.id,
          productId: product.id,
          productLabel: label,
          state,
          year: input.year,
          entry: view(old),
          replaced: true,
          replacedAtText:
            old.supersededAt === null
              ? null
              : basisInstant(old.supersededAt, input.timeZone),
        });
      }
    }
  }
  return rows;
}

/** The years the Sales tab offers: the default and the four before it, and any year on file. */
export function salesYears(
  latest: number,
  onFile: readonly number[],
): readonly number[] {
  const years = new Set<number>(onFile.filter((year) => year <= latest));
  for (let offset = 0; offset < 5; offset += 1) years.add(latest - offset);
  return [...years].sort((a, b) => b - a);
}

/** "Recording again is a correction" — what the dialog says when an entry exists. */
export function correctionWords(current: SalesEntryView): string {
  return `${current.unitsText} units are on file, recorded by ${current.recordedBy} ${current.recordedAtText}. Recording again replaces that entry; it is kept and shown as replaced.`;
}
