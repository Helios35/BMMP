import { describe, expect, it } from "vitest";

import { pageStart } from "@/data/mock/table";
import { isAppError } from "@/lib/errors";

/**
 * `PageRequest.offset` — the contract extension a numbered pager needs.
 *
 * A cursor cannot express "jump to page 4", which is what the `Pagination` in
 * `UX_SPEC.md` §2.7 renders. The mock's cursor happens to be a stringified
 * offset today; **depending on that from a screen is the seam leaking** — it
 * would pass on `mock` and fail on `supabase`, which is the one failure the
 * contract exists to prevent (D-16, D-19). So the offset is part of the
 * contract, sliced here and implemented with `.range()` under Supabase.
 */

describe("pageStart", () => {
  it("starts at the beginning when neither a cursor nor an offset is given", () => {
    expect(pageStart({ limit: 25 })).toBe(0);
    expect(pageStart({ limit: 25, cursor: null })).toBe(0);
  });

  it("reads a numbered page from the offset", () => {
    expect(pageStart({ limit: 25, offset: 0 })).toBe(0);
    expect(pageStart({ limit: 25, offset: 150 })).toBe(150);
  });

  it("still reads the cursor, for a caller streaming a whole table", () => {
    expect(pageStart({ limit: 25, cursor: "75" })).toBe(75);
  });

  it("refuses a request carrying both, rather than silently preferring one", () => {
    // Mutually exclusive by the contract. Two different answers to "where does
    // this page start" is a caller defect, and guessing which one was meant is
    // how a pager lands on the wrong page with no sign that it did.
    try {
      pageStart({ limit: 25, cursor: "75", offset: 150 }, "corr-1");
      expect.unreachable("both a cursor and an offset must be refused");
    } catch (error: unknown) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.code).toBe("DATA_INTEGRITY");
        // Generic to the user, fully detailed in the log
        // (`TECHNICAL_SPEC.md` §10.3).
        expect(error.userMessage).toBe("That list could not be read.");
        expect(error.correlationId).toBe("corr-1");
      }
    }
  });

  it("treats a nonsense value as the first page rather than crashing a list", () => {
    expect(pageStart({ limit: 25, cursor: "not-a-number" })).toBe(0);
    expect(pageStart({ limit: 25, offset: -10 })).toBe(0);
  });
});
