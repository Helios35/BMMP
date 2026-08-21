// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import {
  RecordTable,
  RecordTableSkeleton,
  type RecordTableColumn,
  type RecordTableRowLink,
} from "@/components/record-table/record-table";
import {
  decodeListQuery,
  type ListQuerySpec,
} from "@/components/record-table/list-url";

/**
 * `RecordTable` in isolation, in every state `UX_SPEC.md` §2.7 defines for it:
 * default, hover, focus, active, disabled, loading, error, empty.
 *
 * "Disabled" on this component is **a row that is not a link for this role** —
 * §2.7's own disabled row, and `SITE_ARCHITECTURE.md` §5.4's `/containers`
 * asymmetry. There is no disabled *table*.
 *
 * Hover and active are asserted structurally against the class string, because
 * jsdom renders no CSS pseudo-classes.
 */

/**
 * jsdom implements no `ResizeObserver`, and Radix's popper measures its anchor
 * with one the moment a `TooltipTrigger` mounts. A no-op keeps the trigger
 * mountable without a dependency. The right home for this is
 * `tests/setup/dom.ts`; it is local here because that file belongs to another
 * unit's surface.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace,
    prefetch: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/batteries",
}));

interface Row {
  readonly id: string;
  readonly code: string;
  readonly description: string;
  readonly status: string;
}

/**
 * A vehicle traction pack and a mobility-scooter pack, side by side, rendered by
 * the same columns with no special case (`SITE_ARCHITECTURE.md` §7.8).
 */
const ROWS: readonly Row[] = [
  {
    id: "row-1",
    code: "BR-1042",
    description: "Vehicle traction pack",
    status: "Stored",
  },
  {
    id: "row-2",
    code: "BR-1043",
    description: "Mobility scooter pack",
    status: "Stored",
  },
];

const COLUMNS: readonly RecordTableColumn<Row>[] = [
  {
    id: "code",
    header: "Record",
    cell: (row) => row.code,
    primary: true,
    mono: true,
    sortable: true,
  },
  {
    id: "description",
    header: "Description",
    cell: (row) => row.description,
    secondary: true,
  },
  { id: "status", header: "Status", cell: (row) => row.status, status: true },
];

const SPEC: ListQuerySpec = {
  sortableColumnIds: ["code"],
  defaultSort: "code",
  defaultDir: "asc",
  filterIds: ["status"],
  filterValues: { status: ["stored", "shipped"] },
};

const ZERO_RECORDS = (
  <p>No batteries yet. Log the first one, or ask a Handler to.</p>
);

function renderTable(
  overrides: Partial<Parameters<typeof RecordTable<Row>>[0]> = {},
  searchParams: Record<string, string> = {},
) {
  const query = decodeListQuery(searchParams, SPEC);
  return render(
    <RecordTable<Row>
      caption="Battery records"
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(row) => row.id}
      rowLink={(row): RecordTableRowLink => ({
        kind: "link",
        href: `/batteries/${row.id}`,
      })}
      total={ROWS.length}
      query={query}
      querySpec={SPEC}
      basePath="/batteries"
      searchPlaceholder="Search battery records"
      emptyState={ZERO_RECORDS}
      {...overrides}
    />,
  );
}

function dataRows(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("tr[data-row-link]"),
  );
}

