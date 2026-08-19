import type { DataAdapter } from "../contracts";

/**
 * The real implementation, written against the same contract as the mock.
 *
 * This is the only folder in src/ outside src/lib/ permitted to import
 * @supabase/*. scripts/check-data-seam.mjs fails the build if anything else
 * does (D-16).
 *
 * Empty until the prototype has settled the screens. Migration means writing
 * this file against the existing contract and flipping DATA_ADAPTER — the same
 * Playwright suite must pass both ways. If a screen has to change, the seam
 * leaked; fix the seam, not the screen.
 */
export const supabaseAdapter: DataAdapter = {
  describe: () => ({ name: "supabase", kind: "live" }),
};
