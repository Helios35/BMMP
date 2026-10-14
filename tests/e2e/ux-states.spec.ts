import { expect, test } from "@playwright/test";

import { REJECT_READ_TITLE } from "@/components/extraction-review/review-copy";
import { NO_LIMIT_CAPTION } from "@/components/storage/container-fill-meter";
import { ZERO_CONTAINERS_TITLE } from "@/features/containers/container-copy";
import {
  ALL_IDENTIFIED,
  NOTHING_TO_REVIEW,
} from "@/features/review/review-copy";
import {
  ZERO_CONTAINERS_TITLE as STEP_ONE_ZERO_CONTAINERS,
  ZERO_SHIPMENTS_TITLE,
  ZERO_SHIPMENTS_WHO_CAN,
} from "@/features/shipments/shipment-copy";

import { createContainer, generateLabel } from "./support/documents-flow";
import {
  chooseContainer,
  commitIntake,
  confirmCondition,
  confirmRow,
  continueToPlace,
  fieldRow,
  openReview,
  selectTopCandidate,
  tap,
} from "./support/intake-flow";
import { fixtureIds, storageStateFor } from "./support/roles";

/**
 * `UX_SPEC.md` §2 and §5 states the suite did not yet drive — brief 07
 * outcome 10. The coverage table in the build's verification report maps
 * every state to the line that proves it, or to the reason it cannot be
 * reached on this build's data.
 *
 * **Read-mostly.** Every write here lands on a session the test opened
 * itself; nothing is committed, labelled or shipped, and no Olympic session is
 * driven into a denied route (its audit log stays empty).
 */

const { CONTAINER, INTAKE_SESSION } = fixtureIds;

test.describe("storage clock and fill meters (§2.4, §2.5; E-6, E-7)", () => {
  test.use({ storageState: storageStateFor("p2") });

  test("an overdue drum: critical, full, the overrun stated, the zone shown, the two ways out, and no limit invented", async ({
    page,
  }) => {
    await page.goto(`/containers/${CONTAINER.overdueDrum}`);
    const meter = page
      .locator('[data-meter-state="default"][data-clock-status="overdue"]')
      .first();
    await expect(meter).toHaveAttribute("data-intent", "critical");
    await expect(meter.locator("[data-meter-headline]")).toHaveText(
      /^\d+ days? past the limit$/,
    );
    await expect(meter.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    await expect(meter).toContainText("America/Los_Angeles");
    await expect(meter.locator("[data-meter-overdue-note]")).toBeVisible();
    // E-6 — nothing pauses, snoozes, extends, dismisses or re-dates it.
    await expect(
      page.getByRole("button", {
        name: /pause|snooze|extend|dismiss|re-?date|hold/i,
      }),
    ).toHaveCount(0);
    // §2.5 / E-7 — no limit configured: fill against capacity, and says so.
    await expect(page.getByText(NO_LIMIT_CAPTION).first()).toBeVisible();
  });

  test("a drum within its period reads its remaining time as text", async ({
    page,
  }) => {
    await page.goto(`/containers/${CONTAINER.soundDrum}`);
    const meter = page.locator('[data-meter-state="default"]').first();
    await expect(meter.locator("[data-meter-headline]")).toHaveText(
      /^\d+ days? remaining$/,
    );
    await expect(meter.locator("[data-meter-elapsed]")).toHaveText(
      /^\d+ days? elapsed$/,
    );
  });
});

test.describe("the dashboard's alerts (§2.11; E-6)", () => {
  test.describe("p2", () => {
    test.use({ storageState: storageStateFor("p2") });

    test("the overdue clock is pinned first and has no dismiss", async ({
      page,
    }) => {
      await page.goto("/");
      const first = page.locator("[data-pinned]").first();
      await expect(first).toHaveAttribute("data-pinned", "true");
      await expect(first).toContainText("C-0003");
      await expect(
        first.getByRole("button", { name: /dismiss|snooze|hide|close/i }),
      ).toHaveCount(0);
    });
  });

  test.describe("p3", () => {
    test.use({ storageState: storageStateFor("p3") });

    test("a role no alert is routed to reads the empty state, as a good state", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.locator('[data-alert-state="empty"]')).toContainText(
        "Nothing needs your attention right now.",
      );
    });
  });
});