describe("RecordTable — default", () => {
  it("renders one row per record, with an accessible table name", () => {
    const { container } = renderTable();
    expect(
      container
        .querySelector("[data-table-state]")
        ?.getAttribute("data-table-state"),
    ).toBe("default");
    expect(
      screen.getByRole("table", { name: "Battery records" }),
    ).toBeInTheDocument();
    expect(dataRows(container)).toHaveLength(2);
  });

  it("renders a mobility-scooter pack beside a vehicle pack with no special case", () => {
    renderTable();
    // Both render through the same columns. One presentation on desktop and one
    // on mobile, from one pass over the data (§4.2) — hence two matches each.
    expect(screen.getAllByText("BR-1042").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mobility scooter pack").length).toBeGreaterThan(
      0,
    );
  });

  it("gives the sortable header a persistent indicator and an aria-sort", () => {
    const { container } = renderTable();
    const header = container.querySelector("th[aria-sort]");
    expect(header?.getAttribute("aria-sort")).toBe("ascending");
    // Persistent, not hover-revealed: which column is sorted is information, and
    // hover is never the only way to reveal information (§1.5).
    expect(header?.querySelector("svg")).not.toBeNull();
  });

  it("toggles the direction on the active column and starts a new column ascending", () => {
    const { container } = renderTable();
    const active = container.querySelector<HTMLAnchorElement>(
      "a[data-sort-column='code']",
    );
    expect(active?.getAttribute("href")).toBe("/batteries?dir=desc");
  });

  it("makes each row one anchor, not one anchor per cell", () => {
    const { container } = renderTable();
    const row = dataRows(container)[0] as HTMLElement;
    expect(row.querySelectorAll("a")).toHaveLength(1);
    expect(
      row.querySelector("a[data-row-anchor='true']")?.getAttribute("href"),
    ).toBe("/batteries/row-1");
  });

  it("keeps the header target at 44px and the row at the specified height", () => {
    const { container } = renderTable();
    expect(
      container.querySelector("a[data-sort-column='code']")?.className,
    ).toContain("min-h-11");
    // 56px touch, 48px from lg (§1.4).
    expect((dataRows(container)[0] as HTMLElement).className).toContain("h-14");
    expect((dataRows(container)[0] as HTMLElement).className).toContain(
      "lg:h-12",
    );
  });

  it("states the result count in a live region, in tabular numerals", () => {
    const { container } = renderTable({ total: 312 }, { page: "2" });
    const count = container.querySelector("[data-record-count]");
    expect(count?.getAttribute("role")).toBe("status");
    expect(count?.textContent).toContain("26–27 of 312");
    expect(count?.querySelector(".tabular")).not.toBeNull();
  });

  it("renders a numbered pager whose pages are real links", () => {
    const { container } = renderTable({ total: 312 });
    const pager = container.querySelector("nav[aria-label='pagination']");
    expect(pager).not.toBeNull();
    const pageTwo = within(pager as HTMLElement).getByRole("link", {
      name: "Go to page 2",
    });
    expect(pageTwo).toHaveAttribute("href", "/batteries?page=2");
    // 44 × 44 everywhere, including desktop (§1.5). The generated Button sizes
    // are all smaller, so app code always adds the target.
    expect(pageTwo.className).toContain("size-11");
  });
});

describe("RecordTable — hover", () => {
  it("washes and points only where the row is navigable for this role", () => {
    const { container } = renderTable();
    const row = dataRows(container)[0] as HTMLElement;
    expect(row.className).toContain("hover:bg-muted/50");
    expect(row.className).toContain("cursor-pointer");
  });

  it("carries no hover wash and no pointer where the row is not a link", () => {
    const { container } = renderTable({
      rowLink: (): RecordTableRowLink => ({
        kind: "not-linked",
        reason:
          "Container detail requires the Handler, Facility Manager or Admin role.",
      }),
    });
    const row = dataRows(container)[0] as HTMLElement;
    expect(row.className).not.toContain("hover:bg-muted/50");
    expect(row.className).not.toContain("cursor-pointer");
  });
});

describe("RecordTable — focus", () => {
  it("focuses the row's anchor and rings the row", () => {
    const { container } = renderTable();
    const row = dataRows(container)[0] as HTMLElement;
    const anchor = row.querySelector<HTMLAnchorElement>("a[data-row-anchor]");
    anchor?.focus();
    expect(anchor).toHaveFocus();
    expect(row.className).toContain("has-[a:focus-visible]:ring-2");
    expect(row.className).toContain("has-[a:focus-visible]:ring-ring");
  });

  it("never removes the ring without replacing it", () => {
    const { container } = renderTable();
    const anchor =
      container.querySelector<HTMLAnchorElement>("a[data-row-anchor]");
    // The row carries the ring, so the anchor suppresses its own outline — that
    // is the one permitted use of outline-none (§G3).
    expect(anchor?.className).toContain("focus-visible:outline-none");
  });
});

