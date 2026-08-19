/**
 * T-03 · Assembly level
 *
 * **Stored on:** `battery_record.assembly_level`
 * **Cardinality:** single-select · **Phase:** B1a
 *
 * Records what physical unit the record describes — an individual cell, a module of cells, or a complete pack — because packaging, weight, energy and transport treatment all differ by assembly level.
 *
 * The column that lets one table hold a single consumer cell and a vehicle
 * traction pack (`ERD.md` §5.1).
 *
 * Definitions for every value are in `docs/TAXONOMY.md` T-03, which is the
 * single source of truth. This module owns the stored value, the value order —
 * which is the display order (TAXONOMY.md §5.7) — and the display label, and
 * owns no transition: `BUSINESS_RULES.md` owns what triggers a move between
 * values.
 *
 * **Never invent a value.** If one is needed and is not here, it does not exist
 * yet — raise it to P6 (TAXONOMY.md §1.1).
 */

export const ASSEMBLY_LEVELS = ["cell", "module", "pack", "unknown"] as const;

export type AssemblyLevel = (typeof ASSEMBLY_LEVELS)[number];

/**
 * Stored value to display label. **The only place a T-03 label exists in this
 * codebase.** A label written inline in a component, a PDF template, an email or
 * a test is a defect, even when it happens to match (TAXONOMY.md §5.3).
 *
 * The two are related by this lookup and never by a string transform, in either
 * direction — a transform looks like it works until the first label with a
 * slash, an ampersand, an accent or a regulatory phrase in it, and then it fails
 * silently, in a PDF, in front of an auditor (§5.1).
 */
export const ASSEMBLY_LEVEL_LABELS: Readonly<Record<AssemblyLevel, string>> = {
  cell: "Cell",
  module: "Module",
  pack: "Pack",
  unknown: "Assembly level not confirmed",
};
