"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";
import { CircleAlert } from "lucide-react";

import { GatedControl } from "@/components/access/gated-control";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_TEXT_CLASSES } from "@/components/status/intent-classes";
import { Button } from "@/components/ui/button";
import type { OutstandingItem } from "@/domain/intake/commit-gate";
import { cn } from "@/lib/utils";

/**
 * `MobileActionBar` — `UX_SPEC.md` §2.15, §2.1.4(6).
 *
 * The step's primary action, 56px and full-width, pinned to the bottom of the
 * viewport below `md` and rendered inline beneath the step content from `md`
 * up. One component, two placements, so the route never decides where an
 * action goes on a phone.
 *
 * **It hides the tab bar by existing.** `MobileTabBar` carries
 * `[body:has([data-mobile-action-bar])_&]:hidden`, so while this bar is
 * mounted nothing competes with the step's action (§2.15). That is a CSS
 * relationship between two data attributes, not a context or an effect —
 * there is nothing to forget to clean up when the flow unmounts.
 *
 * **Disabled is explained, never silent.** When the primary is disabled the
 * outstanding checklist renders directly above it (§2.1.4(6)), every item a
 * 44px control the route can wire to scroll the reader to the row in
 * question, and the button itself is `aria-disabled` inside a `GatedControl`
 * — never the `disabled` attribute (§2.9, Rule 1.26). The checklist is the
 * commit gate's own list (`outstandingCommitItems`), so the reason a person
 * reads is the reason the server would give.
 *
 * **Never optimistic.** A primary with `onClick` enters its pending label and
 * waits for the promise; it renders nothing as done (§6.3, §6.4). A primary
 * with `formAction` is a plain form submit so a Server Action can own the
 * redirect.
 */

export interface MobileActionBarAction {
  readonly label: string;
  readonly onClick?: () => void | Promise<void>;
  readonly href?: string;
  readonly disabled?: boolean;
  /** The present-participle status while the action is in flight (§6.3). */
  readonly pendingLabel?: string;
  /** A Server Action, rendered as a form submit. */
  readonly formAction?: (formData: FormData) => void | Promise<void>;
  /**
   * Why the action is disabled, when the outstanding checklist does not say.
   * The checklist items are the reason when they are present.
   */
  readonly disabledReason?: string;
}

export interface MobileActionBarProps {
  readonly primary: MobileActionBarAction;
  readonly secondary?: MobileActionBarAction;
  /** From `@/domain/intake/commit-gate`. Rendered only while the primary is disabled. */
  readonly outstanding?: readonly OutstandingItem[];
  /** Wired by the route to scroll to the row an item names. */
  readonly onOutstandingItem?: (item: OutstandingItem) => void;
  /** A `critical` alert the route renders above the actions — a failed commit's message. */
  readonly notice?: ReactElement | null;
  readonly className?: string;
}

const NO_REASON_GIVEN = "This action is not available yet.";

export function MobileActionBar({
  primary,
  secondary,
  outstanding = [],
  onOutstandingItem,
  notice = null,
  className,
}: MobileActionBarProps): ReactElement {
  const showChecklist = primary.disabled === true && outstanding.length > 0;

  return (
    <div
      data-mobile-action-bar="true"
      data-primary-disabled={primary.disabled === true ? "true" : "false"}
      className={cn(
        // Below md: pinned, above the (hidden) tab bar, clear of the home
        // indicator. From md: an ordinary block beneath the content.
        "fixed inset-x-0 bottom-0 z-40 flex flex-col gap-3 border-t border-border bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
        "md:static md:border-t-0 md:bg-transparent md:p-0",
        className,
      )}
    >
      {notice}

      {showChecklist ? (
        <ul
          data-outstanding-list="true"
          aria-label="Before you can continue"
          className="flex flex-col gap-1"
        >
          {outstanding.map((item) => (
            <li key={`${item.kind}:${item.fieldCode ?? ""}:${item.label}`}>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                data-outstanding-item={item.kind}
                data-outstanding-field={item.fieldCode}
                onClick={() => onOutstandingItem?.(item)}
                className={cn(
                  ACTION_BUTTON_CLASS,
                  "w-full justify-start gap-2 text-left whitespace-normal",
                )}
              >
                <CircleAlert
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0",
                    INTENT_TEXT_CLASSES.attention,
                  )}
                />
                <span>{item.label}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 md:flex-row-reverse md:justify-start">
        <ActionControl
          action={primary}
          role="primary"
          reasonFallback={
            outstanding.length > 0
              ? outstanding.map((item) => item.label).join(". ")
              : undefined
          }
        />
        {secondary === undefined ? null : (
          <ActionControl action={secondary} role="secondary" />
        )}
      </div>
    </div>
  );
}

function ActionControl({
  action,
  role,
  reasonFallback,
}: {
  readonly action: MobileActionBarAction;
  readonly role: "primary" | "secondary";
  readonly reasonFallback?: string;
}): ReactElement {
  const [isPending, setIsPending] = useState(false);
  const isPrimary = role === "primary";

  const sizeClass = isPrimary
    ? // 56px full-width on a phone (§2.15); the ordinary 44px floor from md.
      "min-h-14 w-full md:min-h-11 md:w-auto"
    : "w-full md:w-auto";
  const className = cn(ACTION_BUTTON_CLASS, sizeClass);
  const variant = isPrimary ? "default" : "outline";
  const label = isPending
    ? (action.pendingLabel ?? action.label)
    : action.label;

  if (action.disabled === true) {
    const reason = action.disabledReason ?? reasonFallback ?? NO_REASON_GIVEN;
    return (
      <GatedControl
        reason={reason}
        className="w-full md:w-auto [&>span]:w-full md:[&>span]:w-auto [&>span>*]:w-full md:[&>span>*]:w-auto"
      >
        <Button
          type="button"
          variant={variant}
          size="lg"
          aria-disabled="true"
          data-disabled="true"
          data-action-role={role}
          data-primary-action={isPrimary ? "true" : undefined}
          onClick={(event) => {
            // Inert: the attribute is a courtesy and the server refuses too.
            event.preventDefault();
          }}
          className={cn(className, "opacity-60")}
        >
          {action.label}
        </Button>
      </GatedControl>
    );
  }

  if (action.href !== undefined) {
    return (
      <Button
        asChild
        variant={variant}
        size="lg"
        className={className}
        data-action-role={role}
        data-primary-action={isPrimary ? "true" : undefined}
      >
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }

  if (action.formAction !== undefined) {
    return (
      <form action={action.formAction} className="contents">
        <Button
          type="submit"
          variant={variant}
          size="lg"
          className={className}
          data-action-role={role}
          data-primary-action={isPrimary ? "true" : undefined}
        >
          {action.label}
        </Button>
      </form>
    );
  }

  async function run(): Promise<void> {
    if (isPending || action.onClick === undefined) return;
    setIsPending(true);
    try {
      await action.onClick();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="lg"
      aria-busy={isPending ? "true" : undefined}
      aria-disabled={isPending ? "true" : undefined}
      data-action-role={role}
      data-action-state={isPending ? "pending" : "idle"}
      data-primary-action={isPrimary ? "true" : undefined}
      onClick={() => void run()}
      className={className}
    >
      {label}
    </Button>
  );
}