describe("RecordTable — active", () => {
  it("carries an 80ms press wash only where the row is navigable", () => {
    const { container } = renderTable();
    expect((dataRows(container)[0] as HTMLElement).className).toContain(
      "active:bg-muted",
    );
  });
});

describe("RecordTable — a row that is not a link (§5.4)", () => {
  const REASON =
    "Container detail requires the Handler, Facility Manager or Admin role.";

  function renderNotLinked() {
    return renderTable({
      rowLink: (): RecordTableRowLink => ({
        kind: "not-linked",
        reason: REASON,
      }),
    });
  }

  it("renders no anchor in the row at all", () => {
    // There is no navigation attempt to intercept, because there is no
    // navigation: no redirect, no toast, no cursor change.
    const { container } = renderNotLinked();
    const row = dataRows(container)[0] as HTMLElement;
    expect(row.querySelectorAll("a")).toHaveLength(0);
    expect(row.getAttribute("data-row-link")).toBe("false");
  });

  it("states the reason and exposes it for an assertion", () => {
    const { container } = renderNotLinked();
    const row = dataRows(container)[0] as HTMLElement;
    expect(row.getAttribute("data-row-reason")).toBe(REASON);
    // Reachable by keyboard from md up, and as a persistent line below it —
    // hover is never the only way to reveal information (§1.5).
    expect(row.querySelector("[data-row-reason-trigger]")).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(row.querySelector("[data-row-reason-line]")?.textContent).toBe(
      REASON,
    );
  });
});

describe("RecordTable — loading", () => {
  it("renders eight rows at the exact row height, never a spinner", () => {
    const { container } = render(<RecordTableSkeleton columns={3} />);
    expect(
      container
        .querySelector("[data-table-state]")
        ?.getAttribute("data-table-state"),
    ).toBe("loading");
    const rows = container.querySelectorAll("[data-skeleton-row]");
    expect(rows).toHaveLength(8);
    expect((rows[0] as HTMLElement).className).toContain("h-14");
    expect((rows[0] as HTMLElement).className).toContain("lg:h-12");
  });
});

describe("RecordTable — error", () => {
  const ERROR = {
    message:
      "We could not reach the records service. Nothing was changed — try again.",
    correlationId: "corr-9f2",
  };

  it("replaces the rows with a critical alert carrying Retry", () => {
    const { container } = renderTable({ error: ERROR });
    expect(
      container
        .querySelector("[data-table-state]")
        ?.getAttribute("data-table-state"),
    ).toBe("error");
    const alert = container.querySelector("[data-table-error]");
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.className).toContain("bg-intent-critical-background");
    expect(screen.getByRole("link", { name: "Retry" })).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
  });

  it("keeps the header, the search box and the result count so the reader keeps context", () => {
    const { container } = renderTable(
      { error: ERROR, total: 312 },
      { q: "drum" },
    );
    expect(
      container.querySelector("[data-record-table-search]"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-record-count]")?.textContent,
    ).toContain("312");
  });

  it("shows the correlation id, in mono, so support can find the trace", () => {
    const { container } = renderTable({ error: ERROR });
    const id = container.querySelector("[data-correlation-id]");
    expect(id?.textContent).toBe("corr-9f2");
    expect(id?.className).toContain("text-mono");
  });
});