test.describe("the command palette (§2.14)", () => {
  test.describe("p1", () => {
    test.use({ storageState: storageStateFor("p1") });

    test("opens on Ctrl K, says when nothing matches, and finds a container", async ({
      page,
    }) => {
      await page.goto("/");
      await page.keyboard.press("Control+k");
      const input = page.locator("[cmdk-input]");
      await expect(input).toBeFocused();
      await input.fill("zz-no-such-thing");
      await expect(page.locator('[data-palette-state="empty"]')).toContainText(
        "No matches for “zz-no-such-thing”",
      );
      await input.fill("C-0001");
      await expect(
        page.locator("[cmdk-item]", { hasText: "C-0001" }).first(),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(input).toHaveCount(0);
    });
  });

  test.describe("p3", () => {
    test.use({ storageState: storageStateFor("p3") });

    test("never offers a destination the guard would refuse", async ({
      page,
    }) => {
      await page.goto("/");
      await page.keyboard.press("Control+k");
      const input = page.locator("[cmdk-input]");
      await input.fill("C-0001");
      // P3 cannot open /containers/[id]; the palette never lists one.
      await expect(page.locator('[data-palette-state="empty"]')).toBeVisible();
      await expect(
        page.locator("[cmdk-item]", { hasText: "C-0001" }),
      ).toHaveCount(0);
    });
  });
});

test.describe("empty tenants (E-2, E-15)", () => {
  test.describe("p1Rainier — no containers", () => {
    test.use({ storageState: storageStateFor("p1Rainier") });

    test("/containers says so and offers New container", async ({ page }) => {
      await page.goto("/containers");
      await expect(page.getByText(ZERO_CONTAINERS_TITLE)).toBeVisible();
      await expect(
        page.locator("[data-create-container]").first(),
      ).toBeVisible();
    });

    test("/shipments/new step 1 explains instead of listing nothing", async ({
      page,
    }) => {
      await page.goto("/shipments/new");
      await expect(page.getByText(STEP_ONE_ZERO_CONTAINERS)).toBeVisible();
      await expect(page.locator("[data-candidate]")).toHaveCount(0);
    });
  });

  test.describe("p1Olympic — no shipments, nothing to review", () => {
    test.use({ storageState: storageStateFor("p1Olympic") });

    test("zero shipments offers this role's action; zero review items is a good state", async ({
      page,
    }) => {
      await page.goto("/shipments");
      await expect(page.getByText(ZERO_SHIPMENTS_TITLE)).toBeVisible();
      await expect(page.locator("[data-build-shipment]").first()).toBeVisible();
      await page.goto("/review");
      await expect(page.getByText(NOTHING_TO_REVIEW)).toBeVisible();
    });
  });

  test.describe("p2Olympic — the same, for a role that cannot build", () => {
    test.use({ storageState: storageStateFor("p2Olympic") });

    test("zero shipments names who can build one; P2's inventory view is empty too", async ({
      page,
    }) => {
      await page.goto("/shipments");
      await expect(page.getByText(ZERO_SHIPMENTS_TITLE)).toBeVisible();
      await expect(page.getByText(ZERO_SHIPMENTS_WHO_CAN)).toBeVisible();
      await expect(page.locator("[data-build-shipment]")).toHaveCount(0);
      // E-8b/E-15 — P2's own composition, and its own good empty state.
      await page.goto("/review");
      await expect(page.getByText(ALL_IDENTIFIED)).toBeVisible();
    });
  });
});

test.describe("E-8a — a route the auditor cannot reach", () => {
  test.use({ storageState: storageStateFor("p5") });

  test("redirects to / with a toast naming the restriction — no 403, no blank page", async ({
    page,
  }) => {
    await page.goto("/settings/organization");
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
    await expect(page.locator("#page-title")).toBeVisible();
  });
});

test.describe("the review card's quieter states (§2.1)", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("a scuffed read shows Not read and an undecodable date code, never a guess", async ({
    page,
  }) => {
    await page.goto(
      `/batteries/new?session=${INTAKE_SESSION.scuffedInReview}&step=2`,
    );
    await expect(page.locator("[data-review-card]")).toBeVisible();
    await expect(page.locator("[data-review-card]")).toContainText("Not read");
    await expect(fieldRow(page, "date_code")).toContainText(/undecodable/i);
  });

  test("a clean read: no gate banner, the match basis stated, Change reopens a confirmed row", async ({
    page,
  }) => {
    test.slow();
    await openReview(page, "label-clean.png");
    await expect(page.locator("[data-gate-banner]")).toHaveCount(0);
    await expect(page.locator("[data-match-basis]").first()).toContainText(
      /matched on/i,
    );
    await confirmRow(page, "manufacturer");
    const row = fieldRow(page, "manufacturer");
    await tap(row.locator("[data-change]"), "Change");
    await expect(row).toHaveAttribute("data-editing", "true");
  });

  test("a per-field reject, and the whole-read reject asks first and returns to capture", async ({
    page,
  }) => {
    test.slow();
    await openReview(page, "label-clean.png");
    const row = fieldRow(page, "serial_number");
    await tap(row.locator("[data-reject]"), "Reject");
    await expect(row).toHaveAttribute("data-field-status", "rejected");

    await tap(page.locator("[data-reject-read]").first(), "Reject this read");
    const dialog = page.locator("[data-reject-read-dialog]");
    await expect(dialog).toContainText(REJECT_READ_TITLE);
    await dialog.locator("[data-reject-read-confirm]").click();
    await page.waitForURL((url) => url.searchParams.get("step") === "1");
  });

  test("offline: the card disables every confirmation and says why; online again, it does not", async ({
    page,
    context,
  }) => {
    test.slow();
    await openReview(page, "label-clean.png");
    await context.setOffline(true);
    await expect(page.locator("[data-offline-banner]")).toHaveAttribute(
      "data-offline-state",
      "offline",
    );
    await expect(page.locator("[data-review-card]")).toContainText(
      "You're offline",
    );
    await expect(
      fieldRow(page, "model").locator("[data-confirm]"),
    ).toHaveAttribute("aria-disabled", "true");
    await context.setOffline(false);
    await expect(page.locator('[data-offline-state="offline"]')).toHaveCount(0);
  });
});

