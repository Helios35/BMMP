import { expect, test, type Page } from "@playwright/test";

import { fixtureIds, INVITE_TOKENS, storageStateFor } from "./support/roles";

/**
 * The two design rules that gate code review, enforced by measurement rather
 * than by opinion — `UX_SPEC.md` §1.5 and §1.2, spec 01 §A4/§A8 and §G6.
 *
 * **44 × 44 CSS px minimum interactive target, on every route, including
 * desktop.** This is a warehouse tool used all day and a phone used in a
 * storage room; it is not a preference. Every generated shadcn `Button` size is
 * *under* 44px — `default` h-8, `lg` h-9, `icon` size-8 — so app code always
 * adds the target (`min-h-11`, `size-11`), and this sweep is what proves it did.
 *
 * **200% zoom must not break a layout.** At 640 × 512 (1280 × 1024 zoomed to
 * 200%) and at 375 × 667, `document.documentElement.scrollWidth` stays within
 * its client width. Wide content — tables, meters — scrolls inside its own
 * `overflow-x-auto` container; the page body never scrolls horizontally.
 *
 * ## What the sweep does *not* do
 *
 * It does not lower the threshold, and it holds exactly one exemption:
 * **WCAG 2.5.8's link inline in a sentence**, marked `data-inline-target="true"`
 * so an exemption is a greppable decision rather than a silent pass. Everything
 * it skips is asserted to carry that attribute, and a second test asserts the
 * *shape* of every exemption — an inline `<a>`, never a control, never a
 * primary or destructive action — so the attribute cannot spread onto a button
 * to quiet a failure.
 *
 * ## Two measurement corrections, which are not exemptions
 *
 * Both make the sweep measure the target a finger actually hits:
 *
 * 1. **A stretched link.** `RecordTable`'s row anchor carries
 *    `after:absolute after:inset-0`, so its hit area is the whole row (56px
 *    touch / 48px desktop) and its own box is one line of text. The sweep
 *    detects the pseudo-element and measures the positioned ancestor.
 * 2. **A control that is visually hidden until it is focused.** The skip link
 *    is `sr-only` at 1 × 1 px and becomes a padded control on focus. It is not
 *    a target until then, so the sweep focuses it and measures it there.
 * 3. **An element that is `aria-hidden` and out of the tab order.** Radix's
 *    `Select` renders a native `<select>` per control to mirror its value for
 *    form autofill; it is not in the accessibility tree, cannot be focused and
 *    cannot be clicked. It measures 0 × 0 or 1 × 1 depending on when the sweep
 *    catches it, and the 1 × 1 case made this file fail on `/batteries` at
 *    random. **Both conditions are required together.**
 *
 * None of the three relaxes the rule; a control that is small *when it can be
 * used* still fails.
 */

const TARGET_SELECTOR =
  'button, a[href], [role="button"], input, select, [tabindex]:not([tabindex="-1"])';

/** §1.5, `_ANCHORS.md`-fixed. Not a variable to be tuned. */
const MINIMUM_TARGET_PX = 44;

interface UndersizedTarget {
  readonly tag: string;
  readonly width: number;
  readonly height: number;
  readonly text: string;
  readonly inlineTarget: string | null;
  readonly display: string;
  /** True for a control that is not a link — a button, an input, a select. */
  readonly isControl: boolean;
  /** True where the element is, or sits inside, a rendered shadcn `Button`. */
  readonly isButtonStyled: boolean;
  /** `data-` attributes that mark a control as primary, mutating or destructive. */
  readonly weight: readonly string[];
  readonly dataAttributes: Readonly<Record<string, string>>;
  readonly measuredAs: "self" | "stretched" | "focused";
}

interface SweepResult {
  readonly undersized: readonly UndersizedTarget[];
  readonly scrollWidth: number;
  readonly clientWidth: number;
}

interface SweepInput {
  readonly selector: string;
  readonly minimum: number;
}

