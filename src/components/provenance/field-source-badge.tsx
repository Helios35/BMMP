import type { ReactElement } from "react";
import { BookOpen, Camera, KeyRound, ScanLine, UserPen } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { cn } from "@/lib/utils";

/**
 * `FieldSourceBadge` — where one value on a record came from.
 *
 * `/batteries/[id]` §3.7 requires **every value to show where it came from, and
 * that source to be retained and visible**. `ExtractionReviewCard` (§2.1,
 * unit 02) renders the same vocabulary on the write side. Two copies of it would
 * drift, and the second copy is the one that ends up in a PDF — so it is built
 * once, here, and unit 02 consumes it.
 *
 * **This is spec-authored copy, not a `TAXONOMY.md` system, and it is stored
 * nowhere.** It is derived per field from which column carried the value. It is
 * deliberately *not* T-11 `provenance_source_type`: T-11 records what the
 * battery was removed from — a vehicle, a device, a bulk consignment — which is
 * a property of the pack, not of a field's origin. The two are different
 * questions and are never rendered through one component.
 *
 * **Chemistry is never `read_from_label` and never `detected_from_image`**
 * (Rule 2.10, `_ANCHORS.md` §7.2): exactly two sources are admissible for it, a
 * matched catalog entry or direct human entry. Copy implying a camera identified
 * chemistry is a defect, not a wording preference. The rule is enforced where
 * the source is derived, not here.
 *
 * `neutral` throughout: a source is not a status and never colours a field as
 * better or worse. It says nothing about confidence, condition or hazard, and it
 * never expresses a probability of anything (Rule 1.25).
 */

export const FIELD_SOURCES = [
  "read_from_label",
  "matched_from_catalog",
  "decoded",
  "detected_from_image",
  "entered_by",
] as const;

export type FieldSource = (typeof FIELD_SOURCES)[number];

/** The only place this copy exists. A label written inline is a defect. */
const FIELD_SOURCE_LABELS: Readonly<Record<FieldSource, string>> = {
  read_from_label: "Read from label",
  matched_from_catalog: "Matched from catalog",
  decoded: "Decoded",
  detected_from_image: "Detected from image",
  entered_by: "Entered by",
};

const FIELD_SOURCE_ICONS: Readonly<Record<FieldSource, LucideIcon>> = {
  read_from_label: ScanLine,
  matched_from_catalog: BookOpen,
  decoded: KeyRound,
  detected_from_image: Camera,
  entered_by: UserPen,
};

export interface FieldSourceBadgeProps {
  readonly source: FieldSource;
  /** Required when `source === "entered_by"` — renders *Entered by &lt;name&gt;*. */
  readonly enteredByName?: string;
  readonly className?: string;
}

export function FieldSourceBadge({
  source,
  enteredByName,
  className,
}: FieldSourceBadgeProps): ReactElement {
  const Icon = FIELD_SOURCE_ICONS[source];
  // A person's attribution without the person is not an attribution. Falling
  // back to the bare phrase keeps the badge honest about what it does not know
  // rather than inventing a name.
  const label =
    source === "entered_by" && enteredByName !== undefined
      ? `${FIELD_SOURCE_LABELS.entered_by} ${enteredByName}`
      : FIELD_SOURCE_LABELS[source];

  return (
    <Badge
      variant="outline"
      data-field-source={source}
      data-intent="neutral"
      // Always visible text, never a bare icon: a badge with no text is a
      // decoration and is not permitted (§1.2 Rule 4).
      className={cn(
        "h-6 gap-2 rounded-md border px-2",
        INTENT_SURFACE_CLASSES.neutral,
        className,
      )}
    >
      <Icon aria-hidden="true" />
      {/* The type token sits on the label rather than on the root: `cn` resolves
          a Tailwind conflict per element, and the root already carries the
          intent's text colour. See the note in the build-notes on `cn`. */}
      <span className="text-caption">{label}</span>
    </Badge>
  );
}

/** Loading, at the badge's exact height, so a field row never reflows. */
export function FieldSourceBadgeSkeleton({
  className,
}: {
  readonly className?: string;
}): ReactElement {
  return (
    <Skeleton
      data-field-source-state="loading"
      className={cn("h-6 w-32 rounded-md", className)}
    />
  );
}
