import type { PageRequest } from "@/data/contracts/repository";

/**
 * The list-view URL contract — `SITE_ARCHITECTURE.md` §7.4.
 *
 * **Filter, sort, page and tab state lives in the URL.** A warehouse user sends
 * a colleague a link and the colleague sees the same list; an audit row
 * deep-links into the exact view it describes; a lost connection restores a
 * page. None of that is true of state held in a component.
 *
 * `RecordTable` owns this contract so that all six routes read and write it
 * through one module. A route decodes once, on the server, passes the decoded
 * query to the adapter and passes the same object back into the table
 * (rule 7) — the table never re-reads `useSearchParams`.
 *
 * This module is deliberately free of React and of `next/navigation`: it is
 * string in, string out, so both the server render and the client islands build
 * identical hrefs.
 */

/** The keys this codec owns. A filter may not be named one of these. */
export const LIST_QUERY_KEYS = [
  "q",
  "sort",
  "dir",
  "page",
  "perPage",
  "tab",
] as const;

export type ListQueryKey = (typeof LIST_QUERY_KEYS)[number];

export type SortDirection = "asc" | "desc";

/** Free text is trimmed, collapsed and capped before it ever reaches an adapter. */
export const SEARCH_MAX_LENGTH = 120;

export const DEFAULT_PER_PAGE_OPTIONS = [25, 50, 100] as const;

export interface ListQuery {
  readonly q: string | null;
  /**
   * The **effective** sortable column id, already resolved against the spec —
   * so the header knows which column carries the indicator without re-deriving
   * the default. `null` only where the spec declares no default sort.
   */
  readonly sort: string | null;
  readonly dir: SortDirection | null;
  /** 1-based, always ≥ 1. */
  readonly page: number;
  readonly perPage: number;
  readonly tab: string | null;
  readonly filters: Readonly<Record<string, string>>;
  /**
   * Every parameter the codec does not own, carried through verbatim (rule 3).
   *
   * Decoding captures them so a future parameter survives a sort click without
   * any route having to remember to forward it.
   */
  readonly passthrough: Readonly<Record<string, string>>;
}

export interface ListQuerySpec {
  readonly sortableColumnIds: readonly string[];
  readonly defaultSort: string;
  readonly defaultDir: SortDirection;
  readonly filterIds: readonly string[];
  /**
   * The permitted values per filter id, where the route knows them.
   *
   * Optional because a filter's options are a presentation concern; supply it
   * and a stale link carrying a removed value falls back to "any" and is dropped
   * from the canonical URL (rule 2) instead of being sent to the adapter.
   */
  readonly filterValues?: Readonly<Record<string, readonly string[]>>;
  readonly tabIds?: readonly string[];
  readonly defaultTab?: string;
  readonly perPageOptions?: readonly number[];
}

type RawSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

const RESERVED: ReadonlySet<string> = new Set<string>(LIST_QUERY_KEYS);

/**
 * A filter id may not collide with a key the codec owns (rule 5).
 *
 * Filter ids are authored constants, never user input, so this can only fail in
 * code and failing loudly at the first render is cheaper than a filter that
 * silently overwrites the page number.
 */
function assertFilterIds(spec: ListQuerySpec): void {
  for (const id of spec.filterIds) {
    if (RESERVED.has(id)) {
      throw new Error(
        `Filter id "${id}" collides with a reserved list-query key. SITE_ARCHITECTURE.md §7.4.`,
      );
    }
  }
}

function firstValue(
  value: string | readonly string[] | undefined,
): string | null {
  if (value === undefined) return null;
  const raw = Array.isArray(value) ? value[0] : (value as string);
  if (typeof raw !== "string") return null;
  return raw;
}

/** Trimmed, whitespace-collapsed and capped. Empty becomes absent. */
export function normalizeSearch(raw: string | null): string | null {
  if (raw === null) return null;
  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (collapsed === "") return null;
  return collapsed.slice(0, SEARCH_MAX_LENGTH);
}

export function perPageOptionsFor(spec: ListQuerySpec): readonly number[] {
  const options = spec.perPageOptions ?? DEFAULT_PER_PAGE_OPTIONS;
  return options.length > 0 ? options : DEFAULT_PER_PAGE_OPTIONS;
}

function defaultPerPage(spec: ListQuerySpec): number {
  return perPageOptionsFor(spec)[0] as number;
}

function defaultTab(spec: ListQuerySpec): string | null {
  if (spec.defaultTab !== undefined) return spec.defaultTab;
  return spec.tabIds !== undefined && spec.tabIds.length > 0
    ? (spec.tabIds[0] as string)
    : null;
}

/**
 * Read the URL into the one shape everything downstream uses.
 *
 * **An invalid value never crashes and never renders an error page** (rule 2).
 * It falls back to the default and is dropped from the canonical URL, so a
 * bookmarked link to a filter value that has since been removed still opens the
 * list.
 */
