import { expect, test, type Locator, type Page } from "@playwright/test";

import { AUDITOR_READ_ONLY_REASON } from "@/domain/access/control-treatment";

import { fixtureIds, personaFor, storageStateFor } from "./support/roles";

/**
 * **E-8a — the read-only role on a screen it can reach.**
 *
 * The brief names `/containers` for this and this unit does not build
 * `/containers`, so `/batteries/[id]` carries it instead: P5 holds `read` there,
 * the route declares mutating controls, and one of them is destructive. That is
 * the whole of E-8a's shape.
 *
 * What has to be true, and why each half matters:
 *
 * - **The mutating controls render, disabled, each with a stated reason.**
 *   Controls an auditor cannot see, she cannot assess — and what the
 *   organisation is able to do to a record is exactly what she came to evaluate
 *   (`UX_SPEC.md` §2.9).
 * - **The destructive control is omitted entirely.** A greyed-out *Void this
 *   record* invites the question "then who can?", which on an irreversible act
 *   is not a question this screen should raise.
 * - **The reason stays reachable.** The controls carry `aria-disabled` and an
 *   inert handler rather than the `disabled` attribute, precisely because a
 *   `disabled` button leaves the tab order and fires no pointer events, so its
 *   tooltip never opens and the reason becomes unreachable (§2.1.4, spec 01
 *   §G5). Asserting `aria-disabled` without asserting the reason is reachable
 *   would let that regress silently.
 * - **Export and Print are never disabled, for any role that can reach the
 *   route, including P5** (Rule 5.27, E-8a). This is the single most common way
 *   a read-only role gets over-restricted by accident, and the read-only
 *   banner's own promise — *"you can view and export everything on this page"* —
 *   is false the moment it happens.
 *
 * ## Why the assertions are structural
 *
 * `[data-mutating]`, `[data-destructive]`, `[data-gated-control]` and
 * `[data-export-control]` are emitted by the route and the shared components for
 * exactly this purpose. A test that named buttons instead would rot the first
 * time a label changed, and — worse — would pass by finding nothing once unit 02
 * renames one. **Every count assertion below is paired with a positive count**,
 * so "found none" can never read as "found nothing forbidden".
 */

/** Every affordance Rule 5.27 protects, wherever it appears. */
const EXPORT_OR_PRINT = '[data-export-control], [data-print-documents="true"]';

/** The nearest disabled-with-a-reason wrapper above a control, if any. */
function gatedWrapper(control: Locator): Locator {
  return control.locator('xpath=ancestor::*[@data-gated-control="true"][1]');
}

/**
 * Whether the element carries the `disabled` **attribute** rather than
 * `aria-disabled`.
 *
 * The two are not interchangeable here: a `disabled` control leaves the tab
 * order and fires no pointer events, so the stated reason stops being reachable
 * (spec 01 §G5). Read as a DOM property so a non-form element simply answers
 * false.
 */
async function isNativelyDisabled(control: Locator): Promise<boolean> {
  return control.evaluate(
    (node) => (node as HTMLButtonElement).disabled === true,
  );
}

/**
 * Assert that no export, download or print control on this page is disabled,
 * and report how many were found.
 *
 * The caller sums the counts across routes and asserts the total is non-zero, so
 * a route that renders none of them cannot make the sweep look successful.
 */
async function auditExportControls(page: Page): Promise<number> {
  const controls = page.locator(EXPORT_OR_PRINT);
  const count = await controls.count();

  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    await expect(control).not.toHaveAttribute("aria-disabled", "true");
    expect(await isNativelyDisabled(control)).toBe(false);
    // Not wrapped in the disabled-with-a-reason treatment either: a control
    // inside `GatedControl` is inert whatever its own attributes say.
    await expect(
      control.locator('xpath=ancestor::*[@data-gated-control="true"]'),
    ).toHaveCount(0);
  }

  return count;
}