function sweepInPage({ selector, minimum }: SweepInput): SweepResult {
  const isStretched = (element: Element): boolean => {
    const after = window.getComputedStyle(element, "::after");
    return (
      after.position === "absolute" &&
      after.top === "0px" &&
      after.right === "0px" &&
      after.bottom === "0px" &&
      after.left === "0px"
    );
  };

  const undersized: UndersizedTarget[] = [];

  for (const element of Array.from(document.querySelectorAll(selector))) {
    const style = window.getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") continue;

    // Out of the accessibility tree **and** out of the tab order: not a target
    // anyone can reach, by pointer or by keyboard. Radix's `Select` renders one
    // of these per control — a native `<select>` that mirrors the value for form
    // autofill, `aria-hidden`, `tabindex="-1"`, absolutely positioned, and
    // measuring 0×0 or 1×1 depending on when the sweep catches it. The 0 case
    // was already skipped below and the 1 case was not, so this sweep failed on
    // `/batteries` at random. **Both conditions are required**, so a real
    // control cannot slip out from under the rule by carrying one attribute.
    if (
      element.getAttribute("aria-hidden") === "true" &&
      element.getAttribute("tabindex") === "-1"
    ) {
      continue;
    }

    let rect = element.getBoundingClientRect();
    let measuredAs: "self" | "stretched" | "focused" = "self";

    const parent = element instanceof HTMLElement ? element.offsetParent : null;
    if (isStretched(element) && parent instanceof Element) {
      rect = parent.getBoundingClientRect();
      measuredAs = "stretched";
    } else if (rect.width < 2 || rect.height < 2) {
      if (element instanceof HTMLElement) {
        element.focus();
        const focused = element.getBoundingClientRect();
        if (focused.width > rect.width || focused.height > rect.height) {
          rect = focused;
          measuredAs = "focused";
        }
        element.blur();
      }
    }

    // Still nothing to hit: the element is not rendered at this breakpoint.
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.width >= minimum && rect.height >= minimum) continue;

    const dataAttributes: Record<string, string> = {};
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith("data-")) {
        dataAttributes[attribute.name] = attribute.value;
      }
    }

    undersized.push({
      tag: element.tagName,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
      text: (element.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60),
      inlineTarget: element.getAttribute("data-inline-target"),
      display: style.display,
      isControl: element.tagName !== "A" || !element.hasAttribute("href"),
      isButtonStyled: element.closest('[data-slot="button"]') !== null,
      weight: [
        "data-primary-action",
        "data-mutating",
        "data-destructive",
        "data-export-control",
      ].filter((name) => element.hasAttribute(name)),
      dataAttributes,
      measuredAs,
    });
  }

  const root = document.documentElement;
  return {
    undersized,
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
  };
}

/**
 * Proof a route rendered, before anything on it is measured.
 *
 * A redirect to `/` or to `/sign-in` has few controls and no overflow, and
 * would make every assertion below pass for the wrong reason. `(app)` routes
 * are proven by `#page-title`, which spec 01 §G2 puts on every one of them;
 * the three `(auth)` routes have none — `/invite/[token]` renders a card with
 * no heading and no form at all — so they are proven by the layout's wordmark,
 * exactly as `harness.spec.ts` does.
 */
function isPublicRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/invite/")
  );
}

async function sweep(page: Page, pathname: string): Promise<SweepResult> {
  await page.goto(pathname);
  await expect(page).toHaveURL(pathname);
  await expect(
    isPublicRoute(pathname)
      ? page.getByText("BMMP", { exact: true })
      : page.locator("#page-title"),
    `${pathname} did not render`,
  ).toBeVisible();
  return page.evaluate(sweepInPage, {
    selector: TARGET_SELECTOR,
    minimum: MINIMUM_TARGET_PX,
  });
}

