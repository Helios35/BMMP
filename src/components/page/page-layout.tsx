import type { ReactElement, ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The page frame every route composes from — `UX_SPEC.md` §1.4, §4.1, §4.2.
 *
 * ## Why this exists
 *
 * Unit 01 built twelve routes with five agents partitioned so no two ever held
 * the same file. That is what made it fast, and it is exactly the arrangement
 * that produces five different answers to *how tall is a page header, how much
 * air sits under it, where does the primary action go*. Every one of those
 * questions is answered once, here.
 *
 * **The set was extracted from the twelve screens, not invented for them.** Each
 * primitive below is used by two or more routes; anything that would have been
 * used once was left where it was.
 *
 * ## The gutter and the width belong to the shell, and only to the shell
 *
 * `AppShell`'s `<main>` carries §1.4's page gutter — 16 / 24 / 32 — and the
 * 1280 content cap. Before this unit, nine of the twelve routes then added
 * `p-4 md:p-6` of their own, so the real gutter was 32px on a phone and 48px on
 * a tablet against a spec that says 16 and 24. **No page adds a gutter.**
 * `PageShell` owns vertical rhythm and nothing else.
 */

/* ----------------------------------------------------------------- controls */

/**
 * The app's treatment on every generated `Button` — three corrections the
 * primitive cannot carry, in one place rather than at seventy call sites.
 *
 * - **`min-h-11`.** Every generated size is under §1.5's 44px floor: `default`
 *   is `h-8`, `lg` is `h-9`, `icon` is `size-8`. App code always adds the
 *   target, and `tests/e2e/ergonomics.spec.ts` is what proves it did.
 * - **`rounded-md`.** The primitive is `rounded-lg` (8px). §1.4 gives buttons
 *   6px and cards 8px, and unit 01 added the override on some buttons and not
 *   others — so the same product shipped two button radii.
 * - **`text-label`.** The primitive is `text-sm` at `font-medium`, which is
 *   14px and not one of §1.3's eight tokens. `label` is 15/20 at 500 — the
 *   token that weight was already reaching for.
 *
 * `src/components/ui/button.tsx` is generated and is not hand-edited (§1.1), so
 * the treatment lives beside the callers instead.
 */
export const ACTION_BUTTON_CLASS = "min-h-11 rounded-md text-label";

/** The same, for a square icon button — `size-11` already clears the floor. */
export const ICON_BUTTON_CLASS = "size-11 rounded-md";

/* ------------------------------------------------------------------- shell */

/**
 * The vertical rhythm of a page: 24 between blocks on a phone, 32 from `md`.
 *
 * §1.4's "gap between sections" row, and the only spacing decision a route makes
 * about its own outline.
 */
export function PageShell({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div data-page-shell="true" className={cn(PAGE_RHYTHM, className)}>
      {children}
    </div>
  );
}

/** Exported so `loading.tsx` files stand in at the same rhythm they replace. */
export const PAGE_RHYTHM = "flex flex-col gap-6 md:gap-8";

/* ------------------------------------------------------------------ header */

export interface PageHeaderProps {
  /** The `h1`. Focus lands here on every route change (§6.6). */
  readonly title: ReactNode;
  /**
   * Detail and multi-step routes only. **Never on a list route** — `Breadcrumbs`
   * on `/batteries` would name the page the reader is already standing on
   * (`SITE_ARCHITECTURE.md` §2.4).
   */
  readonly breadcrumbs?: ReactNode;
  /**
   * A control belonging to the title itself — the copy button §1.3 puts beside
   * every ID. It sits **outside** the `h1`, so the heading's accessible name is
   * the record number and not "BR-0001 Copy record ID".
   */
  readonly titleAdornment?: ReactNode;
  /**
   * A **value** identifying what the page is about — the manufacturer and model
   * under a record number.
   *
   * Full contrast, because §1.2 Rule 3 permits `text-muted-foreground` for
   * metadata only and this is the line a handler reads to confirm they have the
   * right battery.
   */
  readonly subtitle?: ReactNode;
  /**
   * One sentence of **helper text** about the page, capped at the 72ch prose
   * measure (§1.3). Muted, which §1.2 Rule 3 permits for exactly this. Never a
   * value — that is {@link PageHeaderProps.subtitle}.
   */
  readonly description?: ReactNode;
  /**
   * The route's primary action — **the thing this page is for**, not a control
   * that reads the list's current narrowing. Search, filters and export act on
   * what is on screen and belong in {@link PageToolbar}; create and navigate
   * belong here.
   *
   * Where a role has no primary action, **nothing renders.** Not a disabled
   * button, not a placeholder.
   */
  readonly action?: ReactNode;
  /** Badges and facts identifying the record — the `/batteries/[id]` strip. */
  readonly meta?: ReactNode;
  /**
   * Pinned directly below the title: `ReadOnlyBanner` (§2.9), a hard block, a
   * consent notice. §2.9 fixes the position and this is the only slot for it.
   */
  readonly notice?: ReactNode;
  readonly className?: string;
}

/**
 * One page header, one shape, twelve routes.
 *
 * Top to bottom: breadcrumbs · title and primary action · description · meta ·
 * pinned notices. A route supplies what it has and omits the rest; the order
 * never changes, so a reader moving between screens finds the same thing in the
 * same place.
 *
 * **The action is full-width below `sm` and inline from `sm` up.** A phone in a
 * storage room is held in one hand, often gloved; a 44px button hugging the
 * right edge of a 375px screen is the hardest target on the page.
 */
export function PageHeader({
  title,
  titleAdornment,
  breadcrumbs,
  subtitle,
  description,
  action,
  meta,
  notice,
  className,
}: PageHeaderProps): ReactElement {
  return (
    <header
      data-page-header="true"
      className={cn("flex flex-col gap-4", className)}
    >
      {/* The structural block — everything whose height a `loading.tsx` can
          predict from the route alone. `tests/e2e/layout-shift.spec.ts` measures
          exactly this.

          **The meta strip and the notice are deliberately outside it.** Both are
          shaped by what the read returned — how many badges a record carries and
          whether they wrap, whether an alert fires at all — and no skeleton can
          know that before the read. Reserving space for a block that may never
          appear is a worse answer than the shift it would prevent. */}
      <div data-page-header-block="true" className="flex flex-col gap-4">
        {breadcrumbs === undefined ? null : (
          // A fixed line box, so the trail's own height is the same whether a
          // record number is short or long — and so the skeleton can match it.
          <div className="flex min-h-6 items-center">{breadcrumbs}</div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <h1 id="page-title" tabIndex={-1} className={PAGE_TITLE_CLASS}>
                {title}
              </h1>
              {titleAdornment}
            </div>
            {subtitle === undefined ? null : (
              <p className="max-w-[72ch] text-body">{subtitle}</p>
            )}
            {description === undefined ? null : (
              <p className="max-w-[72ch] text-body text-muted-foreground">
                {description}
              </p>
            )}
          </div>

          {action === undefined ? null : (
            <div
              data-page-action="true"
              // One place decides that a header action fills the width of a phone
              // and sits inline on anything larger, rather than every call site
              // remembering to.
              //
              // `empty:hidden` because a role-gated control renders `null` rather
              // than the route omitting it — without this, a role with no primary
              // action gets an empty flex box where everyone else has a button,
              // and the title row sits at a different height for that role.
              className="flex flex-wrap items-center gap-2 empty:hidden max-sm:w-full sm:shrink-0 sm:justify-end max-sm:[&>*]:w-full"
            >
              {action}
            </div>
          )}
        </div>
      </div>

      {meta === undefined ? null : (
        <div
          data-page-meta="true"
          className="flex flex-wrap items-center gap-2 empty:hidden"
        >
          {meta}
        </div>
      )}

      {notice}
    </header>
  );
}

/**
 * §1.3's page title: `h1` on a phone, `display` from `lg`.
 *
 * Exported because `RecordHeader` renders the record number as the title in
 * `font-mono`, and the size has to come from the same place.
 */
export const PAGE_TITLE_CLASS = "text-h1 lg:text-display";

/**
 * The header's first paint — **the same height as the header it becomes.**
 *
 * §6.3: *layout must not shift when content arrives*. A `loading.tsx` that
 * stands in a 36px bar for a header that renders a title, a description and a
 * 44px action pushes everything below it when the read lands, and no screenshot
 * catches that. `tests/e2e/layout-shift.spec.ts` measures this block in both
 * states and fails when the two disagree.
 */
export function PageHeaderSkeleton({
  breadcrumb = false,
  titleAdornment = false,
  subtitle = false,
  description = false,
  action = false,
  meta = 0,
}: {
  readonly breadcrumb?: boolean;
  /**
   * The copy button §1.3 puts beside an ID.
   *
   * It is a 44px target, so it — not the type token — sets the height of the
   * title line. `/batteries/[id]` was eight pixels short until the skeleton said
   * so too.
   */
  readonly titleAdornment?: boolean;
  /** One `body` line — a manufacturer and model, an organization name. */
  readonly subtitle?: boolean;
  /**
   * **Pass the route's own sentence, not `true`.**
   *
   * A description wraps, and how many lines it wraps to depends on the sentence
   * and the width. `/audit`'s runs to three lines at 1280 and a one-line bar
   * stood in for it, so the table dropped 48px when the read landed. Given the
   * string, the skeleton renders it invisibly and takes exactly the space the
   * real one will, at every width, with no line count to keep in step.
   *
   * `true` is the one-line fallback for a description the route composes from
   * data it does not have yet.
   */
  readonly description?: ReactNode | boolean;
  readonly action?: boolean;
  readonly meta?: number;
} = {}): ReactElement {
  return (
    <header
      data-page-header="true"
      data-page-header-state="loading"
      className="flex flex-col gap-4"
      aria-hidden="true"
    >
      <div data-page-header-block="true" className="flex flex-col gap-4">
        {breadcrumb ? <Skeleton className="h-6 w-48 rounded-md" /> : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            {/* The title box is the rendered line-height of `text-h1` below `lg`
              and of `text-display` from `lg`, so the block does not grow. Where
              the route puts a copy button beside the title, that 44px target is
              the taller of the two and it is what sets the line. */}
            <div className="flex flex-wrap items-center gap-1">
              <Skeleton className="h-8 w-64 max-w-full rounded-md lg:h-9" />
              {titleAdornment ? (
                <Skeleton className="size-11 shrink-0 rounded-md" />
              ) : null}
            </div>
            {subtitle ? (
              <Skeleton className="h-6 w-72 max-w-full rounded-md" />
            ) : null}
            {description === false ||
            description === undefined ? null : description === true ? (
              <Skeleton className="h-6 w-96 max-w-full rounded-md" />
            ) : (
              <Skeleton className="max-w-[72ch] rounded-md">
                {/* `invisible` rather than `sr-only`: the text has to occupy its
                  space for the block to be the right height, and it must not be
                  read out — the header is already `aria-hidden`. */}
                <span className="invisible text-body">{description}</span>
              </Skeleton>
            )}
          </div>
          {action ? (
            <Skeleton className="h-11 w-full rounded-md sm:w-40 sm:shrink-0" />
          ) : null}
        </div>
      </div>

      {meta > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: meta }, (_unused, index) => (
            <Skeleton key={index} className="h-6 w-28 rounded-md" />
          ))}
        </div>
      ) : null}
    </header>
  );
}

