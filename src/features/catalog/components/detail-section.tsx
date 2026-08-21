import type { ReactElement, ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { NOT_SET } from "@/features/catalog/catalog-entry-display";

/**
 * The section and field pair `/catalog/[id]` is built from — `UX_SPEC.md` §3.16.
 *
 * A `<dl>` rather than a two-column grid of `<div>`s, because the pairing of a
 * label to a value is the information: a screen reader announces "Chemistry,
 * Lead-acid — sealed" instead of two unrelated strings. Cards carry a border and
 * no shadow (§1.4).
 *
 * **A field with no stored value renders {@link NOT_SET}, never an em dash and
 * never nothing.** An absent row is indistinguishable from a row that failed to
 * render, and on a compliance surface those are very different facts.
 *
 * Values wrap rather than truncate. E-15's *"very long value"* rule requires the
 * whole value to stay copyable, so nothing here drops characters from the DOM,
 * and no fixed height is set on a text container — 200% zoom has to leave the
 * layout intact (§4.3).
 */

export interface DetailSectionProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function DetailSection({
  title,
  children,
  className,
}: DetailSectionProps): ReactElement {
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle className="text-h2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {children}
        </dl>
      </CardContent>
    </Card>
  );
}

export interface DetailFieldProps {
  readonly label: string;
  /**
   * The value. `null`, `undefined` and `""` all render {@link NOT_SET} — a
   * caller never has to remember which absence its column uses.
   */
  readonly value?: ReactNode;
  /** IDs, serials, part numbers and codes — the `mono` token (§1.3). */
  readonly mono?: boolean;
  /** Spans both columns, for a value that needs the width. */
  readonly wide?: boolean;
}

export function DetailField({
  label,
  value,
  mono = false,
  wide = false,
}: DetailFieldProps): ReactElement {
  const isEmpty = value === null || value === undefined || value === "";

  return (
    <div className={cn("flex flex-col gap-1", wide && "sm:col-span-2")}>
      {/* A field label is never `muted`: A25 reserves that for metadata. */}
      <dt className="text-label text-foreground">{label}</dt>
      <dd
        data-field-state={isEmpty ? "empty" : "default"}
        // `Not set` is the value, so it keeps full contrast: A25 reserves
        // `muted` for metadata and forbids it on anything a reader acts on.
        className={cn(
          "break-words",
          isEmpty ? "text-body" : mono ? "text-mono" : "text-body-strong",
        )}
      >
        {isEmpty ? NOT_SET : value}
      </dd>
    </div>
  );
}
