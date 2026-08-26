import type { ElementType, ReactElement, ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The section, the panel and the field — `UX_SPEC.md` §1.3, §1.4, §3.7, §3.16,
 * §3.17.
 *
 * Unit 01 grew three field grammars for the same fact: `FieldList`/`Field` on
 * both settings routes, `DetailSection`/`DetailField` on `/catalog/[id]`, and
 * `DetailCard`/`FieldRow` on `/batteries/[id]`. They disagreed about whether a
 * field label is muted, whether a section description is `body` or `caption`,
 * and whether a panel edge is a `Card` or a hand-rolled bordered `div`. **One
 * grammar now, and the provenance column is a slot on it rather than a fork.**
 *
 * ## Two decisions this file settles
 *
 * **A field label is never muted.** §1.2 Rule 3 permits `text-muted-foreground`
 * for metadata only — a timestamp, a record count, helper text — and a field
 * label is the thing a reader scans to find the value. It is `text-label` at
 * full foreground, everywhere.
 *
 * **A section description is `body`, not `caption`.** Caption is 13px and §1.3
 * reserves it for metadata. A sentence explaining what a section is for has to
 * be readable at 60–80cm in mixed lighting.
 */

/* ----------------------------------------------------------------- section */

export interface PageSectionProps {
  /** Stable and kebab-cased — it is the anchor a section nav jumps to. */
  readonly id?: string;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** A control belonging to the section heading rather than to a row. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
  /** `2` under a page title, `3` inside a card. Default `2`. */
  readonly headingLevel?: 2 | 3;
  readonly className?: string;
  /** Hooks a caller's specs already select on — the dashboard's region state. */
  readonly dataAttributes?: Readonly<Record<string, string>>;
}

/**
 * A titled region of a page.
 *
 * `scroll-mt-16` keeps the heading clear of the sticky top bar when a section
 * nav jumps to it.
 */
export function PageSection({
  id,
  title,
  description,
  action,
  children,
  headingLevel = 2,
  className,
  dataAttributes,
}: PageSectionProps): ReactElement {
  const Heading = `h${headingLevel}` satisfies string as ElementType;
  const headingId = id === undefined ? undefined : `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-page-section={id ?? true}
      className={cn("flex scroll-mt-16 flex-col gap-4", className)}
      {...dataAttributes}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Heading id={headingId} className={SECTION_TITLE_CLASS}>
            {title}
          </Heading>
          {action}
        </div>
        {description === undefined ? null : (
          <p className="max-w-[72ch] text-body text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** §1.3 — `h2` is a section header on desktop and a card title. One size. */
export const SECTION_TITLE_CLASS = "text-h2";

/* -------------------------------------------------------------------- card */

export interface SectionCardProps {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly headingLevel?: 2 | 3;
  /** Set on a card holding a table, which brings its own edge padding. */
  readonly flush?: boolean;
  readonly className?: string;
  readonly id?: string;
  /** Hooks a caller's specs already select on. */
  readonly dataAttributes?: Readonly<Record<string, string>>;
}

/**
 * A panel. **A border, never a shadow** (§1.4) — elevation is for surfaces that
 * float above the page, and a card does not.
 *
 * Card padding steps 16 → 24 at `md`. §1.4's table asks for 16 / 20 / 24 and
 * §1.4's own permitted-values line forbids 20; the two are read together by
 * taking the step the scale allows. **That contradiction is reported, not
 * resolved here** — see the build-notes.
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  headingLevel = 2,
  flush = false,
  className,
  id,
  dataAttributes,
}: SectionCardProps): ReactElement {
  const Heading = `h${headingLevel}` satisfies string as ElementType;

  return (
    <Card
      id={id}
      data-section-card="true"
      className={cn(CARD_SPACING, "gap-4", className)}
      {...dataAttributes}
    >
      {title === undefined ? null : (
        <CardHeader className="gap-1">
          {/*
            `CardTitle` is a generated `div` and is never hand-edited, so the
            heading nests inside it rather than the primitive changing (§1.1).
          */}
          <CardTitle className={SECTION_TITLE_CLASS}>
            <Heading>{title}</Heading>
          </CardTitle>
          {description === undefined ? null : (
            <p className="max-w-[72ch] text-body text-muted-foreground">
              {description}
            </p>
          )}
          {action}
        </CardHeader>
      )}
      <CardContent
        className={cn("flex flex-col gap-4", flush && "px-0 [&_table]:w-full")}
      >
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * §1.4's card padding, as the generated primitive's own variable.
 *
 * The value moves; `src/components/ui/card.tsx` does not (§1.1).
 */
export const CARD_SPACING = "md:[--card-spacing:--spacing(6)]";

/* ------------------------------------------------------------------ fields */

/**
 * A definition list. Two columns from `sm`, stacked below it.
 *
 * `<dl>` rather than a grid of `div`s because the pairing *is* the information:
 * a screen reader announces "Chemistry, Lead-acid — sealed" rather than two
 * unrelated strings. It reflows at 200% zoom instead of scrolling sideways
 * (§4.3).
 */
export function FieldList({
  children,
  columns = 2,
  className,
}: {
  readonly children: ReactNode;
  /** `1` where every value needs the full measure. Default `2`. */
  readonly columns?: 1 | 2;
  readonly className?: string;
}): ReactElement {
  return (
    <dl
      data-field-list="true"
      className={cn(
        "grid grid-cols-1 gap-x-8 gap-y-4",
        columns === 2 && "sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export interface FieldProps {
  readonly label: ReactNode;
  /** Rendered instead of `value` when a cell needs a badge or several lines. */
  readonly children?: ReactNode;
  readonly value?: string | null;
  /** IDs, serials, part numbers, date codes — the `mono` token (§1.3). */
  readonly mono?: boolean;
  /** Spans both columns, for a value that needs the measure. */
  readonly span?: boolean;
  /**
   * Where the value came from — `/batteries/[id]`'s provenance badge.
   *
   * §3.7 requires it **retained and visible, never behind a disclosure**. It
   * sits under the value on a phone and beside the label from `sm`, so the
   * three-column provenance row and the two-column field are the same shape.
   */
  readonly source?: ReactNode;
  /** A second line under the value — a raw date code, a stored value as held. */
  readonly note?: ReactNode;
  /**
   * What an absent value reads as. **Never an em dash and never a blank cell**:
   * on a compliance screen the difference between *absent* and *zero* is the
   * whole point (§2.3, E-15).
   */
  readonly empty?: string;
}

export const NOT_RECORDED = "Not recorded";

/**
 * One field: label, value, and — where the field has one — its source.
 *
 * `null` children count as empty as well as `undefined`, so a caller writing
 * `{x === null ? null : <Thing/>}` still gets the absence text rather than a
 * blank cell.
 */
export function Field({
  label,
  children,
  value,
  mono = false,
  span = false,
  source,
  note,
  empty = NOT_RECORDED,
}: FieldProps): ReactElement {
  // `""` counts as absent too: a column that stores an empty string is not a
  // value, and a blank cell on a compliance screen reads as a value nobody
  // noticed was missing.
  const hasChildren =
    children !== undefined && children !== null && children !== "";
  const isEmpty =
    !hasChildren && (value === null || value === undefined || value === "");

  return (
    <div
      data-field="true"
      data-field-state={isEmpty ? "empty" : "default"}
      className={cn("flex flex-col gap-1", span && "sm:col-span-2")}
    >
      <dt className="flex flex-wrap items-center gap-2">
        {/* Never muted: §1.2 Rule 3 reserves that for metadata. */}
        <span className="text-label text-foreground">{label}</span>
        {source}
      </dt>
      <dd
        className={cn(
          // Long values wrap rather than truncate. E-15 requires the whole value
          // to stay copyable, so nothing drops characters from the DOM, and no
          // text container takes a fixed height (§4.3).
          "flex min-w-0 flex-col gap-1 break-words",
          isEmpty ? "text-body" : mono ? "text-mono" : "text-body-strong",
        )}
      >
        {hasChildren ? children : isEmpty ? empty : value}
        {note === undefined ? null : (
          <span className="text-caption text-muted-foreground">{note}</span>
        )}
      </dd>
    </div>
  );
}
