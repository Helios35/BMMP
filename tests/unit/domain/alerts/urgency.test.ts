import { describe, expect, it } from "vitest";

import {
  compareAlertsByUrgency,
  isPinnedAlert,
  type AlertUrgencyFacts,
} from "@/domain/alerts/urgency";

/**
 * T-48's ordering rule — pinned overdue storage clock, then `critical`,
 * `attention`, `informational`, then newest (`TAXONOMY.md` T-48; E-6).
 */

function alert(overrides: Partial<AlertUrgencyFacts>): AlertUrgencyFacts {
  return {
    id: "a",
    alertType: "review_queue",
    severity: "attention",
    raisedAt: "2026-09-01T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

describe("isPinnedAlert", () => {
  it("pins an open overdue storage clock", () => {
    expect(
      isPinnedAlert(
        alert({ alertType: "storage_clock", severity: "critical" }),
      ),
    ).toBe(true);
  });

  it("does not pin a storage clock in a band short of overdue", () => {
    expect(
      isPinnedAlert(
        alert({ alertType: "storage_clock", severity: "attention" }),
      ),
    ).toBe(false);
  });

  it("does not pin a resolved alert", () => {
    expect(
      isPinnedAlert(
        alert({
          alertType: "storage_clock",
          severity: "critical",
          resolvedAt: "2026-09-02T00:00:00.000Z",
        }),
      ),
    ).toBe(false);
  });
});

describe("compareAlertsByUrgency", () => {
  it("puts the pinned alert first, then critical, attention, informational", () => {
    const sorted = [
      alert({
        id: "info",
        severity: "informational",
        raisedAt: "2026-09-09T00:00:00.000Z",
      }),
      alert({
        id: "attention",
        severity: "attention",
        raisedAt: "2026-09-08T00:00:00.000Z",
      }),
      alert({
        id: "critical",
        severity: "critical",
        raisedAt: "2026-09-07T00:00:00.000Z",
      }),
      alert({
        id: "pinned",
        alertType: "storage_clock",
        severity: "critical",
        raisedAt: "2026-01-01T00:00:00.000Z",
      }),
    ].sort(compareAlertsByUrgency);
    expect(sorted.map((row) => row.id)).toEqual([
      "pinned",
      "critical",
      "attention",
      "info",
    ]);
  });

  it("never guesses an unknown severity upward — it sorts after the known three", () => {
    const sorted = [
      alert({
        id: "unknown",
        severity: "chartreuse",
        raisedAt: "2026-09-09T00:00:00.000Z",
      }),
      alert({
        id: "info",
        severity: "informational",
        raisedAt: "2026-09-01T00:00:00.000Z",
      }),
    ].sort(compareAlertsByUrgency);
    expect(sorted.map((row) => row.id)).toEqual(["info", "unknown"]);
  });

  it("orders newest first within a severity, and is stable on a tie", () => {
    const sorted = [
      alert({ id: "b", raisedAt: "2026-09-01T00:00:00.000Z" }),
      alert({ id: "a", raisedAt: "2026-09-01T00:00:00.000Z" }),
      alert({ id: "c", raisedAt: "2026-09-02T00:00:00.000Z" }),
    ].sort(compareAlertsByUrgency);
    expect(sorted.map((row) => row.id)).toEqual(["c", "a", "b"]);
  });
});
