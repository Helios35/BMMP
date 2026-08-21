import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  clearNarrowingHref,
  decodeListQuery,
  encodeListQuery,
  isNarrowed,
  LIST_QUERY_KEYS,
  SEARCH_MAX_LENGTH,
  toPageRequest,
  type ListQuerySpec,
} from "@/components/record-table/list-url";

/**
 * The list-view URL contract — `SITE_ARCHITECTURE.md` §7.4, one test per rule.
 *
 * This is the shared surface behind six routes across four units. A link a
 * warehouse user sends a colleague, and the link an audit row uses to point at
 * the exact view it describes, are both this codec's output.
 */

const SPEC: ListQuerySpec = {
  sortableColumnIds: ["code", "receivedAt"],
  defaultSort: "receivedAt",
  defaultDir: "desc",
  filterIds: ["status", "site"],
  filterValues: { status: ["stored", "shipped"], site: ["tacoma", "kent"] },
  tabIds: ["all", "mine"],
  defaultTab: "all",
};

const BASE = "/batteries";

describe("decoding", () => {
  it("resolves an empty URL to the spec's defaults", () => {
    const query = decodeListQuery({}, SPEC);
    expect(query).toEqual({
      q: null,
      sort: "receivedAt",
      dir: "desc",
      page: 1,
      perPage: 25,
      tab: "all",
      filters: {},
      passthrough: {},
    });
  });

  it("trims, collapses and caps the search text", () => {
    expect(decodeListQuery({ q: "  swollen   laptop " }, SPEC).q).toBe(
      "swollen laptop",
    );
    expect(decodeListQuery({ q: "   " }, SPEC).q).toBeNull();
    expect(decodeListQuery({ q: "x".repeat(400) }, SPEC).q).toHaveLength(
      SEARCH_MAX_LENGTH,
    );
  });

  it("falls back to the default on every invalid value rather than erroring", () => {
    // Rule 2. A stale link — a removed filter value, a renamed column, a hand
    // edited page number — still opens the list.
    const query = decodeListQuery(
      {
        sort: "columnThatWasRemoved",
        dir: "sideways",
        page: "-4",
        perPage: "7",
        tab: "not-a-tab",
        status: "a_value_no_longer_offered",
      },
      SPEC,
    );
    expect(query.sort).toBe("receivedAt");
    expect(query.dir).toBe("desc");
    expect(query.page).toBe(1);
    expect(query.perPage).toBe(25);
    expect(query.tab).toBe("all");
    expect(query.filters).toEqual({});
  });

  it("keeps parameters it does not own", () => {
    // Rule 3. A future parameter has to survive a sort click without every route
    // remembering to forward it.
    const query = decodeListQuery({ highlight: "abc", q: "drum" }, SPEC);
    expect(query.passthrough).toEqual({ highlight: "abc" });
  });

  it("reads only declared filters", () => {
    const query = decodeListQuery({ status: "stored", chemistry: "lfp" }, SPEC);
    expect(query.filters).toEqual({ status: "stored" });
    expect(query.passthrough).toEqual({ chemistry: "lfp" });
    expect(activeFilterCount(query)).toBe(1);
    expect(isNarrowed(query)).toBe(true);
  });

  it("refuses a filter id that collides with a reserved key", () => {
    // Rule 5. Filter ids are authored constants, so this can only fail in code —
    // and a filter silently overwriting the page number is worse than a throw.
    for (const reserved of LIST_QUERY_KEYS) {
      expect(() =>
        decodeListQuery({}, { ...SPEC, filterIds: [reserved] }),
      ).toThrow(/reserved/i);
    }
  });
});

