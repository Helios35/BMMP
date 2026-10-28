import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { BATTERY_CSV_HEADERS } from "@/features/battery-record/battery-csv";
import { REVIEW_CSV_HEADERS } from "@/features/review/review-csv";
import { SHIPMENT_CSV_HEADERS } from "@/features/shipments/shipment-csv";
import { csvLine } from "@/lib/export/csv";

import { storageStateFor, type PersonaKey } from "./support/roles";

/**
 * **CSV export of `/batteries`, `/shipments` and `/review`'s P2 view** — D-50;
 * `UX_SPEC.md` §3.5, §3.8b, §3.11; Rules 12.17–12.19, 5.27; brief b1a-08
 * outcome 3.
 *
 * Export is P2's, P5's and P6's (`SITE_ARCHITECTURE.md` §5.2). P1 is refused
 * — no control on the page, and a `403` from the handler if the URL is typed
 * anyway (Rule 12.17: scope is enforced on the export, not on the screen).
 * `/review` is read by P1, P2 and P6 only, so P5 is refused there too; P6
 * reads `/review` as the work queue, so P6 takes P2's view by its URL.
 *
 * The control is a plain anchor, and the file is fetched with the page's own
 * session — the same request a click makes, without a download prompt.
 * Tenancy, the `export.generated` row and the lapsed grant are proven against
 * the handlers in `tests/integration/list-export-routes.test.ts`.
 */

/** No figure a reader could take for a chance of ignition (Rule 1.25) — `harness.spec.ts`'s sweep. */
const IGNITION_PROBABILITY =
  /probabilit|likelihood|likely to (ignite|catch fire|combust)|risk of (fire|ignition|thermal)|chance of (fire|ignition|thermal runaway|ignit)|odds of (fire|ignition)|ignition (score|rate|risk)|fire risk/i;

/** U+FEFF — every export starts with it, so a spreadsheet reads UTF-8. */
const BYTE_ORDER_MARK = 0xfeff;

interface ListExport {
  readonly name: "batteries" | "shipments" | "review";
  readonly route: string;
  readonly path: string;
  readonly headers: readonly string[];
}

const LISTS: readonly ListExport[] = [
  {
    name: "batteries",
    route: "/batteries",
    path: "/api/exports/batteries",
    headers: BATTERY_CSV_HEADERS,
  },
  {
    name: "shipments",
    route: "/shipments",
    path: "/api/exports/shipments",
    headers: SHIPMENT_CSV_HEADERS,
  },
  {
    name: "review",
    route: "/review",
    path: "/api/exports/review",
    headers: REVIEW_CSV_HEADERS,
  },
];

/** Which persona reaches the control on the page, and which only the URL. */
const EXPORTERS: readonly {
  readonly persona: PersonaKey;
  readonly onPage: readonly ListExport["name"][];
  readonly refused: readonly ListExport["name"][];
}[] = [
  { persona: "p2", onPage: ["batteries", "shipments", "review"], refused: [] },
  { persona: "p5", onPage: ["batteries", "shipments"], refused: ["review"] },
  { persona: "p6", onPage: ["batteries", "shipments"], refused: [] },
];

async function expectCsv(
  response: APIResponse,
  list: ListExport,
): Promise<string> {
  expect(response.status(), `${list.path} answered`).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(response.headers()["content-disposition"]).toContain("attachment");
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.text();
  expect(body.charCodeAt(0)).toBe(BYTE_ORDER_MARK);
  const [headerLine] = body.slice(1).split("\r\n");
  expect(headerLine).toBe(csvLine(list.headers));
  expect(body).not.toMatch(IGNITION_PROBABILITY);
  return body;
}

async function expectRefused(page: Page, list: ListExport): Promise<void> {
  const response = await page.request.get(list.path);
  expect(response.status(), `${list.path} refused`).toBe(403);
  expect(response.headers()["content-type"]).toContain(
    "application/problem+json",
  );
  const problem = (await response.json()) as { readonly status?: unknown };
  expect(problem.status).toBe(403);
}

for (const { persona, onPage, refused } of EXPORTERS) {
  test.describe(`${persona.toUpperCase()} exports`, () => {
    test.use({ storageState: storageStateFor(persona) });

    for (const list of LISTS) {
      if (refused.includes(list.name)) {
        test(`${list.route} — refused, by the handler as well as the screen`, async ({
          page,
        }) => {
          await expectRefused(page, list);
        });
        continue;
      }

      test(`${list.route} — a CSV of the list, never disabled`, async ({
        page,
      }) => {
        let href = list.path;
        if (onPage.includes(list.name)) {
          await page.goto(list.route);
          const control = page.locator(`[data-export-control="${list.name}"]`);
          await expect(control).toBeVisible();
          // E-8a, Rule 5.27 — export is never disabled, for any role here.
          await expect(control).toHaveAttribute(
            "data-control-treatment",
            "enabled",
          );
          await expect(control).not.toHaveAttribute("aria-disabled", "true");
          href = (await control.getAttribute("href")) ?? "";
          expect(href.startsWith(list.path)).toBe(true);
        }
        const body = await expectCsv(await page.request.get(href), list);
        if (list.name === "batteries") expect(body).toContain("BR-0001");
        if (list.name === "shipments") expect(body).toContain("SH-0003");
      });
    }
  });
}

test.describe("P1 exports nothing", () => {
  test.use({ storageState: storageStateFor("p1") });

  for (const list of LISTS) {
    test(`${list.route} — no control, and the handler refuses`, async ({
      page,
    }) => {
      await page.goto(list.route);
      // Not vacuous: the page rendered its list or queue before the count.
      await expect(page.locator("#page-title")).toBeVisible();
      await expect(
        page.locator(`[data-export-control="${list.name}"]`),
      ).toHaveCount(0);
      await expectRefused(page, list);
    });
  }
});
