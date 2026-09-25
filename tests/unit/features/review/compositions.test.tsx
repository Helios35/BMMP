// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { READ_ONLY_BANNER_MESSAGE } from "@/components/access/read-only-banner";
import {
  decodeListQuery,
  type ListQuerySpec,
} from "@/components/record-table/list-url";
import { InventorySummarySheet } from "@/features/review/components/inventory-summary-sheet";
import { UnidentifiedInventoryView } from "@/features/review/components/unidentified-inventory";
import {
  NothingToReview,
  WorkQueueList,
} from "@/features/review/components/work-queue-list";
import {
  ALL_IDENTIFIED,
  FILTERED_EMPTY_TITLE,
  NOTHING_TO_REVIEW,
  NOTHING_TO_REVIEW_BODY,
  UNIDENTIFIED_WHY,
  unidentifiedHeadline,
} from "@/features/review/review-copy";
import type {
  InventorySummary,
  UnidentifiedInventory,
} from "@/features/review/server/inventory";
import type { WorkQueueEntry } from "@/features/review/server/work-queue";

/**
 * `/review`'s compositions, rendered — `UX_SPEC.md` §3.8a, §3.8b, E-8b, E-15.
 *
 * **P2's screen is a different screen, not a disabled copy.** These tests
 * render her composition and assert that the card, Confirm, Void and the
 * read-only banner are **absent** — not greyed, not tooltipped, not present —
 * and that what she can do is there. The server's own refusal of her writes is
 * proven in `tests/integration/review-actions.test.ts`; composition is never
 * the enforcement.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/review",
}));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const SPEC: ListQuerySpec = {
  sortableColumnIds: [],
  defaultSort: "",
  defaultDir: "asc",
  filterIds: ["site", "container", "tier", "age"],
};

const CLOCK = {
  id: "clock-1",
  organizationId: "org-1",
  subjectType: "container",
  batteryRecordId: null,
  containerId: "c-1",
  clockStartAt: "2026-07-01T00:00:00.000Z",
  clockStartBasis: "first_placement",
  timeZone: "America/Los_Angeles",
  maxDurationDays: 365,
  governingRuleVersionId: "rv-1",
  evaluationTrace: [],
  dueAt: "2027-07-01T00:00:00.000Z",
  alertSchedule: {},
  alertBand: "none" as const,
  nextAlertAt: null,
  stoppedAt: null,
  stopReason: null,
  status: "running" as const,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

function inventory(
  overrides: Partial<UnidentifiedInventory> = {},
): UnidentifiedInventory {
  return {
    total: 2,
    groups: [
      {
        container: {
          id: "c-1",
          code: "C-0014",
          site: "1420 Industrial Way SW, Tumwater",
          classLabel: "Light category — sound",
          classRecognised: true,
          clock: CLOCK as never,
          clockTierLabel: "No alert",
          placedCount: 20,
        },
        rows: [
          {
            id: "s-1",
            recordId: "br-1",
            recordNumber: "BR-0011",
            containerId: "c-1",
            site: "1420 Industrial Way SW, Tumwater",
            queuedSince: "2026-09-20T00:00:00.000Z",
            ageLabel: "5 days ago",
            flaggedFieldCount: 3,
          },
        ],
      },
      {
        container: null,
        rows: [
          {
            id: "s-2",
            recordId: "br-2",
            recordNumber: "BR-0012",
            containerId: null,
            site: "1420 Industrial Way SW, Tumwater",
            queuedSince: "2026-09-21T00:00:00.000Z",
            ageLabel: "4 days ago",
            flaggedFieldCount: 1,
          },
        ],
      },
    ],
    options: { site: [], container: [], tier: [], age: [] },
    ...overrides,
  };
}

function renderInventory(
  value: UnidentifiedInventory,
  params: Record<string, string> = {},
) {
  return render(
    <UnidentifiedInventoryView
      inventory={value}
      query={decodeListQuery(params, SPEC)}
      querySpec={SPEC}
      filters={[]}
      asOf="2026-09-25T12:00:00.000Z"
      canOpenContainer
      canSeeContainerAlerts
    />,
  );
}

describe("P2's view — composed for her question (§3.8b)", () => {
  it("opens with a neutral alert saying what the screen is for, in her language", () => {
    const { container } = renderInventory(inventory());
    const purpose = container.querySelector("[data-inventory-purpose]");
    expect(purpose).toHaveAttribute("data-intent", "neutral");
    expect(purpose?.textContent).toContain(unidentifiedHeadline(2));
    expect(purpose?.textContent).toContain(UNIDENTIFIED_WHY);
  });

  it("groups by container with a roll-up row carrying the clock tier and the segregation class", () => {
    const { container } = renderInventory(inventory());
    const rollUp = container.querySelector("[data-rollup-row]");
    expect(rollUp?.textContent).toBe(
      "C-0014 · 1 unidentified of 21 · clock No alert · Light category — sound",
    );
    expect(
      container.querySelector("[data-open-container='c-1']"),
    ).toHaveAttribute("href", "/containers/c-1");
    expect(
      container.querySelector("[data-inventory-group='none']"),
    ).not.toBeNull();
  });

  it("E-8b — the card, Confirm, Void and the read-only banner are absent, not disabled", () => {
    const { container } = renderInventory(inventory());
    expect(container.querySelector("[data-review-card]")).toBeNull();
    expect(container.querySelector("[data-void-item]")).toBeNull();
    expect(container.querySelector("[data-primary-action]")).toBeNull();
    // §2.9 — the banner is P5's; E-8b: never P2's on this route.
    expect(container.textContent).not.toContain(READ_ONLY_BANNER_MESSAGE);
    expect(container.querySelector("[data-banner-state]")).toBeNull();
    expect(container.querySelector("[aria-disabled='true']")).toBeNull();
    expect(container.querySelector("input[type='checkbox']")).toBeNull();
    for (const name of [
      /confirm/i,
      /^void/i,
      /reject/i,
      /change/i,
      /commit/i,
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("E-15 — every battery identified reads as her assurance, not an absence of work", () => {
    const { container } = renderInventory(inventory({ total: 0, groups: [] }));
    const empty = container.querySelector("[data-review-empty]");
    expect(empty).toHaveAttribute("data-review-empty", "all-identified");
    expect(empty).toHaveAttribute("data-intent", "ok");
    expect(empty?.textContent).toContain(ALL_IDENTIFIED);
  });

  it("E-15 — filters that exclude everything say so, and never the all-identified copy", () => {
    const { container } = renderInventory(inventory({ groups: [] }), {
      container: "c-9",
    });
    const empty = container.querySelector("[data-table-empty='filtered']");
    expect(empty?.textContent).toContain(FILTERED_EMPTY_TITLE);
    expect(empty?.textContent).not.toContain(ALL_IDENTIFIED);
    expect(container.querySelector("[data-clear-narrowing]")).toHaveAttribute(
      "href",
      "/review",
    );
  });
});

describe("P2's summary panel — read-only, nothing on it acts (§3.8b)", () => {
  const summary: InventorySummary = {
    sessionId: "s-1",
    recordId: "br-1",
    recordNumber: "BR-0011",
    containerId: "c-1",
    crop: { label: "Label crop", width: 640, height: 240 },
    fields: [
      {
        fieldCode: "manufacturer",
        label: "Manufacturer",
        value: "Northvale Cell Systems",
        source: "read_from_label",
        confidenceBand: "high",
        status: "pending",
      },
      {
        fieldCode: "model",
        label: "Model / part number",
        value: null,
        source: "read_from_label",
        confidenceBand: "not_extracted",
        status: "pending",
      },
    ],
    unconfirmed:
      "Model / part number, Chemistry code and Assessed condition are not yet confirmed.",
  };

  it("shows what was read and what is unconfirmed, and offers the record and the container", async () => {
    render(
      <InventorySummarySheet
        summary={summary}
        closeHref="/review"
        canOpenRecord
        canOpenContainer
      />,
    );
    const panel = await screen.findByRole("dialog");
    expect(panel.textContent).toContain(summary.unconfirmed);
    expect(panel.querySelectorAll("[data-summary-field]")).toHaveLength(2);
    expect(panel.querySelector("[data-summary-open-record]")).toHaveAttribute(
      "href",
      "/batteries/br-1",
    );
    expect(
      panel.querySelector("[data-summary-open-container]"),
    ).toHaveAttribute("href", "/containers/c-1");
    for (const name of [/confirm/i, /^void/i, /reject/i, /change/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(panel.querySelector("[data-review-card]")).toBeNull();
  });
});

describe("P1's queue — the list, and the good empty state (§3.8a)", () => {
  const entries: readonly WorkQueueEntry[] = [
    {
      kind: "intake",
      id: "s-1",
      recordId: "br-1",
      recordNumber: "BR-0011",
      title: "Northvale Cell Systems NV-TP400",
      queuedSince: "2026-09-20T00:00:00.000Z",
      ageLabel: "5 days ago",
      reasons: [
        {
          storedValue: "no_fields_extracted",
          label: "Label unreadable",
        },
        { storedValue: "legacy_code", label: null },
      ],
      flaggedFieldCount: 4,
      containerCode: null,
    },
    {
      kind: "rematch",
      id: "a-1",
      recordId: "br-2",
      recordNumber: "BR-0012",
      title: null,
      queuedSince: "2026-09-21T00:00:00.000Z",
      ageLabel: "4 days ago",
      reasons: [
        {
          storedValue: "catalog_rematch",
          label: "An approved catalog entry matches this record",
        },
      ],
      flaggedFieldCount: null,
      containerCode: "C-0001",
    },
  ];

  it("links each item to ?item=, states why it is here, and marks the open one", () => {
    const { container } = render(
      <WorkQueueList entries={entries} selectedId="a-1" explicit />,
    );
    const first = container.querySelector("[data-queue-item='s-1']");
    expect(first).toHaveAttribute("href", "/review?item=s-1");
    expect(first?.textContent).toContain("Label unreadable");
    // An unrecognised stored code renders as stored, in mono (§5.8).
    expect(
      first?.querySelector("[data-queue-reason='legacy_code']")?.className,
    ).toContain("text-mono");
    expect(container.querySelector("[data-queue-item='a-1']")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("E-15 — nothing to review is the ok state, with the spec's sentence", () => {
    const { container } = render(<NothingToReview />);
    const empty = container.querySelector("[data-review-empty]");
    expect(empty).toHaveAttribute("data-intent", "ok");
    expect(empty?.textContent).toContain(NOTHING_TO_REVIEW);
    expect(empty?.textContent).toContain(NOTHING_TO_REVIEW_BODY);
  });
});
