import { expect, test } from "@playwright/test";

import type { AppRoute } from "@/domain/access/routes";

import { COLUMN_ROLE, MATRIX } from "../support/site-route-matrix";
import { fixtureIds, storageStateFor, type PersonaKey } from "./support/roles";

/**
 * `SITE_ARCHITECTURE.md` §5.2 against the **running guard**, persona by
 * persona — the security sweep's "route access per role, proven by test"
 * (brief 07 outcome 11; D-61 #3).
 *
 * Every authenticated route is visited by each of the six roles. A route the
 * role reaches renders; a route it cannot reach redirects to `/` (§5.3(4)),
 * never a 403 page. The matrix is the document's, transcribed once in
 * `tests/support/site-route-matrix.ts`; the unit test proves the map equals
 * it, and this proves the app enforces it.
 *
 * Denials are recorded (Rule 12.6) — in Cascade only. No Olympic session is
 * driven here.
 */

const { BATTERY, CATALOG, CONTAINER, DOCUMENT_RENDER, SHIPMENT } = fixtureIds;

/** A concrete, read-only URL for each route pattern. */
const URL_FOR: Readonly<Record<keyof typeof MATRIX, string>> = {
  "/": "/",
  "/batteries": "/batteries",
  "/batteries/new": "/batteries/new",
  "/batteries/[id]": `/batteries/${BATTERY.vehicleTraction}`,
  "/review": "/review",
  "/containers": "/containers",
  "/containers/[id]": `/containers/${CONTAINER.soundDrum}`,
  "/shipments": "/shipments",
  "/shipments/new": "/shipments/new",
  "/shipments/[id]": `/shipments/${SHIPMENT.julyDelivered}`,
  "/documents/[id]": `/documents/${DOCUMENT_RENDER.soundDrumLabel}`,
  "/catalog": "/catalog",
  "/catalog/[id]": `/catalog/${CATALOG.vehicleTractionNmc}`,
  "/settings/organization": "/settings/organization",
  "/settings/users": "/settings/users",
  "/settings/catalog": "/settings/catalog",
  "/audit": "/audit",
};

const PERSONA_FOR_COLUMN: readonly PersonaKey[] = [
  "p1",
  "p2",
  "p3",
  "p4",
  "p5",
  "p6",
];

PERSONA_FOR_COLUMN.forEach((persona, column) => {
  test.describe(`${persona} (${COLUMN_ROLE[column]})`, () => {
    test.use({ storageState: storageStateFor(persona) });

    test("reaches exactly the routes §5.2 gives it, and is turned back from the rest", async ({
      page,
    }) => {
      test.slow();
      for (const [route, row] of Object.entries(MATRIX) as [
        keyof typeof MATRIX,
        (typeof MATRIX)[keyof typeof MATRIX],
      ][]) {
        const url = URL_FOR[route];
        await page.goto(url);
        await expect(page.locator("#page-title")).toBeVisible();
        const landed = new URL(page.url()).pathname;
        const reaches = row[column] !== "—";
        expect(
          landed,
          `${persona} on ${route as AppRoute}: §5.2 says ${row[column]}`,
        ).toBe(reaches ? new URL(url, "http://x").pathname : "/");
      }
    });
  });
});
