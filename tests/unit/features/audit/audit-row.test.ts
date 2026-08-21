import { describe, expect, it, vi } from "vitest";

import type { RoleCode } from "@/domain/taxonomy/role";
import { toAuditRowView } from "@/features/audit/audit-row";

import { auditEvent, TEST_DIRECTORY, TEST_ZONE } from "./audit-fixtures";

const view = (
  event: Parameters<typeof auditEvent>[0],
  role: RoleCode = "facility_manager",
) => toAuditRowView(auditEvent(event), TEST_DIRECTORY, role, TEST_ZONE);

describe("T-60 — platform actions are marked", () => {
  it("marks a platform admin's action", () => {
    // Rules 1.18, 12.7 — a support grant that is invisible in the log is not a
    // recorded support grant.
    const row = view({
      actorUserId: "0a000002-0000-4000-8000-000000000004",
      actorType: "platform_admin",
    });
    expect(row.isPlatformAction).toBe(true);
    // The label is T-60's own; it is never written inline (TAXONOMY.md §5.3).
    expect(row.actorTypeLabel).toBe("Platform admin");
  });

  it("does not mark a member's action", () => {
    const row = view({});
    expect(row.isPlatformAction).toBe(false);
    expect(row.actorTypeLabel).toBe("Member");
  });

  it("renders an actor type outside T-60 as stored, and never guesses", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // @ts-expect-error — a value a newer deployment wrote. The column is a
    // narrowed union in this build, and the read path still has to survive one
    // (TAXONOMY.md §5.8).
    const row = view({ actorType: "delegated_operator" });
    expect(row.actorTypeLabel).toBe("delegated_operator");
    expect(row.isPlatformAction).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("the Actor and Role columns", () => {
  it("names a member from the tenant's own membership directory", () => {
    const row = view({});
    expect(row.actorName).toBe("Dana Reyes");
    expect(row.actorRole).toBe("compliance_handler");
  });

  it("names the job that ran, and gives it no role", () => {
    // Rule 12.5 — automated steps write events exactly as human actions do,
    // identified as the step that ran.
    const row = view({
      actorUserId: null,
      actorType: "scheduled_job",
      actorLabel: "storage-clock-alerts",
    });
    expect(row.actorName).toBe("storage-clock-alerts");
    expect(row.actorRole).toBeNull();
  });

  it("falls back to T-60's label rather than a word written here", () => {
    const row = view({
      actorUserId: null,
      actorType: "system",
      actorLabel: null,
    });
    expect(row.actorName).toBe("System");
  });

  it("shows a user id it cannot resolve rather than blanking the actor", () => {
    // Rule 1.13 — a name stays attached forever, and where one cannot be found
    // the identifier is what is known. A blank cell would lose "who".
    const row = view({ actorUserId: "0a000002-0000-4000-8000-00000000ffff" });
    expect(row.actorName).toBe("0a000002-0000-4000-8000-00000000ffff");
    expect(row.actorRole).toBeNull();
  });
});

describe("the Timestamp column", () => {
  it("is absolute, in the organization's zone, with the zone beside it", () => {
    // Rule 12.20. Never relative: this row is read months later and compared
    // against a shipping paper.
    const row = view({});
    expect(row.timestamp.value).toBe("2026-06-12 07:30:00");
    expect(row.timestamp.zone).toBe("PDT");
  });
});

describe("the Entity column", () => {
  it("links the referenced record where this role can open it", () => {
    const row = view({});
    expect(row.entityHref).toBe(
      "/batteries/0a000009-0000-4000-8000-000000000001",
    );
  });

  it("renders no link where the role cannot reach the target", () => {
    // §5.3(7) — never a dead link and never a redirect. `/containers/[id]` is
    // `none` for the auditor.
    const row = view({ entityTable: "container" }, "auditor");
    expect(row.entityHref).toBeNull();
  });

  it("renders no link for a table whose identifier is not the target's", () => {
    // `storage_clock.entity_id` is the clock's id, not the container's; a
    // constructed href would point at a record the event is not about.
    const row = view({ entityTable: "storage_clock" });
    expect(row.entityHref).toBeNull();
  });
});

describe("the Summary column", () => {
  it("is the reason where the event carried one", () => {
    const row = view({
      reason: "Confirmed swelling finding on human assessment",
    });
    expect(row.summary).toBe("Confirmed swelling finding on human assessment");
  });

  it("is the changed-field list otherwise", () => {
    const row = view({});
    expect(row.summary).toBe("status, chemistry, chemistryConfirmedBy");
  });
});

describe("an insert", () => {
  it("keeps its null before-state rather than inventing an empty one", () => {
    const row = view({ beforeState: null, changedFields: null });
    expect(row.beforeState).toBeNull();
    expect(row.changedFields).toStrictEqual([]);
  });
});
