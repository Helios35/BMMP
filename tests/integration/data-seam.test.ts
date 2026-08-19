import { describe, expect, it } from "vitest";
import { activeAdapterName, data, resolveAdapter } from "@/data";

/**
 * Integration — the selector, the contract and both implementations together.
 *
 * The seam is the one thing in this repository that everything else depends on
 * staying true, so the pieces are exercised assembled rather than only apart.
 */
describe("the data seam", () => {
  it("serves the adapter DATA_ADAPTER names", () => {
    expect(activeAdapterName).toBe("mock");
    expect(data.describe()).toEqual({ name: "mock", kind: "fake" });
  });

  it("returns fake records under mock and live records under supabase", () => {
    expect(resolveAdapter({ DATA_ADAPTER: "mock" }).adapter.describe()).toEqual({
      name: "mock",
      kind: "fake",
    });
    expect(resolveAdapter({ DATA_ADAPTER: "supabase" }).adapter.describe()).toEqual({
      name: "supabase",
      kind: "live",
    });
  });

  it("reports the same name through both the export and the contract", () => {
    expect(data.describe().name).toBe(activeAdapterName);
  });
});
