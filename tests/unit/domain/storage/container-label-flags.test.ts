import { describe, expect, it } from "vitest";

import {
  containerLabelFlags,
  labelInForce,
} from "@/domain/storage/container-label-flags";

/** Rules 4.19, 4.22 — the two label flags, one derivation for every reader. */

describe("containerLabelFlags", () => {
  it("flags contents with no label in force (Rule 4.22), and not an empty container", () => {
    expect(
      containerLabelFlags({
        contentCount: 2,
        currentContainerLabelId: null,
        accumulationStartedAt: "2026-07-28T13:05:00.000Z",
        label: null,
      }).noCurrentLabel,
    ).toBe(true);
    expect(
      containerLabelFlags({
        contentCount: 0,
        currentContainerLabelId: null,
        accumulationStartedAt: null,
        label: null,
      }).noCurrentLabel,
    ).toBe(false);
  });

  it("flags a printed start that differs from the current one (Rule 4.19)", () => {
    expect(
      containerLabelFlags({
        contentCount: 1,
        currentContainerLabelId: "l-1",
        accumulationStartedAt: "2026-06-01T00:00:00.000Z",
        label: { accumulationStartedAt: "2026-07-28T13:05:00.000Z" },
      }).mislabelled,
    ).toEqual({
      printed: "2026-07-28T13:05:00.000Z",
      current: "2026-06-01T00:00:00.000Z",
    });
    expect(
      containerLabelFlags({
        contentCount: 1,
        currentContainerLabelId: "l-1",
        accumulationStartedAt: "2026-07-28T13:05:00.000Z",
        label: { accumulationStartedAt: "2026-07-28T13:05:00Z" },
      }).mislabelled,
    ).toBeNull();
  });
});

describe("labelInForce", () => {
  const labels = [
    { id: "old", generatedAt: "2026-07-01T00:00:00.000Z" },
    { id: "new", generatedAt: "2026-08-01T00:00:00.000Z" },
  ];

  it("reads the label the container names, else the newest printed", () => {
    expect(labelInForce("old", labels)?.id).toBe("old");
    expect(labelInForce(null, labels)?.id).toBe("new");
    expect(labelInForce(null, [])).toBeNull();
  });
});