describe("RecordTable — empty", () => {
  it("renders the route's zero-records state when nothing is narrowed", () => {
    const { container } = renderTable({ rows: [], total: 0 });
    expect(
      container
        .querySelector("[data-table-state]")
        ?.getAttribute("data-empty-kind"),
    ).toBe("zero-records");
    expect(
      screen.getByText(
        "No batteries yet. Log the first one, or ask a Handler to.",
      ),
    ).toBeInTheDocument();
  });

  it("never shows the zero-records copy to someone who typed a bad filter", () => {
    // §2.7 is explicit about this, and it is the whole reason the two states are
    // separate: the onboarding sentence is a lie to a reader who has 4,000
    // records and one wrong filter.
    const { container } = renderTable(
      { rows: [], total: 0, filteredEmpty: { noun: "batteries" } },
      { status: "shipped" },
    );
    expect(
      container
        .querySelector("[data-table-state]")
        ?.getAttribute("data-empty-kind"),
    ).toBe("filtered");
    expect(
      screen.queryByText(
        "No batteries yet. Log the first one, or ask a Handler to.",
      ),
    ).toBeNull();
    expect(
      screen.getByText("No batteries match these filters"),
    ).toBeInTheDocument();
  });

  it("offers Clear filters, which keeps the sort and drops the narrowing", () => {
    renderTable(
      { rows: [], total: 0, filteredEmpty: { noun: "batteries" } },
      { status: "shipped", dir: "desc" },
    );
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/batteries?dir=desc",
    );
  });

  it("distinguishes an empty search from an empty filter, with its own action", () => {
    const { container } = renderTable(
      { rows: [], total: 0, filteredEmpty: { noun: "batteries" } },
      { q: "no-such-thing" },
    );
    expect(
      container
        .querySelector("[data-table-state]")
        ?.getAttribute("data-empty-kind"),
    ).toBe("search");
    expect(
      screen.getByText('No matches for "no-such-thing"'),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute(
      "href",
      "/batteries",
    );
  });

  it("takes a route-authored headline where the route's own copy is more precise", () => {
    renderTable(
      {
        rows: [],
        total: 0,
        filteredEmpty: { title: "No activity in this range." },
      },
      { status: "shipped" },
    );
    expect(screen.getByText("No activity in this range.")).toBeInTheDocument();
  });

  it("keeps the header, the search box and the count in both empty states", () => {
    const { container } = renderTable(
      { rows: [], total: 0, filteredEmpty: { noun: "batteries" } },
      { status: "shipped" },
    );
    expect(
      container.querySelector("[data-record-table-search]"),
    ).not.toBeNull();
    expect(container.querySelector("[data-record-count]")).not.toBeNull();
  });
});

describe("RecordTable — filters", () => {
  const FILTERS = [
    {
      id: "status",
      label: "Status",
      options: [
        { value: "stored", label: "Stored" },
        { value: "shipped", label: "Shipped" },
      ],
    },
  ];

  it("renders a labelled control per declared filter, at a 44px target", () => {
    const { container } = renderTable({ filters: FILTERS });
    const control = container.querySelector<HTMLElement>(
      "[data-record-table-filter='status']",
    );
    expect(control).not.toBeNull();
    expect(control?.getAttribute("aria-label")).toBe("Status");
    expect(control?.className).toContain("min-h-11");
  });

  it("collapses below md into one Filters button carrying the active count", () => {
    const { container } = renderTable(
      { filters: FILTERS },
      { status: "stored" },
    );
    const trigger = container.querySelector<HTMLElement>(
      "[data-record-table-filters='sheet-trigger']",
    );
    expect(trigger?.textContent).toContain("Filters");
    expect(trigger?.textContent).toContain("1");
    expect(trigger?.className).toContain("min-h-11");
  });
});

describe("RecordTable — the toolbar is never gated here", () => {
  it("renders whatever the route composed, untouched", () => {
    // Export is never disabled for any role that can reach the route, including
    // P5 (E-8a, Rule 5.27). `RecordTable` disables nothing in the toolbar;
    // role-gating it is the route's job.
    renderTable({ toolbar: <button type="button">Export CSV</button> });
    const button = screen.getByRole("button", { name: "Export CSV" });
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute("aria-disabled");
  });
});
