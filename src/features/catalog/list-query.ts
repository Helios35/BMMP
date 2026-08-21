import type { ListQuery, ListQuerySpec, RecordTableFilter } from "@/components";
import type { CatalogEntrySortField, CatalogQuery } from "@/data/contracts";
import {
  APPLICATION_CLASSES,
  APPLICATION_CLASS_LABELS,
} from "@/domain/taxonomy/application-class";
import {
  CELL_FORM_FACTORS,
  CELL_FORM_FACTOR_LABELS,
} from "@/domain/taxonomy/cell-form-factor";
import { CHEMISTRIES, CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { isTaxonomyValue, optionsFor } from "@/domain/taxonomy/lookup";

/**
 * `/catalog`'s URL contract — `SITE_ARCHITECTURE.md` §7.4, `UX_SPEC.md` §3.15.
 *
 * **Filter, sort and page state lives in the URL and nowhere else.** The route
 * decodes once on the server with `decodeListQuery`, hands the decoded query to
 * the adapter through {@link catalogQueryFrom} and hands the same object back to
 * `RecordTable` — so a filtered catalog view is a link a colleague opens and
 * sees the same list.
 *
 * The filter option lists are built with `optionsFor` over the taxonomy's own
 * value arrays, in the taxonomy's own order. **`small_mobility` is in the class
 * filter because T-02 declares it**, not because a builder remembered
 * (`_ANCHORS.md` §0) — and it stays there if the list is ever re-ordered.
 */

export const CATALOG_BASE_PATH = "/catalog";

/**
 * The query-parameter names. `cellFormFactor` is **T-04, the physical cell
 * shape**; T-06 `format_category` is a jurisdiction-dependent band on
 * `format_classification`, one record carries several, and it is filterable
 * nowhere in B1a (`SITE_ARCHITECTURE.md` §7.6b).
 */
export const CATALOG_FILTER_IDS = {
  chemistry: "chemistry",
  cellFormFactor: "cellFormFactor",
  manufacturer: "manufacturer",
  applicationClass: "applicationClass",
} as const;

/**
 * The two sortable columns, and the only two.
 *
 * Each id **is** the contract's sort field, so `?sort=` carries a value the
 * adapter already accepts and there is no second name for one column. A field
 * with no rendered column is left out: a sort nobody can see is a sort nobody
 * can undo.
 */
const SORTABLE_COLUMN_IDS = [
  "manufacturerName",
  "modelName",
] as const satisfies readonly CatalogEntrySortField[];

type CatalogSortColumnId = (typeof SORTABLE_COLUMN_IDS)[number];

export const CATALOG_DEFAULT_SORT: CatalogSortColumnId = "manufacturerName";

/**
 * The spec the route decodes with and every link is encoded against.
 *
 * `manufacturers` are the distinct names the tenant can actually reach, read
 * from the catalog rather than authored here — a manufacturer list written in
 * code is a list that goes stale the first time an entry is added.
 */
export function catalogQuerySpec(
  manufacturers: readonly string[],
): ListQuerySpec {
  return {
    sortableColumnIds: SORTABLE_COLUMN_IDS,
    defaultSort: CATALOG_DEFAULT_SORT,
    defaultDir: "asc",
    filterIds: [
      CATALOG_FILTER_IDS.chemistry,
      CATALOG_FILTER_IDS.cellFormFactor,
      CATALOG_FILTER_IDS.manufacturer,
      CATALOG_FILTER_IDS.applicationClass,
    ],
    // Supplying the permitted values is what makes a bookmarked link to a value
    // that has since been removed fall back to "any" instead of being sent to
    // the adapter (`list-url.ts` rule 2).
    filterValues: {
      [CATALOG_FILTER_IDS.chemistry]: CHEMISTRIES,
      [CATALOG_FILTER_IDS.cellFormFactor]: CELL_FORM_FACTORS,
      [CATALOG_FILTER_IDS.manufacturer]: manufacturers,
      [CATALOG_FILTER_IDS.applicationClass]: APPLICATION_CLASSES,
    },
  };
}

/** The bounded filter controls — `UX_SPEC.md` §3.15. */
export function catalogFilters(
  manufacturers: readonly string[],
): readonly RecordTableFilter[] {
  return [
    {
      id: CATALOG_FILTER_IDS.chemistry,
      label: "Chemistry",
      anyLabel: "Any chemistry",
      options: [...optionsFor(CHEMISTRIES, CHEMISTRY_LABELS)],
    },
    {
      id: CATALOG_FILTER_IDS.cellFormFactor,
      label: "Form factor",
      anyLabel: "Any form factor",
      options: [...optionsFor(CELL_FORM_FACTORS, CELL_FORM_FACTOR_LABELS)],
    },
    {
      id: CATALOG_FILTER_IDS.applicationClass,
      label: "Battery class",
      anyLabel: "Any class",
      options: [...optionsFor(APPLICATION_CLASSES, APPLICATION_CLASS_LABELS)],
    },
    {
      id: CATALOG_FILTER_IDS.manufacturer,
      label: "Manufacturer",
      anyLabel: "Any manufacturer",
      // Not a taxonomy: a manufacturer name is data, so the label is the value.
      options: manufacturers.map((name) => ({ value: name, label: name })),
    },
  ];
}

function sortFieldFrom(sort: string | null): CatalogEntrySortField {
  if (sort !== null && isTaxonomyValue(SORTABLE_COLUMN_IDS, sort)) return sort;
  return CATALOG_DEFAULT_SORT;
}

/**
 * The decoded URL as the adapter's query.
 *
 * Every narrowing is validated against its taxonomy before it leaves this
 * function, so an unrecognised value in a stale link is dropped rather than
 * handed to the adapter as a filter nothing matches.
 *
 * `status: "published"` is not a URL filter and is not offered as one: **only a
 * published entry is available for matching** (T-07), and a handler browsing the
 * catalog is browsing what they could match against.
 */
export function catalogQueryFrom(query: ListQuery): CatalogQuery {
  const chemistry = query.filters[CATALOG_FILTER_IDS.chemistry];
  const cellFormFactor = query.filters[CATALOG_FILTER_IDS.cellFormFactor];
  const applicationClass = query.filters[CATALOG_FILTER_IDS.applicationClass];
  const manufacturerName = query.filters[CATALOG_FILTER_IDS.manufacturer];

  return {
    status: "published",
    search: query.q ?? undefined,
    chemistry:
      chemistry !== undefined && isTaxonomyValue(CHEMISTRIES, chemistry)
        ? chemistry
        : undefined,
    cellFormFactor:
      cellFormFactor !== undefined &&
      isTaxonomyValue(CELL_FORM_FACTORS, cellFormFactor)
        ? cellFormFactor
        : undefined,
    applicationClass:
      applicationClass !== undefined &&
      isTaxonomyValue(APPLICATION_CLASSES, applicationClass)
        ? applicationClass
        : undefined,
    // Data, not a taxonomy: the codec has already dropped anything outside the
    // permitted list this page read from the catalog itself.
    manufacturerName,
    sortBy: sortFieldFrom(query.sort),
    sortDirection: query.dir ?? "asc",
  };
}