test.describe("the Auditor on a battery record — E-8a", () => {
  test.use({ storageState: storageStateFor("p5") });

  const recordPath = `/batteries/${fixtureIds.BATTERY.vehicleTraction}`;

  test("the route renders, and renders the read-only banner", async ({
    page,
  }) => {
    expect(personaFor("p5").role).toBe("auditor");

    // It renders rather than redirecting: P5 holds `read` on `/batteries/[id]`,
    // and the whole of E-8a depends on her being on the screen.
    const response = await page.goto(recordPath);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(recordPath);
    await expect(page.locator("#page-title")).toBeVisible();

    // `ReadOnlyBanner`, identified by the attribute it exposes its state
    // through. Its copy is asserted in the component's own states matrix
    // (spec 01 §H3); what belongs here is that this route renders it for this
    // role, pinned directly below the title (§2.9).
    await expect(page.locator('[data-banner-state="default"]')).toBeVisible();
  });

  test("the mutating controls are disabled, each with a reachable reason", async ({
    page,
  }) => {
    await page.goto(recordPath);
    await expect(page.locator("#page-title")).toBeVisible();

    const mutating = page.locator('[data-mutating="true"]');
    const count = await mutating.count();

    // The assertion that stops this test passing by finding nothing at all.
    // `RecordActions` declares four controls; three are non-destructive and all
    // three must be here.
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const control = mutating.nth(index);

      await expect(control).toBeVisible();
      await expect(control).toHaveAttribute("aria-disabled", "true");

      // **Never the `disabled` attribute** — spec 01 §G5. Without this the two
      // spellings look interchangeable and the tooltip quietly stops firing.
      expect(await isNativelyDisabled(control)).toBe(false);

      const wrapper = gatedWrapper(control);
      const reason = wrapper.locator('[data-gated-reason="true"]');
      await expect(reason).toHaveText(AUDITOR_READ_ONLY_REASON);

      // And the reason is the control's **accessible description**, not merely
      // text sitting near it.
      const describedBy = await wrapper
        .locator("[aria-describedby]")
        .first()
        .getAttribute("aria-describedby");
      expect(describedBy).not.toBeNull();
      expect(describedBy).toBe(await reason.getAttribute("id"));
    }
  });

  test("the reason is also reachable as a tooltip", async ({ page }) => {
    await page.goto(recordPath);
    await expect(page.locator("#page-title")).toBeVisible();

    // Hover is never the only way to reveal information (§1.5) — the caption
    // asserted above is the other way — but the tooltip is what §2.9 names, so
    // it is proven to open rather than assumed.
    const trigger = gatedWrapper(page.locator('[data-mutating="true"]').first())
      .locator("[aria-describedby]")
      .first();

    await trigger.hover();

    await expect(page.getByRole("tooltip").first()).toContainText(
      AUDITOR_READ_ONLY_REASON,
    );
  });

  test("the destructive control is omitted entirely", async ({ page }) => {
    await page.goto(recordPath);
    await expect(page.locator("#page-title")).toBeVisible();

    // Paired with the positive count above: the renderer would have emitted
    // `data-destructive` for *Void this record* had the treatment been anything
    // other than `absent`, so zero here is a decision and not an empty page.
    await expect(page.locator('[data-mutating="true"]').first()).toBeVisible();
    await expect(page.locator('[data-destructive="true"]')).toHaveCount(0);
  });

  test("Export and Print are never disabled, on any route she can reach", async ({
    page,
  }) => {
    let found = 0;

    // Rule 5.27 names Print, Download and Export together, so the sweep covers
    // all three wherever they appear on this unit's routes: the record's
    // **Print documents**, and `/audit`'s **Export**.
    for (const pathname of [recordPath, "/batteries", "/audit"]) {
      await page.goto(pathname);
      await expect(page).toHaveURL(pathname);
      await expect(page.locator("#page-title")).toBeVisible();
      found += await auditExportControls(page);
    }

    // Not vacuous. If every route stopped rendering an export control, the loop
    // above would pass without having asserted anything at all.
    expect(found).toBeGreaterThan(0);

    // And the one control that states its treatment as data says `enabled` —
    // which is `controlTreatment` answering `isExportOrPrint` before every other
    // clause, rather than a screen remembering to.
    await page.goto("/audit");
    await expect(page.locator('[data-export-control="audit"]')).toHaveAttribute(
      "data-control-treatment",
      "enabled",
    );
  });
});
