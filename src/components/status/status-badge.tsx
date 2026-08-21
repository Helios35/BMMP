import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  Clock,
  Minus,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { INTENT_SURFACE_CLASSES } from "./intent-classes";
import {
  statusIntent,
  statusLabel,
  type StatusIntent,
  type StatusSystem,
} from "./status-intent";

/**
 * `StatusBadge` — `UX_SPEC.md` §2.3.
 *
 * **Renders icon + text + intent colour. Always all three.** Colour is never the
 * only signal (§1.2 Rule 4): this has to survive glare through an open bay door,
 * colour-blindness, a monochrome printout and a cracked screen. **A badge with
 * no text is not a status; it is a decoration and is not permitted.**
 *
 * The component never chooses a colour. It resolves `(system, value)` through
 * the single `statusIntent` map, and the label through the system's own lookup
 * in `src/domain/taxonomy` — the one place a label for that system exists.
 */

const INTENT_ICONS: Readonly<Record<StatusIntent, LucideIcon>> = {
  neutral: Minus,
  ok: CircleCheck,
  attention: TriangleAlert,
  critical: CircleAlert,
  pending: Clock,
};

/** 24px and 28px per §2.3. Text never below 13px, and 14px is the product floor. */
const SIZE_CLASSES = {
  sm: "h-6 gap-1.5 px-2 text-[0.8125rem]",
  md: "h-7 gap-1.5 px-2 text-sm",
} as const;

export type StatusBadgeSize = keyof typeof SIZE_CLASSES;

export interface StatusBadgeProps {
  /** Which `TAXONOMY.md` system the value belongs to. */
  readonly system: StatusSystem;
  /**
   * The **stored** value — lower `snake_case`, exactly as the database holds it.
   *
   * `null` or an empty string renders the empty state. A value this build does
   * not recognise renders the error state. Neither renders blank.
   */
  readonly value: string | null | undefined;
  readonly size?: StatusBadgeSize;
  readonly className?: string;
}

export function StatusBadge({
  system,
  value,
  size = "md",
  className,
}: StatusBadgeProps) {
  // Empty — no status at all. The literal text "Not set", never an em dash and
  // never "N/A": a user who sees "—" learns nothing (§2.3, §4.5).
  if (value === null || value === undefined || value === "") {
    return (
      <Badge
        variant="outline"
        data-status-state="empty"
        className={cn(
          "rounded-md border font-medium",
          SIZE_CLASSES[size],
          INTENT_SURFACE_CLASSES.neutral,
          className,
        )}
      >
        <CircleDashed aria-hidden="true" />
        <span>Not set</span>
      </Badge>
    );
  }

  const intent = statusIntent(system, value);
  const label = statusLabel(system, value);

  // Error — a value this build does not know. Rendered as-is, in mono, never
  // coerced to a default and never blanked: silently reading a retired value as
  // a live one fabricates a compliance record (TAXONOMY.md §5.8).
  if (intent === null || label === null) {
    return (
      <Badge
        variant="outline"
        data-status-state="unrecognised"
        title={`Retired or unrecognised value in ${system}`}
        className={cn(
          "rounded-md border font-medium",
          SIZE_CLASSES[size],
          INTENT_SURFACE_CLASSES.neutral,
          className,
        )}
      >
        <CircleHelp aria-hidden="true" />
        <span className="font-mono">{value}</span>
        <span className="sr-only">
          {` — a value this version does not recognise, shown as stored.`}
        </span>
      </Badge>
    );
  }

  const Icon = INTENT_ICONS[intent];

  return (
    <Badge
      variant="outline"
      data-status-state="default"
      data-intent={intent}
      className={cn(
        "rounded-md border font-medium",
        SIZE_CLASSES[size],
        INTENT_SURFACE_CLASSES[intent],
        className,
      )}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}

/**
 * The loading state, at the badge's exact height.
 *
 * §2.3: the parent renders this rather than collapsing the row — **never a
 * jumping layout.** A handler reading a list at arm's length should not have it
 * reflow under their thumb.
 */
export function StatusBadgeSkeleton({
  size = "md",
  className,
}: {
  readonly size?: StatusBadgeSize;
  readonly className?: string;
}) {
  return (
    <Skeleton
      data-status-state="loading"
      className={cn(
        "rounded-md",
        size === "sm" ? "h-6 w-24" : "h-7 w-28",
        className,
      )}
    />
  );
}
