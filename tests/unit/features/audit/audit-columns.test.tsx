// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { toAuditRowView } from "@/features/audit/audit-row";
import { auditColumns } from "@/features/audit/components/audit-columns";
import { AuditEmptyState } from "@/features/audit/components/audit-empty-state";
import { AuditExportControl } from "@/features/audit/components/audit-export-control";

import { auditEvent, TEST_DIRECTORY, TEST_ZONE } from "./audit-fixtures";

const COLUMNS = auditColumns();

const cell = (id: string, event: Parameters<typeof auditEvent>[0] = {}) => {
  const column = COLUMNS.find((candidate) => candidate.id === id);
  if (column === undefined) throw new Error(`No ${id} column`);
  return column.cell(
    toAuditRowView(
      auditEvent(event),
      TEST_DIRECTORY,
      "facility_manager",
      TEST_ZONE,
    ),
  );
};

describe("the Actor cell — T-60", () => {
  it("marks a platform action with a readable badge and an attribute", () => {
    // §1.2 Rule 4 — icon or text plus colour, never colour alone. The attribute
    // is for the reviewer and the test; the badge is for the person.
    const { container } = render(
      <>
        {cell("actor", {
          actorUserId: "0a000002-0000-4000-8000-000000000004",
          actorType: "platform_admin",
        })}
      </>,
    );
    expect(
      container.querySelector('[data-actor-type="platform_admin"]'),
    ).not.toBeNull();
    expect(screen.getByText("Platform admin")).toBeInTheDocument();
  });

  it("marks nothing on a member's action", () => {
    const { container } = render(<>{cell("actor")}</>);
    expect(container.querySelector("[data-actor-type]")).toBeNull();
    expect(screen.queryByText("Platform admin")).not.toBeInTheDocument();
    expect(screen.getByText("Dana Reyes")).toBeInTheDocument();
  });
});

describe("the Role cell", () => {
  it("renders the actor's role as a badge with text", () => {
    render(<>{cell("actorRole")}</>);
    expect(screen.getByText("Compliance Handler")).toBeInTheDocument();
  });

  it("is absent for a non-user actor rather than saying a role is missing", () => {
    const { container } = render(
      <>
        {cell("actorRole", {
          actorUserId: null,
          actorType: "scheduled_job",
          actorLabel: "storage-clock-alerts",
        })}
      </>,
    );
    expect(container.textContent).toBe("");
  });
});

describe("the Timestamp cell", () => {
  it("shows the zone beside the instant, and never a relative time", () => {
    render(<>{cell("occurredAt")}</>);
    expect(screen.getByText(/2026-06-12 07:30:00/u)).toBeInTheDocument();
    expect(screen.getByText("PDT")).toBeInTheDocument();
  });
});

describe("the expandable before/after detail", () => {
  it("is collapsed until it is asked for, and announces that it is", () => {
    render(<>{cell("summary")}</>);
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows both states, keyed in changed-field order", () => {
    render(<>{cell("summary")}</>);
    fireEvent.click(screen.getByRole("button"));

    const region = screen.getByRole("region");
    expect(region).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");

    const terms = [...region.querySelectorAll("dt")].map(
      (node) => node.textContent,
    );
    expect(terms).toStrictEqual([
      "status",
      "chemistry",
      "chemistryConfirmedBy",
    ]);
    expect(region.textContent).toContain("pending_review");
    expect(region.textContent).toContain("confirmed");
  });

  it("says an insert had no previous state rather than rendering an empty column", () => {
    render(
      <>
        {cell("summary", {
          beforeState: null,
          afterState: { status: "issued", documentType: "shipping_paper" },
          changedFields: null,
        })}
      </>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(
      screen.getByText(
        "This event recorded a new row, so there is no previous state.",
      ),
    ).toBeInTheDocument();
  });

  it("offers no edit, delete or clear control to anyone", () => {
    // Rules 1.21, 12.4 — no role, including P6, may edit or delete an audit
    // event. The absence is the enforcement; a disabled control is not.
    const { container } = render(<>{cell("summary")}</>);
    fireEvent.click(screen.getByRole("button"));
    expect(container.textContent).not.toMatch(/delete|remove|edit|clear/iu);
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });
});

describe("Export", () => {
  it("is enabled for the auditor", () => {
    // E-8a and Rule 5.27, decided by `controlTreatment` rather than restated
    // here: print, download and export are never disabled for any role.
    const { container } = render(
      <AuditExportControl
        href="/api/exports/audit?format=csv"
        role="auditor"
        capability="read"
      />,
    );
    const anchor = container.querySelector("[data-export-control='audit']");
    expect(anchor).not.toBeNull();
    expect(anchor).toHaveAttribute("data-control-treatment", "enabled");
    expect(anchor).not.toHaveAttribute("aria-disabled");
    expect(anchor).not.toHaveAttribute("disabled");
  });
});

describe("the zero-records state", () => {
  it("carries E-15's exact headline and offers no inert action", () => {
    const { container } = render(<AuditEmptyState />);
    expect(screen.getByText("No activity in this range.")).toBeInTheDocument();
    // `RecordTable` routes a narrowed result to its own filtered-empty state, so
    // this branch is only reached with nothing to clear.
    expect(container.querySelectorAll("button, a")).toHaveLength(0);
  });
});
