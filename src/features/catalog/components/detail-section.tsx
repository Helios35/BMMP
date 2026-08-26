import type { ReactElement, ReactNode } from "react";

import { Field, FieldList, SectionCard } from "@/components/page";
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
    <SectionCard title={title} className={className}>
      <FieldList>{children}</FieldList>
    </SectionCard>
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
  // `NOT_SET` rather than the shared default: it is this route's copy and
  // changing it would be a copy rewrite, which this unit does not make. The
  // divergence between *"Not set"* here and *"Not recorded"* on the record and
  // settings screens is reported in the build-notes for the owner.
  return (
    <Field label={label} mono={mono} span={wide} empty={NOT_SET}>
      {value === null ? undefined : value}
    </Field>
  );
}
