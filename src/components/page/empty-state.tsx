import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import type { StatusIntent } from "@/components/status/status-intent";
import { cn } from "@/lib/utils";

import { LeadingIcon, type IconComponent } from "./leading-icon";
import { CARD_SPACING } from "./page-section";

/**
 * The empty state — `UX_SPEC.md` §5.
 *
 * §5's preamble fixes the shape: **what is true · why · the single most useful
 * next action · who can take it if this role cannot.** Unit 01 shipped that
 * shape four times — `/batteries`, `/catalog`, `/audit` and the dashboard's
 * zero-records card — in four boxes that disagreed about their edge, their
 * padding, their icon colour and the gap between the sentence and the button.
 * One box now.
 *
 * ## Two things it is deliberately not
 *
 * **Not centred.** A warehouse reader scans from the left and every other block
 * on the product starts at the same x. A centred sentence inside a 1280px column
 * is the only thing on the screen that does, and it reads as a decoration rather
 * than as a state. The box runs the content width; its text is left-aligned and
 * capped at the 72ch prose measure.
 *
 * **Not the filtered-empty state.** *No records at all* is the route's
 * onboarding state and belongs to the route; *the filters exclude everything* is
 * `RecordTable`'s, with a different sentence and a different action. Showing
 * onboarding copy to someone who mistyped a filter is a defect, not a shortcut
 * (§2.7).
 *
 * ## Copy is passed in, never composed here
 *
 * Every sentence §5 fixes is passed whole. This component decides typography and
 * arrangement and never a word — a paraphrase here would be a copy change
 * nobody agreed to, and three e2e specs assert these strings as whole rendered
 * paragraphs.
 */

export interface EmptyStateAction {
  readonly label: string;
  readonly href: string;
  /** The `data-empty-action` value — a route, so a spec can assert which. */
  readonly testId?: string;
  /** Additional hooks a route's specs already select on. */
  readonly dataAttributes?: Readonly<Record<string, string>>;
}

export interface EmptyStateProps {
  /** §5's *what is true*, as one paragraph. Passed whole, never split. */
  readonly title: ReactNode;
  /** §5's *why*, where the route has a second sentence. */
  readonly description?: ReactNode;
  /**
   * §5's *the single most useful next action*. Omitted where this role cannot
   * take it — **a dead CTA is worse than no CTA** (E-1).
   */
  readonly action?: EmptyStateAction | null;
  /** §5's *who can take it if this role cannot*. */
  readonly whoCanAct?: ReactNode;
  readonly icon?: IconComponent;
  /**
   * `ok` where the emptiness is an achievement — *"Nothing to review. Every
   * reading has been confirmed."* is a good state and is styled as one (E-15).
   * `neutral` otherwise.
   */
  readonly intent?: Extract<StatusIntent, "neutral" | "ok">;
  readonly className?: string;
  /** Merged onto the root, so a route keeps the hook its specs already use. */
  readonly dataAttributes?: Readonly<Record<string, string>>;
}

export function EmptyState({
  title,
  description,
  action,
  whoCanAct,
  icon: Icon,
  intent = "neutral",
  className,
  dataAttributes,
}: EmptyStateProps): ReactElement {
  return (
    <Card
      role="status"
      data-empty-state="true"
      data-intent={intent}
      className={cn(CARD_SPACING, "gap-0", className)}
      {...dataAttributes}
    >
      <CardContent className="flex flex-col items-start gap-4">
        <div className="flex items-start gap-3">
          {Icon === undefined ? null : (
            <LeadingIcon icon={Icon} className={INTENT_TEXT_CLASSES[intent]} />
          )}
          <div className="flex min-w-0 flex-col gap-2">
            <p className="max-w-[72ch] text-body-strong text-balance">
              {title}
            </p>
            {description === undefined ? null : (
              <p className="max-w-[72ch] text-body">{description}</p>
            )}
            {whoCanAct === undefined ? null : (
              <p className="max-w-[72ch] text-body">{whoCanAct}</p>
            )}
          </div>
        </div>

        {action === undefined || action === null ? null : (
          <Button asChild size="lg" className="min-h-11 rounded-md">
            <Link
              href={action.href}
              data-empty-action={action.testId ?? action.href}
              {...action.dataAttributes}
            >
              {action.label}
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