describe("encoding", () => {
  const DEFAULTS = decodeListQuery({}, SPEC);

  it("omits every parameter that is at its default", () => {
    // Rule 1. `?page=1` never appears, and "is this the default view?" is one
    // check rather than a diff.
    expect(encodeListQuery(BASE, DEFAULTS, {}, SPEC)).toBe(BASE);
    expect(encodeListQuery(BASE, DEFAULTS, { page: 1 }, SPEC)).toBe(BASE);
    expect(encodeListQuery(BASE, DEFAULTS, { tab: "all" }, SPEC)).toBe(BASE);
  });

  it("writes only what differs", () => {
    expect(
      encodeListQuery(BASE, DEFAULTS, { sort: "code", dir: "asc" }, SPEC),
    ).toBe("/batteries?sort=code&dir=asc");
    expect(encodeListQuery(BASE, DEFAULTS, { page: 4 }, SPEC)).toBe(
      "/batteries?page=4",
    );
  });

  it("resets the page when the search changes", () => {
    // Rule 4. Page 4 of a different result set is not the page you were reading.
    const onPageFour = decodeListQuery({ page: "4" }, SPEC);
    expect(encodeListQuery(BASE, onPageFour, { q: "drum" }, SPEC)).toBe(
      "/batteries?q=drum",
    );
  });

  it("resets the page when a filter or the page size changes", () => {
    const onPageFour = decodeListQuery({ page: "4" }, SPEC);
    expect(
      encodeListQuery(
        BASE,
        onPageFour,
        { filters: { status: "stored" } },
        SPEC,
      ),
    ).toBe("/batteries?status=stored");
    expect(encodeListQuery(BASE, onPageFour, { perPage: 50 }, SPEC)).toBe(
      "/batteries?perPage=50",
    );
  });

  it("resets the page when the sort changes", () => {
    const onPageFour = decodeListQuery({ page: "4" }, SPEC);
    expect(encodeListQuery(BASE, onPageFour, { sort: "code" }, SPEC)).toBe(
      "/batteries?sort=code",
    );
  });

  it("keeps the page when the page itself is what changed", () => {
    const onPageFour = decodeListQuery({ page: "4" }, SPEC);
    expect(encodeListQuery(BASE, onPageFour, { page: 5 }, SPEC)).toBe(
      "/batteries?page=5",
    );
  });

  it("resets page, sort, direction and every filter when the tab changes", () => {
    // A tab is a different question, not a narrower answer.
    const narrowed = decodeListQuery(
      { page: "3", sort: "code", dir: "asc", status: "stored", q: "drum" },
      SPEC,
    );
    expect(encodeListQuery(BASE, narrowed, { tab: "mine" }, SPEC)).toBe(
      "/batteries?q=drum&tab=mine",
    );
  });

  it("carries unknown parameters through every link it builds", () => {
    const withExtra = decodeListQuery({ highlight: "abc" }, SPEC);
    expect(encodeListQuery(BASE, withExtra, { sort: "code" }, SPEC)).toBe(
      "/batteries?sort=code&highlight=abc",
    );
  });

  it("clears the narrowing while keeping sort, direction and tab", () => {
    const narrowed = decodeListQuery(
      {
        q: "drum",
        status: "stored",
        sort: "code",
        dir: "asc",
        tab: "mine",
        page: "3",
      },
      SPEC,
    );
    expect(clearNarrowingHref(BASE, narrowed, SPEC)).toBe(
      "/batteries?sort=code&dir=asc&tab=mine",
    );
  });

  it("round-trips: what it writes is what decoding reads back", () => {
    const narrowed = decodeListQuery(
      { q: "drum", status: "stored", sort: "code", dir: "asc", page: "3" },
      SPEC,
    );
    const href = encodeListQuery(BASE, narrowed, { page: 3 }, SPEC);
    const params = Object.fromEntries(
      new URLSearchParams(href.split("?")[1] ?? ""),
    );
    expect(decodeListQuery(params, SPEC)).toEqual(narrowed);
  });
});

describe("the adapter request", () => {
  it("asks for a page by offset, never by reading the mock's cursor", () => {
    // A cursor cannot express "jump to page 4". Depending on the mock's cursor
    // happening to be a stringified offset is the seam leaking (D-16, D-19).
    const query = decodeListQuery({ page: "4", perPage: "50" }, SPEC);
    expect(toPageRequest(query)).toEqual({ limit: 50, offset: 150 });
    expect(toPageRequest(decodeListQuery({}, SPEC))).toEqual({
      limit: 25,
      offset: 0,
    });
  });

  it("never sends a cursor alongside an offset", () => {
    expect(toPageRequest(decodeListQuery({}, SPEC)).cursor).toBeUndefined();
  });
});