test.describe("E-9 / §2.6 — a damaged battery blocks air on step 2", () => {
  test.use({ storageState: storageStateFor("p1") });

  test("the notice names the record and its indicator; Air stays visible and unavailable; P6 sees the same", async ({
    page,
    browser,
  }) => {
    test.slow();
    // A quarantine container this test makes — never the fixture drum.
    const containerId = await createContainer(
      page,
      "ddr",
      "light_category_ddr",
    );
    await openReview(page, "label-clean.png");
    await confirmRow(page, "model");
    await selectTopCandidate(page);
    await confirmRow(page, "chemistry_code");
    await continueToPlace(page);
    await confirmCondition(page, "swelling", "damaged_or_defective");
    await chooseContainer(page, containerId);
    const recordId = await commitIntake(page);
    await generateLabel(page, containerId);

    const step2 = `/shipments/new?step=2&containers=${containerId}`;
    const expectBlocked = async (target: typeof page): Promise<void> => {
      await target.goto(step2);
      const notice = target.locator('[data-hard-block-notice="air"]');
      await expect(notice).toHaveAttribute("role", "alert");
      await expect(
        notice.locator(`[data-hard-block-item="${recordId}"]`),
      ).toContainText(/swelling/i);
      for (const path of ["ground", "remove", "reassess"]) {
        await expect(
          notice.locator(`[data-hard-block-path="${path}"]`),
        ).toBeVisible();
      }
      // Visible and unavailable — never hidden (§2.6 Default).
      await expect(target.locator('[data-mode-option="air"]')).toHaveAttribute(
        "data-mode-available",
        "false",
      );
      await expect(
        target.getByRole("button", {
          name: /proceed anyway|override|i understand/i,
        }),
      ).toHaveCount(0);
    };

    await expectBlocked(page);

    const admin = await browser.newContext({
      storageState: storageStateFor("p6"),
    });
    try {
      await expectBlocked(await admin.newPage());
    } finally {
      await admin.close();
    }
  });
});
