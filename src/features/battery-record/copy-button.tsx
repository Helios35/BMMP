"use client";

import { useState, type ReactElement } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The copy control that sits beside an identifier — `UX_SPEC.md` §1.3.
 *
 * **It copies; it never renders the value.** The caller renders the record
 * number, the serial or the hash itself, in mono, as selectable text — so the
 * value is readable and copyable by hand whether or not the clipboard is
 * available. A serial read aloud over a phone is how half of this product's
 * support calls start.
 *
 * The confirmation is announced politely as well as shown, because a changed
 * icon and colour would otherwise be the only signal (§1.2 Rule 4), and the
 * control is a 44px target like every other one (§1.5).
 *
 * This is the one client island on this route. It takes two strings and holds
 * no context, no role and no access decision (§C3).
 */

const RESET_AFTER_MS = 2000;

export function CopyButton({
  value,
  label,
  className,
}: {
  readonly value: string;
  /** What is being copied, for the control's accessible name. */
  readonly label: string;
  readonly className?: string;
}): ReactElement {
  const [isCopied, setIsCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      window.setTimeout(() => {
        setIsCopied(false);
      }, RESET_AFTER_MS);
    } catch (cause) {
      // The clipboard is refused in some browsers and in every headless context.
      // Nothing is swallowed: the failure is logged, the value stays selectable,
      // and the control never claims a copy that did not happen.
      console.error("[copy] the clipboard refused the write", cause);
    }
  }

  return (
    <span className={cn("inline-flex items-center", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
        data-copy-state={isCopied ? "copied" : "idle"}
        className="size-11 shrink-0 rounded-md"
      >
        {isCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
      <span aria-live="polite" className="sr-only">
        {isCopied ? `${label} copied` : ""}
      </span>
    </span>
  );
}
