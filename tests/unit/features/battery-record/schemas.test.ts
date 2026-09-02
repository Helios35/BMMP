import { describe, expect, it } from "vitest";

import {
  applyCatalogRematchSchema,
  firstIssue,
  recordDamageAssessmentSchema,
  voidBatteryRecordSchema,
} from "@/features/battery-record/schemas";

/**
 * The record write-path schemas — `TECHNICAL_SPEC.md` §7.1 step 2.
 *
 * A schema refuses shape, not meaning: whether `none_observed` stands alone
 * is the domain's call (Rule 6.3), and a test here that asserted it would be
 * a second copy of that rule.
 */

describe("recordDamageAssessmentSchema", () => {
  it("accepts a finding set with optional reason and photo absent", () => {
    const parsed = recordDamageAssessmentSchema.safeParse({
      recordId: "r-1",
      findingTypes: ["swelling"],
      isDefective: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.reason).toBeNull();
      expect(parsed.data.clearingPhotoIntakePhotoId).toBeNull();
    }
  });

  it("turns a blank reason into null so the action decides whether it was required", () => {
    const parsed = recordDamageAssessmentSchema.safeParse({
      recordId: "r-1",
      findingTypes: ["none_observed"],
      isDefective: false,
      reason: "   ",
    });
    expect(parsed.success && parsed.data.reason).toBeNull();
  });

  it("refuses an empty finding set and a finding outside T-29", () => {
    const empty = recordDamageAssessmentSchema.safeParse({
      recordId: "r-1",
      findingTypes: [],
      isDefective: false,
    });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(firstIssue(empty.error).field).toBe("findingTypes");
    }

    const invented = recordDamageAssessmentSchema.safeParse({
      recordId: "r-1",
      findingTypes: ["slightly_warm"],
      isDefective: false,
    });
    expect(invented.success).toBe(false);
  });

  it("does not judge the set — none_observed beside swelling is the domain's refusal, not the schema's", () => {
    const parsed = recordDamageAssessmentSchema.safeParse({
      recordId: "r-1",
      findingTypes: ["none_observed", "swelling"],
      isDefective: false,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("applyCatalogRematchSchema", () => {
  it("requires a chosen entry", () => {
    const parsed = applyCatalogRematchSchema.safeParse({
      recordId: "r-1",
      catalogEntryId: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(firstIssue(parsed.error).field).toBe("catalogEntryId");
    }
  });
});

describe("voidBatteryRecordSchema", () => {
  it("refuses a blank reason and trims a real one", () => {
    const blank = voidBatteryRecordSchema.safeParse({
      recordId: "r-1",
      reason: "   ",
    });
    expect(blank.success).toBe(false);
    if (!blank.success) expect(firstIssue(blank.error).field).toBe("reason");

    const typed = voidBatteryRecordSchema.safeParse({
      recordId: "r-1",
      reason: "  Duplicate.  ",
    });
    expect(typed.success && typed.data.reason).toBe("Duplicate.");
  });
});
