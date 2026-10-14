// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import * as fixtures from "@/data/mock/fixtures";
import * as ID from "@/data/mock/fixtures/ids";
import { DdrBlockNotice } from "@/features/battery-record/ddr-block-notice";

/**
 * D-58 #13 — `/batteries/[id]`'s damaged-or-defective block renders through
 * `HardBlockNotice` (§2.6, E-9): `role="alert"`, the record with its specific
 * indicator, the citation from data or a stated absence, and no override.
 */

function swollen() {
  const record = fixtures.batteryRecords.find(
    (row) => row.id === ID.BATTERY.swollenLaptop,
  );
  if (record === undefined) throw new Error("no swollen fixture");
  const assessment = fixtures.damageAssessments.find(
    (row) => row.batteryRecordId === record.id && row.status !== "superseded",
  );
  return { record, assessment };
}

describe("DdrBlockNotice", () => {
  it("renders the hard block with the record, its indicator and the citation", () => {
    const { record, assessment } = swollen();
    const { container } = render(
      <DdrBlockNotice
        record={record}
        assessment={assessment}
        citation="49 CFR 173.185(f)"
        canReassess
      />,
    );
    const notice = container.querySelector("[data-hard-block-notice='ddr']");
    expect(notice).toHaveAttribute("role", "alert");
    expect(
      notice?.querySelector(`[data-hard-block-item='${record.id}']`),
    ).not.toBeNull();
    expect(
      notice?.querySelector("[data-hard-block-indicators]")?.textContent,
    ).not.toBe("— ");
    expect(notice?.textContent).toContain("49 CFR 173.185(f)");
    expect(
      notice?.querySelector("[data-hard-block-path='reassess']"),
    ).toHaveAttribute("href", "#record-actions");
    // No override, no score (Rules 6.8, 1.25).
    expect(notice?.textContent).not.toMatch(
      /override this|proceed anyway|probab|likel|%/i,
    );
  });

  it("states a missing citation rather than inventing one, and offers no path to a role that cannot re-assess", () => {
    const { record, assessment } = swollen();
    const { container } = render(
      <DdrBlockNotice
        record={record}
        assessment={assessment}
        citation={null}
        canReassess={false}
      />,
    );
    expect(
      container.querySelector("[data-hard-block-citation='missing']"),
    ).not.toBeNull();
    expect(container.querySelector("[data-hard-block-path]")).toBeNull();
  });

  it("renders nothing for a record with no flag and no prohibition", () => {
    const record = fixtures.batteryRecords.find(
      (row) => row.id === ID.BATTERY.vehicleTraction,
    );
    if (record === undefined) throw new Error("no vehicle fixture");
    const { container } = render(
      <DdrBlockNotice
        record={record}
        assessment={undefined}
        citation={null}
        canReassess
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
