import type { ReactNode } from "react";

import { civilDateInZone } from "@/domain/storage/clock-display";
import type { IsoTimestamp, TimeZone } from "@/types/common";
import { cn } from "@/lib/utils";

/**
 * The small shared pieces both settings surfaces render.
 *
 * Server components. Nothing here decides anything — every value arrives already
 * read and already resolved.
 *
 * Two house rules are enforced by these primitives rather than by each caller
 * remembering them:
 *
 * - **A missing value reads "Not recorded", never an em dash.** A reader who
 *   sees "—" learns nothing (`UX_SPEC.md` §2.3, §4.5), and on a compliance
 *   screen the difference between *absent* and *zero* is the whole point.
 * - **Every absolute date carries the zone it is read in** (Rule 4.29). A date
 *   with no zone beside it is a date two people can disagree about.
 */

export const NOT_RECORDED = "Not recorded";

/** A page section with a heading the sub-nav can jump to. */
export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
}: {
  readonly id: string;
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      // `scroll-mt` keeps the heading clear of the sticky chrome when the
      // sub-nav jumps to it.
      className={cn("flex scroll-mt-24 flex-col gap-3", className)}
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-heading`} className="text-h2">
          {title}
        </h2>
        {description !== undefined ? (
          <p className="max-w-[72ch] text-body text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A definition list. Two columns from `sm` up, stacked below it.
 *
 * `<dl>` rather than a table because these are field-and-value pairs rather than
 * rows of like things — a screen reader announces the pairing, and the layout
 * reflows at 200% zoom instead of scrolling sideways (A8).
 */
export function FieldList({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function Field({
  label,
  children,
  value,
  mono = false,
  span = false,
}: {
  readonly label: string;
  /** Rendered instead of `value` when a cell needs a badge or several lines. */
  readonly children?: ReactNode;
  readonly value?: string | null;
  /** Identifiers, hashes, part numbers — `text-mono`, and never truncated. */
  readonly mono?: boolean;
  readonly span?: boolean;
}) {
  // `null` children count as empty as well as `undefined`: a caller writing
  // `{x === null ? null : <Thing/>}` must still get "Not recorded" rather than a
  // blank cell. A blank cell on a compliance screen reads as a value nobody
  // noticed was missing.
  const hasChildren = children !== undefined && children !== null;
  const isEmpty =
    !hasChildren && (value === null || value === undefined || value === "");

  return (
    <div className={cn("flex flex-col gap-1", span && "sm:col-span-2")}>
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          // Long values wrap rather than truncate. A truncated identifier that
          // cannot be selected in full is not copyable in full (E-15), and this
          // is a page whose values get read back over a phone.
          "break-words",
          isEmpty
            ? "text-body text-muted-foreground"
            : mono
              ? "text-mono"
              : "text-body-strong",
        )}
      >
        {hasChildren ? children : isEmpty ? NOT_RECORDED : value}
      </dd>
    </div>
  );
}

/**
 * An absolute date, read in the site's zone, **with the zone beside it**
 * (Rule 4.29).
 *
 * The zone renders as its IANA name rather than an abbreviation: `PDT` and `PST`
 * are the same place at different times of year, and an abbreviation is exactly
 * the kind of detail that turns into an argument two years later in an audit.
 */
export function ZonedDate({
  instant,
  timeZone,
  className,
}: {
  readonly instant: IsoTimestamp;
  readonly timeZone: TimeZone;
  readonly className?: string;
}) {
  return (
    <span
      className={cn("inline-flex flex-wrap items-baseline gap-1", className)}
    >
      <time dateTime={instant} className="text-mono">
        {civilDateInZone(instant, timeZone)}
      </time>
      <span className="text-caption text-muted-foreground">{timeZone}</span>
    </span>
  );
}

/**
 * A calendar day already reduced to `YYYY-MM-DD` by the column that stores it.
 *
 * **No zone is rendered beside it, and that is correct**: an `_on` column is a
 * calendar day with no time and no zone, and attaching one would imply a
 * precision the column does not carry (`TAXONOMY.md` §4.3).
 */
export function CalendarDay({ value }: { readonly value: string }) {
  return (
    <time dateTime={value} className="text-mono">
      {value}
    </time>
  );
}
