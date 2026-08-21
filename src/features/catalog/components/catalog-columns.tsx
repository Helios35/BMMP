import type { RecordTableColumn } from "@/components";
import {
  CELL_FORM_FACTOR_LABELS,
  type CellFormFactor,
} from "@/domain/taxonomy/cell-form-factor";
import { CHEMISTRY_LABELS } from "@/domain/taxonomy/chemistry";
import { labelFor } from "@/domain/taxonomy/lookup";
import type { CatalogEntry } from "@/types/catalog";
import { measurement, NOT_SET } from "@/features/catalog/catalog-entry-display";

/**
 * `/catalog`'s columns — `UX_SPEC.md` §3.15.
 *
 * **`Form factor` is T-04 `cell_form_factor`, never T-06 `format_category`.**
 * One word apart and not the same idea: T-04 is the physical shape of the cells
 * and is a property of the product, T-06 is a jurisdiction-dependent band keyed
 * on `(battery_record, jurisdiction, rule_version)` where **one record carries
 * several at once** (Rule 3.5, `_ANCHORS.md` §3). A `format_category` column on
 * a catalog list would assert a single organisation-wide format value, which is
 * exactly the assumption `format_classification` exists to prevent — so it is
 * not here, and it is not filterable or sortable anywhere in B1a.
 *
 * Every label comes from its system's own lookup. **No label is written inline**
 * (`TAXONOMY.md` §5.3).
 *
 * Nothing on this table is catalog-specific in a way `RecordTable` can see: the
 * columns are data and the component is reused unchanged on `/containers` in
 * unit 04.
 */

export interface CatalogColumnsOptions {
  /**
   * How many of **this tenant's** battery records are matched to the entry.
   *
   * Resolved by the route, one read per row, because it is a count over
   * `battery_record` rather than a column on `catalog_entry`.
   */
  readonly matchedCountFor: (entry: CatalogEntry) => number;
}

function formFactorLabel(value: CellFormFactor | null): string {
  return value === null ? NOT_SET : labelFor(CELL_FORM_FACTOR_LABELS, value);
}

/**
 * Capacity and energy, both rendered, **each with its unit stated**.
 *
 * Never one inferred from the other: Ah and Wh are different quantities and a
 * screen that derives one is claiming a voltage it was not given (§3.15).
 */
function capacityAndEnergy(entry: CatalogEntry): string {
  const parts = [
    measurement(entry.ratedCapacityAh, "Ah"),
    measurement(entry.ratedEnergyWh, "Wh"),
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? NOT_SET : parts.join(" · ");
}

export function catalogColumns({
  matchedCountFor,
}: CatalogColumnsOptions): readonly RecordTableColumn<CatalogEntry>[] {
  return [
    {
      // The id is what `?sort=` carries and what the adapter accepts. One name.
      id: "manufacturerName",
      header: "Manufacturer",
      sortable: true,
      primary: true,
      cell: (entry) => entry.manufacturerName,
    },
    {
      id: "modelName",
      header: "Model / part number",
      sortable: true,
      secondary: true,
      mono: true,
      cell: (entry) => entry.modelName ?? entry.partNumber ?? NOT_SET,
    },
    {
      id: "chemistry",
      header: "Chemistry",
      cell: (entry) => labelFor(CHEMISTRY_LABELS, entry.chemistry),
    },
    {
      // T-04. Not T-06 — see the module comment.
      id: "cellFormFactor",
      header: "Form factor",
      cell: (entry) => formFactorLabel(entry.cellFormFactor),
    },
    {
      id: "nominalVoltage",
      header: "Nominal voltage",
      align: "end",
      cell: (entry) => measurement(entry.nominalVoltageV, "V") ?? NOT_SET,
    },
    {
      id: "capacityEnergy",
      header: "Capacity / energy",
      align: "end",
      cell: capacityAndEnergy,
    },
    {
      id: "matchedRecords",
      header: "Records matched",
      align: "end",
      cell: (entry) => matchedCountFor(entry),
    },
  ];
}
