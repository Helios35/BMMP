import { describe, expect, it } from "vitest";
import { resolveAdapter } from "@/data";

/**
 * GATE — the adapter selector fails closed.
 *
 * This is the continuous proof of D-16. A ternary defaulting to the mock means
 * an unset or misspelled variable silently serves fake data, and in production
 * that is a fake legal document with a real customer's name on it. These cases
 * were also broken by hand once and watched to fail; see
 * briefs/BUILD_NOTES_b1a-setup.md.
 */
describe("resolveAdapter", () => {
  it("throws when DATA_ADAPTER is unset", () => {
    expect(() => resolveAdapter({})).toThrow(/DATA_ADAPTER must be/);
  });

  it("throws when DATA_ADAPTER is empty", () => {
    expect(() => resolveAdapter({ DATA_ADAPTER: "" })).toThrow(/DATA_ADAPTER must be/);
  });

  it("throws when DATA_ADAPTER is whitespace", () => {
    expect(() => resolveAdapter({ DATA_ADAPTER: "   " })).toThrow(/DATA_ADAPTER must be/);
  });

  it("throws when DATA_ADAPTER is misspelled, and names the value it got", () => {
    expect(() => resolveAdapter({ DATA_ADAPTER: "mokc" })).toThrow(
      /DATA_ADAPTER must be 'mock' or 'supabase'; got "mokc"/,
    );
  });

  it("throws rather than falling back — no value selects an adapter by default", () => {
    for (const value of ["Mock", "MOCK", "supabse", "postgres", "true", "0"]) {
      expect(() => resolveAdapter({ DATA_ADAPTER: value })).toThrow();
    }
  });

  it("refuses mock in production", () => {
    expect(() =>
      resolveAdapter({ DATA_ADAPTER: "mock", VERCEL_ENV: "production" }),
    ).toThrow(/refused in production/);
  });

  it("allows mock outside production", () => {
    for (const env of [undefined, "preview", "development"]) {
      expect(resolveAdapter({ DATA_ADAPTER: "mock", VERCEL_ENV: env }).name).toBe("mock");
    }
  });

  it("allows supabase in production", () => {
    expect(
      resolveAdapter({ DATA_ADAPTER: "supabase", VERCEL_ENV: "production" }).name,
    ).toBe("supabase");
  });

  it("tolerates surrounding whitespace on an otherwise valid value", () => {
    expect(resolveAdapter({ DATA_ADAPTER: " mock " }).name).toBe("mock");
  });
});