/* ----------------------------------------------------------------- columns */

/**
 * The two-column arrangement `/settings/organization` and `/settings/users`
 * share — a section nav beside a stack of sections, stacking below `lg`.
 *
 * The gap was `gap-10` on both routes, which is 40px and not one of §1.4's eight
 * permitted values. It is §1.4's section gap now, like everything else.
 */
export function PageColumns({
  aside,
  children,
  className,
}: {
  readonly aside: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      data-page-columns="true"
      className={cn("flex flex-col gap-6 lg:flex-row lg:gap-8", className)}
    >
      {aside}
      <div className={cn("min-w-0 flex-1", PAGE_RHYTHM)}>{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------- toolbar */

/**
 * The row above a list: what narrows it on the left, what acts on the narrowing
 * on the right.
 *
 * `RecordTable` composes this so the arrangement is identical on `/batteries`,
 * `/catalog` and `/audit` — and on `/containers`, `/shipments` and `/review`
 * when units 03 through 05 build them.
 *
 * **Export lives here, not in the page header.** §3.20 requires the export to
 * carry the screen's current filter state, which makes it a control that reads
 * the toolbar rather than a control that leaves the page.
 */
export function PageToolbar({
  search,
  filters,
  actions,
  className,
}: {
  /** The route's search box. */
  readonly search?: ReactNode;
  /** The filter row. It wraps freely and gets a line of its own. */
  readonly filters?: ReactNode;
  /** Controls acting on the current narrowing — export, and the list's action. */
  readonly actions?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      data-page-toolbar="true"
      className={cn("flex flex-col gap-3", className)}
    >
      {/* §2.7's anatomy, in its order: the search and the controls that act on
          the result share the top line, and the filter row sits under them.
          Unit 01 put all three in one flex row aligned to its baseline, so a
          filter set that wrapped to two lines left the search box floating at
          the bottom of a hole. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 empty:hidden">
          {search}
        </div>
        {actions === undefined ? null : (
          <div className="flex flex-wrap items-center gap-2 empty:hidden sm:justify-end">
            {actions}
          </div>
        )}
      </div>
      {filters === undefined ? null : (
        <div className="flex flex-wrap items-end gap-3 empty:hidden">
          {filters}
        </div>
      )}
    </div>
  );
}
