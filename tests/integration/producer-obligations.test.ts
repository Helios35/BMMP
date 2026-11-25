import { beforeEach, describe, expect, it } from "vitest";

import { mockAdapter, mockStore, resetMockStore } from "@/data/mock";
import * as ID from "@/data/mock/fixtures/ids";
import {
  OBLIGATION_CSV_HEADERS,
  obligationCsvRows,
} from "@/features/obligations/obligations-csv";
import { readObligationsPage } from "@/features/obligations/server/read-obligations";
import {
  checkObligationsFor,
  runProducerObligationsJob,
} from "@/features/obligations/server/run";
import { ConflictError, PermissionError, ValidationError } from "@/lib/errors";

import { ctx, MANAGER, NO_ATTRIBUTION } from "./document-support";

/**
 * Producer obligations end to end on the mock — Rules 8.6–8.16; D-78.
 *
 * A run writes only what changed and one `producer_obligation.evaluated` row;
 * a completion survives every run; products and deadlines are P3's and P6's;
 * the job writes as `scheduled_job` and never runs for an organization with
 * no product (Olympic's audit log stays empty).
 */

const NOW = "2026-11-18T18:00:00.000Z";
const LATER = "2026-11-18T19:00:00.000Z";

const PRODUCER = ctx({
  userId: ID.USER.priyaProducer,
  role: "producer_compliance_officer",
});
const AUDITOR = ctx({ userId: ID.USER.samAuditor, role: "auditor" });
const PLATFORM_ADMIN = ctx({
  userId: ID.USER.platformAdmin,
  role: "platform_admin",
  isPlatformAdmin: true,
});

beforeEach(() => {
  resetMockStore();
});

function auditOf(eventType: string, organizationId: string = ID.ORG.cascade) {
  return mockStore()
    .auditEvents.all()
    .filter(
      (row) =>
        row.eventType === eventType && row.organizationId === organizationId,
    );
}

function currentObligation(state: string, key: string) {
  return mockStore()
    .producerObligations.all()
    .find(
      (row) =>
        row.isCurrent &&
        row.jurisdictionId === state &&
        row.obligationKey === key,
    );
}

function deadlinesOf(obligationId: string | undefined) {
  return mockStore()
    .obligationDeadlines.all()
    .filter((row) => row.producerObligationId === obligationId);
}

describe("the seeded run", () => {
  it("shows Cascade's obligations before anyone presses Check now", async () => {
    expect(auditOf("producer_obligation.evaluated")).toHaveLength(1);
    const page = await readObligationsPage(PRODUCER, NOW);
    expect(page.lastRun?.trigger).toBe("nightly_job");
    expect(page.basisLine).toMatch(
      /^From your products and the states you sell in/u,
    );
    expect(page.model.states.map((row) => row.state.code)).toContain("US-FL");
    const florida = page.model.states.find((row) => row.state.code === "US-FL");
    expect(florida?.noRulesWords).toBe(
      "No producer rules on file for Florida. This doesn't mean none apply.",
    );
    // DC's deadline is done, with its note.
    const dc = deadlinesOf(
      currentObligation(ID.JURISDICTION.districtOfColumbia, "participate")?.id,
    );
    expect(dc.map((row) => row.status)).toEqual(["completed"]);
    expect(dc[0]?.completionNote).not.toBe("");
    // Olympic and Rainier declare nothing.
    expect(auditOf("producer_obligation.evaluated", ID.ORG.olympic)).toEqual(
      [],
    );
    expect(auditOf("producer_obligation.evaluated", ID.ORG.rainier)).toEqual(
      [],
    );
  });

  it("shows a product's band in each state in the law's terms", async () => {
    const page = await readObligationsPage(PRODUCER, NOW);
    const kestrel = page.model.products.find(
      (row) => row.id === ID.PRODUCER_PRODUCT.kestrelScrubberLfp,
    );
    expect(kestrel?.states.map((row) => row.words)).toEqual([
      "Medium format battery in CT",
      "Not covered in DC",
      "Large format battery in WA",
    ]);
    const harbor = page.model.products.find(
      (row) => row.id === ID.PRODUCER_PRODUCT.harborTrollingLfp,
    );
    expect(harbor?.states.map((row) => row.words)).toEqual([
      "Can't tell in OR: weight not recorded",
      "Can't tell in WA: weight not recorded",
    ]);
    expect(harbor?.missingValues).toEqual(["weight not recorded"]);
  });
});

