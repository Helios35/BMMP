import type { DataAdapter } from "../contracts";

/**
 * The in-memory implementation. Fake records only.
 *
 * Fixtures arrive with the entities they belong to, in unit b1a-00, and include
 * the deliberately awkward cases named in Section 3.2 — a scuffed label, a
 * swollen pack, a small mobility-scooter pack beside a vehicle pack.
 */
export const mockAdapter: DataAdapter = {
  describe: () => ({ name: "mock", kind: "fake" }),
};