function describeTarget(target: UndersizedTarget): string {
  const marks = Object.entries(target.dataAttributes)
    .map(([name, value]) => `${name}="${value}"`)
    .join(" ");
  return `<${target.tag.toLowerCase()} ${marks}> "${target.text}" — ${target.width}×${target.height}px (measured ${target.measuredAs})`;
}

function report(
  pathname: string,
  targets: readonly UndersizedTarget[],
): string {
  return `${pathname} renders ${targets.length} interactive target(s) below ${MINIMUM_TARGET_PX}×${MINIMUM_TARGET_PX}px (UX_SPEC.md §1.5):\n  ${targets
    .map(describeTarget)
    .join("\n  ")}`;
}

/** Undersized and not carrying the one sanctioned exemption. */
function violationsOf(result: SweepResult): readonly UndersizedTarget[] {
  return result.undersized.filter((target) => target.inlineTarget !== "true");
}

function exemptionsOf(result: SweepResult): readonly UndersizedTarget[] {
  return result.undersized.filter((target) => target.inlineTarget === "true");
}

/**
 * Everything the sweep skipped has to look like WCAG 2.5.8's exemption.
 *
 * The attribute records a human judgement — *is this link inside a sentence* —
 * and no assertion can make that judgement. What an assertion **can** do is
 * stop the attribute being reached for as a way to quiet a failure, so these
 * three hold on every skipped element: it is a plain `<a href>` and not a
 * control; it is not a rendered `Button`; and it carries none of the markers
 * that make a control primary, mutating, destructive or an export. Any of those
 * is a standalone target and the exemption has nothing to say about it.
 *
 * **Computed `display` is deliberately not one of the checks.** A flex or grid
 * parent blockifies its children, so shadcn's breadcrumb link computes `block`
 * while sitting visually inline in a trail; the property is not a signal.
 */
function expectExemptionsAreInlineLinks(
  pathname: string,
  result: SweepResult,
): void {
  for (const target of exemptionsOf(result)) {
    expect(
      target.inlineTarget,
      `${pathname}: ${describeTarget(target)} was skipped without the exemption attribute`,
    ).toBe("true");
    expect(
      target.isControl,
      `${pathname}: ${describeTarget(target)} is a control, and a control is never a link in a sentence`,
    ).toBe(false);
    expect(
      target.isButtonStyled,
      `${pathname}: ${describeTarget(target)} renders as a Button, so it is a standalone target and cannot claim the inline exemption`,
    ).toBe(false);
    expect(
      target.weight,
      `${pathname}: ${describeTarget(target)} is a primary, mutating, destructive or export control and cannot claim the inline exemption`,
    ).toEqual([]);
  }
}

function expectNoHorizontalOverflow(
  pathname: string,
  result: SweepResult,
): void {
  expect(
    result.scrollWidth,
    `${pathname} scrolls horizontally at this width (${result.scrollWidth}px in ${result.clientWidth}px). Wide content scrolls inside its own container; the page body never does (UX_SPEC.md §1.2, spec 01 §A8).`,
  ).toBeLessThanOrEqual(result.clientWidth + 1);
}

/**
 * The routes this unit renders, by the role that reaches them.
 *
 * Routes units 03–05 own — `/review`, `/containers*`, `/shipments*`,
 * `/documents/[id]`, `/settings/catalog` — are absent because they do not exist
 * yet. **Each of those units extends this list when it builds them.**
 */
const { BATTERY, CATALOG } = fixtureIds;

const PUBLIC_ROUTES: readonly string[] = [
  "/sign-in",
  "/sign-up",
  `/invite/${INVITE_TOKENS.pendingHandler}`,
];

/** Every route a Facility Manager reaches, minus `/audit`, which is swept apart. */
const MANAGER_ROUTES: readonly string[] = [
  "/",
  "/batteries",
  // Two records rather than one: the vehicle pack and the record mid-review
  // with confidence spread across all four bands, which renders the most
  // controls of any detail screen in this unit.
  `/batteries/${BATTERY.vehicleTraction}`,
  `/batteries/${BATTERY.midReviewSpread}`,
  "/catalog",
  `/catalog/${CATALOG.vehicleTractionNmc}`,
  "/settings/organization",
  "/settings/users",
];