export function decodeListQuery(
  searchParams: RawSearchParams,
  spec: ListQuerySpec,
): ListQuery {
  assertFilterIds(spec);

  const q = normalizeSearch(firstValue(searchParams.q));

  const rawSort = firstValue(searchParams.sort);
  const sort =
    rawSort !== null && spec.sortableColumnIds.includes(rawSort)
      ? rawSort
      : spec.defaultSort === ""
        ? null
        : spec.defaultSort;

  const rawDir = firstValue(searchParams.dir);
  const dir: SortDirection | null =
    sort === null
      ? null
      : rawDir === "asc" || rawDir === "desc"
        ? rawDir
        : spec.defaultDir;

  const rawPage = firstValue(searchParams.page);
  const parsedPage =
    rawPage === null ? Number.NaN : Number.parseInt(rawPage, 10);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const options = perPageOptionsFor(spec);
  const rawPerPage = firstValue(searchParams.perPage);
  const parsedPerPage =
    rawPerPage === null ? Number.NaN : Number.parseInt(rawPerPage, 10);
  const perPage = options.includes(parsedPerPage)
    ? parsedPerPage
    : defaultPerPage(spec);

  const rawTab = firstValue(searchParams.tab);
  const tab =
    rawTab !== null && (spec.tabIds ?? []).includes(rawTab)
      ? rawTab
      : defaultTab(spec);

  const filters: Record<string, string> = {};
  for (const id of spec.filterIds) {
    const value = firstValue(searchParams[id]);
    if (value === null || value === "") continue;
    const permitted = spec.filterValues?.[id];
    if (permitted !== undefined && !permitted.includes(value)) continue;
    filters[id] = value;
  }

  const passthrough: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (RESERVED.has(key) || spec.filterIds.includes(key)) continue;
    const single = firstValue(value);
    if (single === null) continue;
    passthrough[key] = single;
  }

  return { q, sort, dir, page, perPage, tab, filters, passthrough };
}

function sameFilters(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

/**
 * The href for `current` with `patch` applied.
 *
 * Two rules do the work. **A parameter at its default is omitted, never
 * written** (rule 1), so `?page=1` never appears and a shared link stays short.
 * And **the narrowing controls reset the page** (rule 4): changing the search,
 * a filter or the page size takes you to page 1, because page 4 of a different
 * result set is not the page you were looking at. Changing the **tab** resets
 * the page, the sort and every filter — a tab is a different question, not a
 * narrower answer.
 */
export function encodeListQuery(
  basePath: string,
  current: ListQuery,
  patch: Partial<ListQuery>,
  spec: ListQuerySpec,
  passthrough?: Readonly<Record<string, string>>,
): string {
  assertFilterIds(spec);

  const merged: ListQuery = {
    ...current,
    ...patch,
    filters: patch.filters ?? current.filters,
    passthrough: passthrough ?? patch.passthrough ?? current.passthrough,
  };

  const next = applyResets(current, patch, merged);

  const params = new URLSearchParams();

  if (next.q !== null) params.set("q", next.q);
  if (next.sort !== null && next.sort !== spec.defaultSort) {
    params.set("sort", next.sort);
  }
  if (next.dir !== null && next.dir !== spec.defaultDir) {
    params.set("dir", next.dir);
  }
  if (next.page > 1) params.set("page", String(next.page));
  if (next.perPage !== defaultPerPage(spec)) {
    params.set("perPage", String(next.perPage));
  }
  if (next.tab !== null && next.tab !== defaultTab(spec)) {
    params.set("tab", next.tab);
  }
  for (const id of spec.filterIds) {
    const value = next.filters[id];
    if (value !== undefined && value !== "") params.set(id, value);
  }
  for (const key of Object.keys(next.passthrough).sort()) {
    const value = next.passthrough[key];
    if (value !== undefined && value !== "") params.set(key, value);
  }

  const queryString = params.toString();
  return queryString === "" ? basePath : `${basePath}?${queryString}`;
}

function applyResets(
  current: ListQuery,
  patch: Partial<ListQuery>,
  merged: ListQuery,
): ListQuery {
  if (merged.tab !== current.tab) {
    return { ...merged, page: 1, sort: null, dir: null, filters: {} };
  }
  const narrowingChanged =
    merged.q !== current.q ||
    merged.perPage !== current.perPage ||
    merged.sort !== current.sort ||
    merged.dir !== current.dir ||
    !sameFilters(merged.filters, current.filters);
  // An explicit page in the patch is a pager click and wins; anything else that
  // changes the result set sends the reader back to the first page.
  if (narrowingChanged && patch.page === undefined) {
    return { ...merged, page: 1 };
  }
  return merged;
}

/**
 * The adapter's page request for this view.
 *
 * Offset rather than cursor, because a numbered pager has to be able to jump.
 * See `PageRequest.offset` — the mock slices from it and Supabase implements it
 * with `.range()`, so the same URL produces the same page on both adapters.
 */
export function toPageRequest(query: ListQuery): PageRequest {
  return { limit: query.perPage, offset: (query.page - 1) * query.perPage };
}

/** True when the reader has narrowed the list rather than simply opened it. */
export function isNarrowed(query: ListQuery): boolean {
  return query.q !== null || Object.keys(query.filters).length > 0;
}

/** The number of active filters — the count on the mobile **Filters** button. */
export function activeFilterCount(query: ListQuery): number {
  return Object.keys(query.filters).length;
}

/** The href that clears the narrowing while keeping sort, direction and tab. */
export function clearNarrowingHref(
  basePath: string,
  query: ListQuery,
  spec: ListQuerySpec,
): string {
  return encodeListQuery(basePath, query, { q: null, filters: {} }, spec);
}