describe("a product change sets a run going (Rules 8.6, 8.11)", () => {
  it("adds a product and its bands, with an audit row each for the product and the run", async () => {
    const product = await mockAdapter.producerProducts.add(PRODUCER, {
      catalogEntryId: ID.CATALOG.mobilityScooterSla,
      jurisdictionIds: [
        ID.JURISDICTION.washington,
        ID.JURISDICTION.districtOfColumbia,
      ],
      at: NOW,
      attribution: NO_ATTRIBUTION,
    });
    await checkObligationsFor(PRODUCER, NOW, NO_ATTRIBUTION, "product_added");
    expect(auditOf("producer_product.added")).toHaveLength(1);
    expect(auditOf("producer_obligation.evaluated")).toHaveLength(2);
    const page = await readObligationsPage(PRODUCER, NOW);
    const added = page.model.products.find((row) => row.id === product.id);
    expect(added?.states.map((row) => row.words)).toEqual([
      "Not covered in DC",
      "Large format battery in WA",
    ]);
  });

  it("refuses a product already declared, and an entry that is not published", async () => {
    await expect(
      mockAdapter.producerProducts.add(PRODUCER, {
        catalogEntryId: ID.CATALOG.tidewaterAlkalineAa,
        jurisdictionIds: [ID.JURISDICTION.washington],
        at: NOW,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(ConflictError);
    await expect(
      mockAdapter.producerProducts.add(PRODUCER, {
        catalogEntryId: "00000000-0000-4000-8000-00000000ffff",
        jurisdictionIds: [ID.JURISDICTION.washington],
        at: NOW,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("lets P6 act and refuses P2 and P5 (Rule 8.15)", async () => {
    const input = {
      catalogEntryId: ID.CATALOG.mobilityScooterSla,
      jurisdictionIds: [ID.JURISDICTION.washington],
      at: NOW,
      attribution: NO_ATTRIBUTION,
    };
    await expect(
      mockAdapter.producerProducts.add(MANAGER, input),
    ).rejects.toThrow(PermissionError);
    await expect(
      mockAdapter.producerProducts.add(AUDITOR, input),
    ).rejects.toThrow(PermissionError);
    await expect(
      checkObligationsFor(MANAGER, NOW, NO_ATTRIBUTION, "check_now"),
    ).rejects.toThrow(PermissionError);
    await expect(
      mockAdapter.producerProducts.add(PLATFORM_ADMIN, input),
    ).resolves.toMatchObject({ catalogEntryId: ID.CATALOG.mobilityScooterSla });
  });

  it("removing the only product in a state withdraws its open deadlines", async () => {
    const oregon = currentObligation(ID.JURISDICTION.oregon, "participate");
    expect(deadlinesOf(oregon?.id).map((row) => row.status)).toEqual(["open"]);
    await mockAdapter.producerProducts.changeStates(
      PRODUCER,
      ID.PRODUCER_PRODUCT.harborTrollingLfp,
      {
        jurisdictionIds: [ID.JURISDICTION.washington],
        at: NOW,
        attribution: NO_ATTRIBUTION,
      },
    );
    const run = await checkObligationsFor(
      PRODUCER,
      NOW,
      NO_ATTRIBUTION,
      "product_changed",
    );
    expect(run.counts.withdrawn).toBeGreaterThan(0);
    const next = currentObligation(ID.JURISDICTION.oregon, "participate");
    expect(next?.status).toBe("not_applicable");
    expect(next?.supersedesProducerObligationId).toBe(oregon?.id);
    expect(deadlinesOf(next?.id).map((row) => row.status)).toEqual([
      "withdrawn",
    ]);
  });
});

describe("Check now (Rule 8.11)", () => {
  it("writes only what changed — a second run writes nothing", async () => {
    await checkObligationsFor(PRODUCER, NOW, NO_ATTRIBUTION, "check_now");
    const second = await checkObligationsFor(
      PRODUCER,
      LATER,
      NO_ATTRIBUTION,
      "check_now",
    );
    expect(second.counts.written).toBe(0);
    expect(second.counts.deadlinesAdded).toBe(0);
    expect(auditOf("producer_obligation.evaluated")).toHaveLength(3);
  });
});

describe("marking a deadline done (Rule 8.12)", () => {
  function illinois() {
    const obligation = currentObligation(
      ID.JURISDICTION.illinois,
      "participate",
    );
    const [deadline] = deadlinesOf(obligation?.id);
    if (deadline === undefined) throw new Error("no Illinois deadline");
    return deadline;
  }

  it("needs a date and a note, never a future date, and resolves its alerts", async () => {
    const deadline = illinois();
    await expect(
      mockAdapter.obligationDeadlines.complete(PRODUCER, deadline.id, {
        completedOn: "2026-11-01",
        note: "   ",
        reference: null,
        at: NOW,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      mockAdapter.obligationDeadlines.complete(PRODUCER, deadline.id, {
        completedOn: "2099-01-01",
        note: "Joined.",
        reference: null,
        at: NOW,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(ValidationError);
    const done = await mockAdapter.obligationDeadlines.complete(
      PRODUCER,
      deadline.id,
      {
        completedOn: "2026-11-01",
        note: "Joined The Battery Network for Illinois.",
        reference: "BN-IL-1",
        at: NOW,
        attribution: NO_ATTRIBUTION,
      },
    );
    expect(done).toMatchObject({
      status: "completed",
      completedOn: "2026-11-01",
      completedBy: ID.USER.priyaProducer,
      completionReference: "BN-IL-1",
    });
    // DC's and California's seeded completions (b1b-12, b1b-13), and this one.
    expect(auditOf("obligation_deadline.completed")).toHaveLength(3);
    const open = mockStore()
      .alerts.all()
      .filter(
        (alert) =>
          alert.obligationDeadlineId === deadline.id &&
          alert.resolvedAt === null,
      );
    expect(open).toEqual([]);
    await expect(
      mockAdapter.obligationDeadlines.complete(PRODUCER, deadline.id, {
        completedOn: "2026-11-01",
        note: "Again.",
        reference: null,
        at: NOW,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("a run never undoes a completion", async () => {
    const deadline = illinois();
    await mockAdapter.obligationDeadlines.complete(PRODUCER, deadline.id, {
      completedOn: "2026-11-01",
      note: "Joined.",
      reference: null,
      at: NOW,
      attribution: NO_ATTRIBUTION,
    });
    await checkObligationsFor(PRODUCER, LATER, NO_ATTRIBUTION, "check_now");
    await runProducerObligationsJob(
      { job: "producer-obligations", correlationId: "c" },
      LATER,
    );
    expect(
      mockStore()
        .obligationDeadlines.all()
        .find((row) => row.id === deadline.id)?.status,
    ).toBe("completed");
  });

  it("reopens with a reason, and only a done deadline", async () => {
    const deadline = illinois();
    await expect(
      mockAdapter.obligationDeadlines.reopen(PRODUCER, deadline.id, {
        reason: "Not done.",
        at: NOW,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(ConflictError);
    await mockAdapter.obligationDeadlines.complete(PRODUCER, deadline.id, {
      completedOn: "2026-11-01",
      note: "Joined.",
      reference: null,
      at: NOW,
      attribution: NO_ATTRIBUTION,
    });
    const reopened = await mockAdapter.obligationDeadlines.reopen(
      PRODUCER,
      deadline.id,
      {
        reason: "The membership lapsed.",
        at: LATER,
        attribution: NO_ATTRIBUTION,
      },
    );
    expect(reopened).toMatchObject({
      status: "open",
      completedOn: null,
      completionNote: null,
    });
    expect(auditOf("obligation_deadline.reopened")[0]?.reason).toBe(
      "The membership lapsed.",
    );
  });

  it("refuses P2", async () => {
    await expect(
      mockAdapter.obligationDeadlines.complete(MANAGER, illinois().id, {
        completedOn: "2026-11-01",
        note: "Joined.",
        reference: null,
        at: NOW,
        attribution: NO_ATTRIBUTION,
      }),
    ).rejects.toThrow(PermissionError);
  });
});

describe("the nightly job (Rules 8.11, 8.13)", () => {
  const JOB = {
    job: "producer-obligations",
    correlationId: "corr-test",
  } as const;

  it("checks every organization with a product, as scheduled_job, and raises nothing twice", async () => {
    const first = await runProducerObligationsJob(JOB, NOW);
    expect(first.evaluated).toBe(1);
    const [row] = auditOf("producer_obligation.evaluated").slice(-1);
    expect(row).toMatchObject({
      actorType: "scheduled_job",
      actorLabel: "producer-obligations",
    });
    const second = await runProducerObligationsJob(JOB, NOW);
    expect(second.raised).toBe(0);
    // Olympic's audit log stays empty.
    expect(
      mockStore()
        .auditEvents.all()
        .filter((event) => event.organizationId === ID.ORG.olympic),
    ).toEqual([]);
  });

  it("raises one alert per deadline at a time, addressed to P3", async () => {
    await runProducerObligationsJob(JOB, NOW);
    const open = mockStore()
      .alerts.all()
      .filter(
        (alert) =>
          alert.alertType === "obligation_deadline" &&
          alert.resolvedAt === null,
      );
    expect(open.length).toBeGreaterThan(0);
    const perDeadline = new Map<string, number>();
    for (const alert of open) {
      const key = alert.obligationDeadlineId ?? "";
      perDeadline.set(key, (perDeadline.get(key) ?? 0) + 1);
    }
    expect([...perDeadline.values()].every((count) => count === 1)).toBe(true);
    expect(
      open.every((alert) =>
        alert.audienceRoles.includes("producer_compliance_officer"),
      ),
    ).toBe(true);
    expect(open.some((alert) => alert.severity === "critical")).toBe(true);
  });
});

describe("the export (Rule 8.16)", () => {
  it("lists every current obligation and deadline, and a state with no rules", async () => {
    const page = await readObligationsPage(PRODUCER, NOW);
    const rows = obligationCsvRows(page.model, page.people);
    expect(OBLIGATION_CSV_HEADERS).toEqual([
      "State",
      "Law",
      "Obligation",
      "Status",
      "Products and bands",
      "Due date",
      "Due basis",
      "Deadline status",
      "Marked done by",
      "Marked done at",
      "Date met",
      "Note",
      "Reference",
      "Citation",
      "Rule version",
    ]);
    expect(
      rows.every((row) => row.length === OBLIGATION_CSV_HEADERS.length),
    ).toBe(true);
    expect(rows.find((row) => row[0] === "Florida")?.[3]).toBe(
      "No rules on file",
    );
    const dc = rows.find((row) => row[0] === "District of Columbia");
    expect(dc?.[7]).toBe("Done");
    expect(dc?.[8]).toBe("Priya Narang");
    expect(rows.some((row) => row[5]?.startsWith("No date yet — "))).toBe(true);
  });
});
