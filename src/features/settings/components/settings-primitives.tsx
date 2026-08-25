import { civilDateInZone } from "@/domain/storage/clock-display";
import type { IsoTimestamp, TimeZone } from "@/types/common";
import { cn } from "@/lib/utils";

/**
 * The small shared pieces both settings surfaces render.
 *
 * Server components. Nothing here decides anything — every value arrives already
 * read and already resolved.
 *
 * **The section, the field list and the field are the product's, not this
 * feature's.** They were three grammars in unit 01 — one here, one on
 * `/catalog/[id]`, one on `/batteries/[id]` — that disagreed about whether a
 * field label is muted and whether a section description is `body` or `caption`.
 * They are re-exported under the names these two routes already call them by, so
 * a settings screen and a record screen render a field the same way.
 *
 * Two house rules survive the move and are enforced by the primitives rather
 * than by each caller remembering them:
 *
 * - **A missing value reads "Not recorded", never an em dash.** A reader who
 *   sees "—" learns nothing (`UX_SPEC.md` §2.3, §4.5), and on a compliance
 *   screen the difference between *absent* and *zero* is the whole point.
 * - **Every absolute date carries the zone it is read in** (Rule 4.29). A date
 *   with no zone beside it is a date two people can disagree about.
 */
export {
  Field,
  FieldList,
  NOT_RECORDED,
  PageSection as SettingsSection,
} from "@/components/page";

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
