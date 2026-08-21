// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AUDITOR_READ_ONLY_REASON } from "@/domain/access/control-treatment";
import { ROLE_CODES, type RoleCode } from "@/domain/taxonomy/role";
import { EditEntryControl, EDIT_ENTRY_LABEL } from "./edit-entry-control";

/**
 * **Edit this entry** across all six roles — E-8a, and the resolution of the
 * §3.16 contradiction (*"no edit affordance renders for non-P6 roles"*).
 *
 * The rule under test is E-8's own: **disabled for the auditor, absent for the
 * colleague.** P5 is on this screen to evaluate what the organisation can do, so
 * a control she cannot see is a control she cannot assess; P1–P4 are here for
 * something else entirely, and an absent control tells them so without implying
 * a missing permission.
 */

const ENTRY_ID = "0a000008-0000-4000-8000-000000000001";

function renderFor(role: RoleCode) {
  return render(<EditEntryControl role={role} entryId={ENTRY_ID} />);
}

describe("EditEntryControl", () => {
  it("is enabled for the platform admin, pointing at the page that edits", () => {
    renderFor("platform_admin");

    const link = screen.getByRole("link", { name: EDIT_ENTRY_LABEL });
    expect(link).toHaveAttribute(
      "href",
      `/settings/catalog?entry=${encodeURIComponent(ENTRY_ID)}`,
    );
    expect(link).toHaveAttribute("data-mutating", "true");
  });

  it("renders disabled with the stated reason for the auditor", () => {
    renderFor("auditor");

    const control = screen.getByRole("button", { name: EDIT_ENTRY_LABEL });
    // `aria-disabled`, never the `disabled` attribute: a disabled button leaves
    // the tab order and its reason becomes unreachable (spec 01 §G5).
    expect(control).toHaveAttribute("aria-disabled", "true");
    expect(control).not.toHaveAttribute("disabled");
    expect(control).toHaveAttribute("data-mutating", "true");
    expect(screen.getByText(AUDITOR_READ_ONLY_REASON)).toBeInTheDocument();
  });

  it.each(
    ROLE_CODES.filter(
      (role) => role !== "platform_admin" && role !== "auditor",
    ),
  )("is absent from the DOM for %s", (role) => {
    const { container } = renderFor(role);

    expect(container.textContent).not.toContain(EDIT_ENTRY_LABEL);
    expect(container.textContent).not.toContain(AUDITOR_READ_ONLY_REASON);
  });
});
