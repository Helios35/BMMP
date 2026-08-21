import { describe, expect, it } from "vitest";

import { decodeListQuery } from "@/components/record-table/list-url";
import { AUDIT_EVENT_TYPES } from "@/domain/taxonomy/audit-event-type";
import { auditFilters } from "@/features/audit/audit-filters";
import {
  AUDIT_LIST_SPEC,
  auditExportHref,
  auditExportSearchParams,
  toAuditEventQuery,
} from "@/features/audit/audit-query";

const ZONE = "America/Los_Angeles";

function decode(search: string) {
  const params = new URLSearchParams(search);
  return decodeListQuery(Object.fromEntries(params.entries()), AUDIT_LIST_SPEC);
}

describe("/audit — the default view", () => {
  it("is newest first", () => {
    const query = toAuditEventQuery(decode(""), ZONE);
    expect(query.sortBy).toBe("occurredAt");
    expect(query.sortDirection).toBe("desc");
  });

  it("narrows on nothing, so a denial is an ordinary row", () => {
    // Rules 1.16, 12.6 and `SITE_ARCHITECTURE.md` §5.3(8). Attempts are
    // evidence: a screen that filters them out of the default view destroys the
    // record it exists to show.
    const query = toAuditEventQuery(decode(""), ZONE);
    expect(query.eventType).toBeUndefined();
    expect(query.actorType).toBeUndefined();
    expect(query.actorUserId).toBeUndefined();
    expect(query.entityTable).toBeUndefined();
    expect(query.occurredAfter).toBeUndefined();
    expect(query.occurredBefore).toBeUndefined();
  });

  it("offers denial, override and export as filterable event types", () => {
    // The options come from T-43 itself, so these three are present because the
    // taxonomy carries them — not because a screen chose to list them.
    const eventTypeFilter = auditFilters([]).find(
      (filter) => filter.id === "type",
    );
    const values = eventTypeFilter?.options.map((option) => option.value) ?? [];
    expect(values).toContain("denial.recorded");
    expect(values).toContain("override.recorded");
    expect(values).toContain("export.generated");
    expect(values).toHaveLength(AUDIT_EVENT_TYPES.length);
  });

  it("offers the actor types, so a platform action is one filter away", () => {
    // Rules 1.18, 12.7 — this is how an auditor asks the log what the platform
    // did inside their tenant.
    const actorTypeFilter = auditFilters([]).find(
      (filter) => filter.id === "actorType",
    );
    const values = actorTypeFilter?.options.map((option) => option.value) ?? [];
    expect(values).toContain("platform_admin");
  });
});

describe("/audit — narrowing", () => {
  it("resolves the range in the organization's zone", () => {
    const query = toAuditEventQuery(
      decode("from=2026-06-12&to=2026-06-12"),
      ZONE,
    );
    expect(query.occurredAfter).toBe("2026-06-12T07:00:00.000Z");
    expect(query.occurredBefore).toBe("2026-06-13T06:59:59.999Z");
  });

  it("drops a range value that is not a calendar date rather than failing", () => {
    const query = toAuditEventQuery(decode("from=last-tuesday"), ZONE);
    expect(query.occurredAfter).toBeUndefined();
  });

  it("drops an actor type outside T-60 rather than casting it", () => {
    // The codec already refuses it against `filterValues`; this asserts the
    // narrowing rather than trusting it, because the alternative is a union
    // member the taxonomy never authored.
    const query = toAuditEventQuery(decode("actorType=root"), ZONE);
    expect(query.actorType).toBeUndefined();
  });

  it("carries the search and the chosen filters through", () => {
    const query = toAuditEventQuery(
      decode("q=swelling&type=denial.recorded&actor=u-1&entity=battery_record"),
      ZONE,
    );
    expect(query.search).toBe("swelling");
    expect(query.eventType).toBe("denial.recorded");
    expect(query.actorUserId).toBe("u-1");
    expect(query.entityTable).toBe("battery_record");
  });
});

describe("/audit — the export href", () => {
  it("carries the screen's scope, in TECHNICAL_SPEC.md §7.2's parameter names", () => {
    const href = auditExportHref(
      decode(
        "q=swelling&type=denial.recorded&entity=battery_record&from=2026-06-01",
      ),
    );
    const url = new URL(href, "https://example.test");

    expect(url.pathname).toBe("/api/exports/audit");
    expect(url.searchParams.get("actionCode")).toBe("denial.recorded");
    expect(url.searchParams.get("entityTable")).toBe("battery_record");
    expect(url.searchParams.get("from")).toBe("2026-06-01");
    expect(url.searchParams.get("q")).toBe("swelling");
    expect(url.searchParams.get("format")).toBe("csv");
  });

  it("exports the scope, not the page the reader is looking at", () => {
    const href = auditExportHref(decode("page=3&perPage=100"));
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("page")).toBeNull();
    expect(url.searchParams.get("perPage")).toBeNull();
  });

  it("round-trips, so the export and the screen cannot disagree about scope", () => {
    // Rule 12.17 puts the scoping obligation on the export itself. The handler
    // decodes with the same codec and the same spec the page used, and this is
    // the assertion that the two ends of that loop meet.
    const onScreen = decode(
      "q=swelling&type=denial.recorded&entity=battery_record&actor=u-1&actorType=platform_admin&from=2026-06-01&to=2026-06-30&dir=asc",
    );
    const url = new URL(auditExportHref(onScreen), "https://example.test");
    const reDecoded = decodeListQuery(
      auditExportSearchParams(url),
      AUDIT_LIST_SPEC,
    );

    expect(toAuditEventQuery(reDecoded, ZONE)).toStrictEqual(
      toAuditEventQuery(onScreen, ZONE),
    );
  });
});
