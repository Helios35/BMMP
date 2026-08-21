import type { ReactElement, ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaxonomyRead } from "@/domain/taxonomy/lookup";
import { cn } from "@/lib/utils";

/**
 * The small display pieces `/batteries` and `/batteries/[id]` share.
 *
 * **None of them takes a decision.** They render a value that has already been
 * resolved — a taxonomy read, a field's source, an absence — so the rules stay
 * in `src/domain` and the reads stay in `src/data` (`UX_SPEC.md` §7.4).
 */

/**
 * The text for a value that was never captured.
 *
 * **Never an em dash and never "N/A".** A reader who sees "—" learns nothing,
 * and on this product the difference between *not recorded* and *zero* is the
 * difference between an honest gap and a fabricated fact. Null-heavy records are
 * normal: a mobility pack rarely publishes a cell count, and inventing one to
 * fill a column is the failure this string exists to prevent.
 */
export const NOT_RECORDED = "Not recorded";

export function NotRecorded(): ReactElement {
  return <span data-not-recorded="true">{NOT_RECORDED}</span>;
}

/**
 * A stored taxonomy value, rendered through its system's own lookup.
 *
 * **An unrecognised value renders as stored, in mono, and is never coerced,
 * blanked or dropped from a count** (`TAXONOMY.md` §5.8). Reading a retired
 * value as a live one fabricates a compliance record, which is worse than an
 * ugly cell — so the raw string is what a reader sees, and the console carries
 * the warning for whoever has to reconcile it.
 *
 * Where the value is a *status*, `StatusBadge` already implements exactly this
 * path and is used instead.
 */
export function TaxonomyText<T extends string>({
  read,
  system,
}: {
  readonly read: TaxonomyRead<T> | null;
  /** The system's name, for the warning only. */
  readonly system: string;
}): ReactElement {
  if (read === null) return <NotRecorded />;
  if (!read.recognised) {
    console.warn(
      `[taxonomy] ${system} holds an unrecognised value: ${read.storedValue}`,
    );
    return (
      <span data-taxonomy-state="unrecognised" className="text-mono">
        {read.storedValue}
      </span>
    );
  }
  return <span data-taxonomy-state="recognised">{read.label}</span>;
}

/** A titled section of the record. A border, never a shadow (§1.4). */
export function DetailCard({
  title,
  description,
  action,
  children,
  className,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader className="gap-1">
        <CardTitle className="text-h2">{title}</CardTitle>
        {description !== undefined ? (
          // Helper text under a heading is metadata, which is the one thing the
          // muted token is for (§1.2 Rule 3).
          <p className="max-w-[72ch] text-caption text-muted-foreground">
            {description}
          </p>
        ) : null}
        {action}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  );
}

/**
 * One field: its label, its value, and — where the field has one — where the
 * value came from.
 *
 * **The source is retained and visible, never behind a disclosure** (§3.7). A
 * provenance a reader has to open is a provenance nobody reads, and on an audit
 * this is the column that answers "how do you know that".
 *
 * The label is never muted: `text-muted-foreground` is for metadata, and a field
 * label is not metadata (§1.2 Rule 3).
 */
export function FieldRow({
  label,
  children,
  source,
  note,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly source?: ReactNode;
  /** A second line under the value — a raw date code, a stored value as held. */
  readonly note?: ReactNode;
}): ReactElement {
  return (
    <div
      data-field-row="true"
      className="grid gap-1 border-b border-border py-3 last:border-b-0 md:grid-cols-[minmax(11rem,1fr)_minmax(0,2fr)_auto] md:items-baseline md:gap-4"
    >
      <span className="text-label">{label}</span>
      <span className="flex min-w-0 flex-col gap-1 text-body-strong break-words">
        {children}
        {note !== undefined ? (
          <span className="text-caption text-muted-foreground">{note}</span>
        ) : null}
      </span>
      <span className="flex items-center md:justify-end">{source}</span>
    </div>
  );
}

/**
 * A frozen snapshot, rendered key by key exactly as it was stored.
 *
 * **The keys are not relabelled and the values are not translated.** This is
 * evidence: an auditor reading an `inputs_snapshot` in 2029 needs what the
 * evaluation actually consumed, not this build's opinion of what it meant.
 */
export function SnapshotList({
  entries,
}: {
  readonly entries: readonly { readonly key: string; readonly text: string }[];
}): ReactElement | null {
  if (entries.length === 0) return null;
  return (
    <dl className="grid gap-2 sm:grid-cols-[minmax(10rem,auto)_1fr]">
      {entries.map((entry) => (
        <div key={entry.key} className="contents">
          <dt className="text-mono">{entry.key}</dt>
          <dd className="text-mono break-words">{entry.text}</dd>
        </div>
      ))}
    </dl>
  );
}
