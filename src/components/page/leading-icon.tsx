import type { ComponentType, ReactElement } from "react";

import { cn } from "@/lib/utils";

/**
 * An icon set beside a line of text, aligned to that line rather than nudged.
 *
 * Nine components reached for `mt-0.5` to drop a glyph onto the optical centre
 * of the line beside it. Two pixels is not one of §1.4's eight permitted spacing
 * values, and — more to the point — a hand-tuned margin stops being correct the
 * moment the line it was tuned against changes size, which §1.3's 17px mobile
 * base makes happen on every phone.
 *
 * This centres the glyph inside a box the height of that line box, derived from
 * the type token rather than measured against it: `body` and `body-strong` are
 * 16/24, `label` is 15/20, `caption` is 13/18. The alignment then survives the
 * mobile base, a 200% zoom and a token change.
 */

/** §1.3's line heights, as the box each token's icon is centred in. */
const LINE_BOX = {
  body: "h-6",
  label: "h-5",
  caption: "h-[1.125rem]",
} as const;

/**
 * Any `lucide-react` glyph, and anything shaped like one.
 *
 * Stated once so `EmptyState`, `AlertCard` and every other caller name the same
 * shape and an icon can be handed between them.
 */
export type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true";
}>;

/** §1.1 — 20px inline, and 16px where the line beside it is smaller than body. */
const GLYPH = {
  md: "size-5",
  sm: "size-4",
} as const;

export function LeadingIcon({
  icon: Icon,
  className,
  size = "body",
  glyph = "md",
}: {
  readonly icon: IconComponent;
  /** Intent colour, from `INTENT_TEXT_CLASSES`. Never a raw colour. */
  readonly className?: string;
  /** The type token of the line the icon sits beside. */
  readonly size?: keyof typeof LINE_BOX;
  readonly glyph?: keyof typeof GLYPH;
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      data-leading-icon="true"
      className={cn("flex shrink-0 items-center", LINE_BOX[size])}
    >
      <Icon aria-hidden="true" className={cn(GLYPH[glyph], className)} />
    </span>
  );
}
