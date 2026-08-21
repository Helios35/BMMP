import { expect, test, type Page } from "@playwright/test";

import { personaFor, storageStateFor } from "./support/roles";

/**
 * **E-16 — a user who belongs to one organization gets no switcher at all**
 * (`UX_SPEC.md` §5, `SITE_ARCHITECTURE.md` §2.4, §6).
 *
 * Not a disabled control, not a single-item menu: the organization's *name*
 * renders as static text and nothing else. Knowing which tenant you are in is
 * load-bearing in a multi-tenant compliance product; a control that switches to
 * the place you already are is not.
 *
 * **Both halves are asserted, and that is the point.** A test that only proved
 * the absence would pass just as well against a switcher that was broken for
 * everybody, which would be a worse defect than the one E-16 describes. So the
 * two-organization session is driven in the same file, against the same
 * selectors, and its menu is opened and read.
 *
 * **The sessions are chosen by property, not by role.** E-16 turns on how many
 * organizations a session can act in, so the personas are named through the
 * `singleOrganization` / `twoOrganizations` aliases — Marta is the only fixture
 * identity with two in-force memberships, and the day Dana is invited to a
 * second tenant the alias moves rather than this file silently becoming wrong.
 *
 * **Nothing here submits a switch.** Choosing an organization is an explicit,
 * recorded act that re-scopes every subsequent query (Rules 1.3, 1.5); reading
 * the menu is what E-16 is about, and submitting one would leave a session
 * pointing at a different tenant for whatever ran next.
 */

const SWITCHER = "[data-organization-switcher]";
const OPTION = "[data-organization-option]";

/** 1280 × 800 desktop and 375 × 812 phone — §2.2's two navigation shapes. */
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 375, height: 812 },
] as const;

async function openDashboard(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.locator("#page-title")).toBeVisible();
}

test.describe("E-16 — one membership", () => {
  test.use({ storageState: storageStateFor("singleOrganization") });

  for (const viewport of VIEWPORTS) {
    test(`no switcher is rendered on ${viewport.name}, and the tenant is still named`, async ({
      page,
    }) => {
      const persona = personaFor("singleOrganization");
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await openDashboard(page);

      const switcher = page.locator(SWITCHER);
      await expect(switcher).toHaveCount(1);
      await expect(switcher).toHaveAttribute(
        "data-organization-switcher",
        "absent",
      );

      // Absent means absent: no menu, no sheet, no option, and nothing a
      // pointer or a keyboard can operate.
      await expect(page.locator(OPTION)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /switch organi[sz]ation/i }),
      ).toHaveCount(0);
      await expect(switcher.locator("button")).toHaveCount(0);

      // The name is the part that must not be lost with the control.
      await expect(switcher).toContainText(persona.organizationName);
    });
  }
});

test.describe("E-16 — two memberships", () => {
  test.use({ storageState: storageStateFor("twoOrganizations") });

  for (const viewport of VIEWPORTS) {
    test(`a switcher is rendered on ${viewport.name}`, async ({ page }) => {
      const persona = personaFor("twoOrganizations");
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await openDashboard(page);

      const switcher = page.locator(SWITCHER);
      await expect(switcher).toHaveCount(1);
      // The assertion that stops the absence above passing because the control
      // is broken for everyone.
      await expect(switcher).not.toHaveAttribute(
        "data-organization-switcher",
        "absent",
      );
      await expect(switcher).toContainText(persona.organizationName);
      await expect(
        page.getByRole("button", { name: /switch organi[sz]ation/i }),
      ).toBeVisible();
    });
  }

  test("the menu names every organization this session can act in, and the role held in each", async ({
    page,
  }) => {
    const active = personaFor("twoOrganizations");
    const second = personaFor("p2Olympic");
    await openDashboard(page);

    await page.locator('[data-organization-switcher="menu"]').click();

    const options = page.locator(OPTION);
    await expect(options).toHaveCount(2);
    await expect(
      options.filter({ hasText: active.organizationName }),
    ).toHaveCount(1);
    await expect(
      options.filter({ hasText: second.organizationName }),
    ).toHaveCount(1);

    // Exactly one is current, and it is the organization the session is scoped
    // to — a menu that marks none or marks both tells a reader nothing.
    await expect(page.locator(`${OPTION}[data-active="true"]`)).toHaveCount(1);
    await expect(page.locator(`${OPTION}[data-active="true"]`)).toContainText(
      active.organizationName,
    );

    // Rules 1.4, 1.5, 1.22 — roles never combine and never leak across
    // organizations, and naming the role per row is what makes that visible
    // rather than merely true. Marta is a Facility Manager in both, so the
    // label appears on both rows.
    for (const index of [0, 1]) {
      await expect(options.nth(index)).toContainText("Facility Manager");
    }

    // Closed without switching. Escape returns focus to the trigger, which is
    // Radix's own behaviour and is not overridden (§1.5).
    await page.keyboard.press("Escape");
    await expect(page.locator(OPTION)).toHaveCount(0);
  });
});
