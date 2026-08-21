import { describe, expect, it } from "vitest";

import { decodeListQuery } from "@/components/record-table/list-url";
import { FORMAT_CATEGORIES } from "@/domain/taxonomy/format-category";
import {
  catalogFilters,
  catalogQueryFrom,
  catalogQuerySpec,
  CATALOG_FILTER_IDS,
} from "./list-query";

/**
 * `/catalog`'s URL contract — `SITE_ARCHITECTURE.md` §7.4.
 *
 * Two things are load-bearing here and neither is cosmetic. **The form-factor
 * filter is T-04 and never T-06**, because a `format_category` filter would
 * assert one organisation-wide format band for a record that carries several
 * (Rule 3.5). And **a value the URL carries that no taxonomy authors never
 * reaches the adapter**, so a stale bookmark opens the list rather than
 * filtering it to nothing.
 */

const MANUFACTURERS = ["Northvale Cell Systems", "Ridgeline Mobility"];

function decode(params: Record<string, string>) {
  return decodeListQuery(params, catalogQuerySpec(MANUFACTURERS));
}

describe("catalogFilters", () => {
  it("offers small mobility because T-02 declares it", () => {
    const classFilter = catalogFilters(MANUFACTURERS).find(
      (filter) => filter.id === CATALOG_FILTER_IDS.applicationClass,
    );

    expect(classFilter?.options.map((option) => option.value)).toContain(
      "small_mobility",
    );
  });

  it("builds the form-factor filter from T-04 and from nothing in T-06", () => {
    const formFactor = catalogFilters(MANUFACTURERS).find(
      (filter) => filter.id === CATALOG_FILTER_IDS.cellFormFactor,
    );
    const values = formFactor?.options.map((option) => option.value) ?? [];

    expect(values).toContain("prismatic");
    for (const band of FORMAT_CATEGORIES) {
      expect(values).not.toContain(band);
    }
  });
});

describe("catalogQueryFrom", () => {
  it("asks for published entries only, whatever the URL says", () => {
    // T-07 — only a published entry is available for matching, and it is not a
    // filter a reader can turn off.
    expect(catalogQueryFrom(decode({ status: "proposed" })).status).toBe(
      "published",
    );
  });

  it("defaults to manufacturer, ascending", () => {
    const query = catalogQueryFrom(decode({}));

    expect(query.sortBy).toBe("manufacturerName");
    expect(query.sortDirection).toBe("asc");
  });

  it("carries a filter the taxonomy authors", () => {
    const query = catalogQueryFrom(
      decode({
        [CATALOG_FILTER_IDS.chemistry]: "lead_acid_sealed",
        [CATALOG_FILTER_IDS.applicationClass]: "small_mobility",
      }),
    );

    expect(query.chemistry).toBe("lead_acid_sealed");
    expect(query.applicationClass).toBe("small_mobility");
  });

  it("drops a value no taxonomy authors rather than sending it on", () => {
    const query = catalogQueryFrom(
      decode({
        [CATALOG_FILTER_IDS.chemistry]: "retired_in_a_later_version",
        [CATALOG_FILTER_IDS.cellFormFactor]: "medium_format",
      }),
    );

    expect(query.chemistry).toBeUndefined();
    expect(query.cellFormFactor).toBeUndefined();
  });

  it("drops a manufacturer this tenant cannot reach", () => {
    const query = catalogQueryFrom(
      decode({
        [CATALOG_FILTER_IDS.manufacturer]: "Another Tenant's Supplier",
      }),
    );

    expect(query.manufacturerName).toBeUndefined();
  });

  it("passes the search through as the adapter's search", () => {
    expect(catalogQueryFrom(decode({ q: "  RM-24V50  " })).search).toBe(
      "RM-24V50",
    );
  });
});
