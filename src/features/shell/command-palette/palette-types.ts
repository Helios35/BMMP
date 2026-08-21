/**
 * What the command palette renders — `UX_SPEC.md` §2.14.
 *
 * Plain serialisable data. The palette is a client component and receives
 * results that have already been role-filtered on the server, so nothing here
 * carries a capability, a role or a `RequestContext` (§5.3(3)).
 */

export type PaletteGroupId = "pages" | "batteries" | "catalog";
// b1a-04 adds "containers"; b1a-05 adds "shipments". Each is an id here, a
// heading below, and one scope in `search-command-palette.ts` — the role filter
// there already covers them.

export interface PaletteResult {
  readonly id: string;
  readonly group: PaletteGroupId;
  /** Primary line. */
  readonly label: string;
  /** Secondary line — a record number, a part number, a manufacturer. */
  readonly detail?: string;
  /** IDs, serials, part numbers and date codes render in the `mono` token (§1.3). */
  readonly detailIsMono?: boolean;
  readonly href: string;
}

export interface PaletteGroup {
  readonly group: PaletteGroupId;
  readonly heading: string;
  readonly results: readonly PaletteResult[];
}

export interface PaletteResults {
  readonly query: string;
  readonly groups: readonly PaletteGroup[];
}

/** Group headings, and the order groups render in. An empty group is not rendered. */
export const PALETTE_GROUP_HEADINGS: Readonly<Record<PaletteGroupId, string>> =
  {
    pages: "Pages",
    batteries: "Battery records",
    catalog: "Catalog",
  };

export const PALETTE_GROUP_ORDER: readonly PaletteGroupId[] = [
  "pages",
  "batteries",
  "catalog",
];

/** At most five per group and twenty overall. A longer answer belongs in the list route. */
export const PALETTE_RESULTS_PER_GROUP = 5;

/** Below this the server is not called — only the local `pages` filter runs (§10.3). */
export const PALETTE_MINIMUM_QUERY_LENGTH = 2;

/** Matches `RecordTable`'s search. One debounce in the product is better than two. */
export const PALETTE_DEBOUNCE_MS = 250;
