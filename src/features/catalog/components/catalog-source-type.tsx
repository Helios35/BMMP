import type { ReactElement } from "react";

import {
  CATALOG_ENTRY_SOURCE_TYPES,
  CATALOG_ENTRY_SOURCE_TYPE_LABELS,
} from "@/domain/taxonomy/catalog-entry-source-type";
import { readTaxonomyValue } from "@/domain/taxonomy/lookup";

/**
 * `catalog_entry.source_type` — T-61, read through the one lookup
 * (`TAXONOMY.md` §5.3, §5.8).
 *
 * **The stored column is still `string`.** Every catalog fixture holds
 * `manufacturer_datasheet`, which is outside T-61's authored set
 * (`BUILD_NOTES_b1a-doc-defects.md` §2.2), so the unrecognised arm is not a
 * theoretical branch — it is what this screen renders today.
 *
 * So: **render what is stored, in mono, and warn.** Never blank it, never coerce
 * it to a default, never invent a label for it, and never map it here — the
 * mapping is an open item with the owner, and resolving it in a component would
 * put a second T-61 lookup in the codebase, which `TAXONOMY.md` §5.7 lists as a
 * review rejection. After the fixture migration this same code renders the
 * authored label with no screen change, which is the test.
 */

export interface CatalogSourceTypeProps {
  /** The value exactly as `catalog_entry.source_type` holds it. */
  readonly sourceType: string;
}

export function CatalogSourceType({
  sourceType,
}: CatalogSourceTypeProps): ReactElement {
  const source = readTaxonomyValue(
    CATALOG_ENTRY_SOURCE_TYPES,
    CATALOG_ENTRY_SOURCE_TYPE_LABELS,
    sourceType,
  );

  if (source.recognised) {
    return (
      <span data-taxonomy-state="recognised" className="text-body-strong">
        {source.label}
      </span>
    );
  }

  // Surfaced rather than swallowed: a value this build does not know is a fact
  // about the data, and a screen that hides it hides the fixture migration too.
  console.warn(
    `[catalog] unrecognised catalog_entry.source_type: ${source.storedValue}`,
  );

  return (
    <span
      data-taxonomy-state="unrecognised"
      title="Unrecognised catalog source type"
      className="text-mono break-all"
    >
      {source.storedValue}
      <span className="sr-only">
        {" — a value this version does not recognise, shown as stored."}
      </span>
    </span>
  );
}
