/**
 * The contract every data adapter satisfies.
 *
 * Written before either implementation, and the only thing the rest of the
 * codebase is allowed to know about data access. No screen, page, component,
 * hook or route handler ever talks to Supabase directly — everything goes
 * through src/data. PROJECT_SETUP_BMMP.md Section 3.2, D-15.
 *
 * Entity methods are deliberately absent. Typing the entities is unit b1a-00's
 * work, and the DataAdapter contract covers B1a entities only — the six B1b and
 * B2 entities get no contract method until the phase that uses them (D-24).
 */

export type AdapterName = "mock" | "supabase";

export interface AdapterDescription {
  /** Which implementation is live. Reported by the health endpoint. */
  readonly name: AdapterName;
  /**
   * Whether the records this adapter returns are real. "fake" must never reach
   * a customer-facing document — the selector in ../index.ts is what enforces
   * that, not this field.
   */
  readonly kind: "fake" | "live";
}

export interface DataAdapter {
  describe(): AdapterDescription;
}