/**
 * The handler's routes, including the two narrowed list states.
 *
 * The narrowed states are swept because they are the only screens that render
 * **Clear search** and **Clear filters**, and a control nobody sweeps is a
 * control that regresses.
 */
const HANDLER_ROUTES: readonly string[] = [
  "/batteries/new",
  "/batteries?q=zzzz-no-such-record",
  "/batteries?from=2099-01-01",
];

/** 44px sweep viewports: the desk and the phone. */
const SWEEP_VIEWPORTS = [
  { name: "desktop 1280×800", width: 1280, height: 800 },
  { name: "phone 375×812", width: 375, height: 812 },
] as const;

/** §A8's two: 1280 × 1024 at 200% zoom, and the small phone. */
const ZOOM_VIEWPORTS = [
  { name: "1280×1024 at 200% zoom", width: 640, height: 512 },
  { name: "phone 375×667", width: 375, height: 667 },
] as const;

const ALL_VIEWPORTS = [...SWEEP_VIEWPORTS, ...ZOOM_VIEWPORTS] as const;

test.describe("44 × 44 px minimum interactive target", () => {
  test.describe("the three public routes", () => {
    for (const viewport of SWEEP_VIEWPORTS) {
      test(`on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        for (const pathname of PUBLIC_ROUTES) {
          const result = await sweep(page, pathname);
          expect(
            violationsOf(result),
            report(pathname, violationsOf(result)),
          ).toEqual([]);
          expectExemptionsAreInlineLinks(pathname, result);
        }
      });
    }
  });

  test.describe("every route a Facility Manager reaches", () => {
    test.use({ storageState: storageStateFor("p2") });

    for (const viewport of SWEEP_VIEWPORTS) {
      test(`on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        for (const pathname of MANAGER_ROUTES) {
          const result = await sweep(page, pathname);
          expect(
            violationsOf(result),
            report(pathname, violationsOf(result)),
          ).toEqual([]);
          expectExemptionsAreInlineLinks(pathname, result);
        }
      });
    }
  });

  test.describe("the intake route and the two narrowed list states", () => {
    test.use({ storageState: storageStateFor("p1") });

    for (const viewport of SWEEP_VIEWPORTS) {
      test(`on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        for (const pathname of HANDLER_ROUTES) {
          const result = await sweep(page, pathname);
          expect(
            violationsOf(result),
            report(pathname, violationsOf(result)),
          ).toEqual([]);
          expectExemptionsAreInlineLinks(pathname, result);
        }
      });
    }
  });

  test.describe("the read-only role, whose controls are disabled rather than absent", () => {
    test.use({ storageState: storageStateFor("p5") });

    for (const viewport of SWEEP_VIEWPORTS) {
      test(`on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        // §G5's `aria-disabled` control keeps its place in the tab order
        // precisely so its reason stays reachable — which makes it a target the
        // 44px floor applies to like any other.
        for (const pathname of [
          "/",
          "/batteries",
          `/batteries/${BATTERY.vehicleTraction}`,
        ]) {
          const result = await sweep(page, pathname);
          expect(
            violationsOf(result),
            report(pathname, violationsOf(result)),
          ).toEqual([]);
          expectExemptionsAreInlineLinks(pathname, result);
        }
      });
    }
  });

  /**
   * `/audit`, the route that produced this sweep's one real finding.
   *
   * Every `/audit` row is non-navigable — there is no `/audit/[id]`, so the
   * row's deep link is the record it names in the Entity column — and
   * `RecordTable`'s `NotLinkedPrimary` renders the reason on a focusable
   * `<span>` tooltip trigger (`data-row-reason-trigger`). The sweep measured it
   * at 208.5 x 24px from `md` up: in the tab order, hoverable, and under
   * `UX_SPEC.md` §1.5's floor. **The threshold was not lowered.** The trigger
   * was given `min-h-11` in `src/components/record-table/record-table.tsx` and
   * both viewports now assert cleanly.
   *
   * Unit 04 inherits this path: `/containers` renders the same not-linked
   * primary for P3, P4 and P5 (`SITE_ARCHITECTURE.md` §5.4).
   */
  test.describe("the audit log", () => {
    test.use({ storageState: storageStateFor("p2") });

    test("on phone 375×812", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      const result = await sweep(page, "/audit");
      expect(
        violationsOf(result),
        report("/audit", violationsOf(result)),
      ).toEqual([]);
      expectExemptionsAreInlineLinks("/audit", result);
    });

    test("on desktop 1280×800", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      const result = await sweep(page, "/audit");
      expect(
        violationsOf(result),
        report("/audit", violationsOf(result)),
      ).toEqual([]);
      expectExemptionsAreInlineLinks("/audit", result);
    });

    /**
     * The sweep above cannot re-break — **and cannot pass by finding nothing.**
     *
     * The general sweep measures whatever is on the page, so it stays green if
     * the trigger stops rendering at all: the tooltip disappears, the stated
     * reason becomes unreachable, and nothing says a word. That is precisely
     * how two of unit 01's defects survived a whole unit — an assertion that
     * passed vacuously.
     *
     * So this asserts the trigger is **there**, on every row, and measures it
     * directly. `/containers` inherits this exact path for P3, P4 and P5 in
     * unit 04 (`SITE_ARCHITECTURE.md` §5.4), and that unit adds its route to
     * this test rather than writing a second one.
     */
    test("the not-linked row reason is present, focusable and 44px", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/audit");
      await expect(page.locator("#page-title")).toBeVisible();

      const triggers = page.locator('[data-row-reason-trigger="true"]');
      const count = await triggers.count();
      expect(
        count,
        "/audit renders no row-reason trigger at all — every row on this route is non-navigable and each one must state why (§5.4)",
      ).toBeGreaterThan(0);

      for (let index = 0; index < count; index += 1) {
        const trigger = triggers.nth(index);
        const box = await trigger.boundingBox();
        expect(
          box,
          `/audit row ${index}: the trigger is not rendered`,
        ).not.toBeNull();
        expect(
          box?.height ?? 0,
          `/audit row ${index}: the row-reason trigger is ${box?.height ?? 0}px tall. It is focusable and hoverable, which makes it a target, and §1.5's 44px floor applies on desktop too. The threshold is not lowered.`,
        ).toBeGreaterThanOrEqual(MINIMUM_TARGET_PX);
        // In the tab order on purpose: `aria-disabled` semantics aside, a reason
        // a keyboard user cannot reach is a reason nobody stated.
        await expect(trigger).toHaveAttribute("tabindex", "0");
      }
    });
  });
});

test.describe("200% zoom does not break a layout", () => {
  test.describe("the three public routes", () => {
    for (const viewport of ALL_VIEWPORTS) {
      test(`at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        for (const pathname of PUBLIC_ROUTES) {
          expectNoHorizontalOverflow(pathname, await sweep(page, pathname));
        }
      });
    }
  });

  test.describe("every authenticated route", () => {
    test.use({ storageState: storageStateFor("p2") });

    for (const viewport of ALL_VIEWPORTS) {
      test(`at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        for (const pathname of [...MANAGER_ROUTES, "/audit"]) {
          expectNoHorizontalOverflow(pathname, await sweep(page, pathname));
        }
      });
    }
  });

  test.describe("the intake route and the two narrowed list states", () => {
    test.use({ storageState: storageStateFor("p1") });

    for (const viewport of ALL_VIEWPORTS) {
      test(`at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        for (const pathname of HANDLER_ROUTES) {
          expectNoHorizontalOverflow(pathname, await sweep(page, pathname));
        }
      });
    }
  });
});
