import Link from "next/link";
import type { ReactElement } from "react";
import { CircleAlert, RotateCw } from "lucide-react";

import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * `HardBlockNotice` — `UX_SPEC.md` §2.6; Rules 6.7–6.10.
 *
 * A `destructive` `Alert`, `role="alert"`, with the five parts Rule 6.9
 * requires and none optional: the prohibition in plain language; **the
 * citation carried by the governing rule version** (data, handed in — never
 * typed here, Rule 1.23); the records causing the block; for each, **the
 * specific indicator** that triggered it; and the way forward, as actions
 * rather than advice (Rule 6.10).
 *
 * **There is no override, and this component has no place to put one** — no
 * proceed-anyway, no acknowledge checkbox, no supervisor path. The paths are
 * the caller's, and for air they are exactly Rule 6.10's three. P6 sees what
 * P1 sees; nothing here reads a role.
 *
 * It renders above the blocked control, which stays **visibly present and
 * disabled**, never hidden. Where the constraint could not be evaluated it
 * **fails closed**: the error state says so and offers Retry, and the control
 * stays unavailable (§2.6 Error). An unverified constraint never unlocks an
 * option.
 */

export interface HardBlockNoticeItem {
  readonly id: string;
  /** The record number, in mono. */
  readonly label: string;
  /** The record's own page, for a role that can open it. */
  readonly href: string | null;
  /** Rule 6.9 — the specific indicator(s), in words. Never empty. */
  readonly indicators: readonly string[];
}

export interface HardBlockNoticePath {
  readonly label: string;
  readonly href: string;
  /** A spec finds the path it means by this. */
  readonly id: string;
}

export type HardBlockNoticeProps =
  | {
      readonly state: "blocked";
      /** "Air transport is not available for this shipment." */
      readonly title: string;
      /** The plain-language prohibition. */
      readonly statement: string;
      /** From the governing rule versions. Empty renders `missingCitation`, never a citation of our own. */
      readonly citations: readonly string[];
      readonly missingCitation: string;
      readonly items: readonly HardBlockNoticeItem[];
      readonly paths: readonly HardBlockNoticePath[];
      readonly dataAttribute: string;
    }
  | {
      /** §2.6 Error — the constraint could not be evaluated. Fails closed. */
      readonly state: "error";
      readonly message: string;
      readonly retryHref: string;
      readonly retryLabel: string;
      readonly dataAttribute: string;
    };

export function HardBlockNotice(props: HardBlockNoticeProps): ReactElement {
  if (props.state === "error") {
    return (
      <Alert
        role="alert"
        data-hard-block-notice={props.dataAttribute}
        data-hard-block-state="error"
        className={cn(INTENT_SURFACE_CLASSES.critical, "gap-3 px-4 py-4")}
      >
        <CircleAlert aria-hidden="true" className="size-5" />
        <AlertTitle className="text-body-strong text-balance">
          {props.message}
        </AlertTitle>
        <AlertDescription className="text-current">
          <Button
            asChild
            variant="outline"
            size="lg"
            className={ACTION_BUTTON_CLASS}
          >
            <Link href={props.retryHref} data-hard-block-retry="true">
              <RotateCw aria-hidden="true" />
              {props.retryLabel}
            </Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert
      role="alert"
      data-hard-block-notice={props.dataAttribute}
      data-hard-block-state="blocked"
      className={cn(INTENT_SURFACE_CLASSES.critical, "gap-3 px-4 py-4")}
    >
      <CircleAlert aria-hidden="true" className="size-5" />
      <AlertTitle className="text-body-strong text-balance">
        {props.title}
      </AlertTitle>
      <AlertDescription className="grid gap-3 text-body text-current">
        <p className="max-w-[72ch]">{props.statement}</p>
        {props.citations.length === 0 ? (
          <p data-hard-block-citation="missing" className="max-w-[72ch]">
            {props.missingCitation}
          </p>
        ) : (
          <ul className="grid gap-1" data-hard-block-citation="present">
            {props.citations.map((citation) => (
              <li key={citation} className="max-w-[72ch] italic">
                {citation}
              </li>
            ))}
          </ul>
        )}
        <ul className="grid gap-1">
          {props.items.map((item) => (
            <li
              key={item.id}
              data-hard-block-item={item.id}
              className="flex flex-wrap items-baseline gap-x-2"
            >
              {item.href === null ? (
                <span className="font-mono text-body-strong">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center font-mono text-body-strong underline underline-offset-4"
                >
                  {item.label}
                </Link>
              )}
              <span data-hard-block-indicators="true">
                {`— ${item.indicators.join(", ")}`}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {props.paths.map((path) => (
            <Button
              key={path.id}
              asChild
              variant="outline"
              size="lg"
              className={ACTION_BUTTON_CLASS}
            >
              <Link href={path.href} data-hard-block-path={path.id}>
                {path.label}
              </Link>
            </Button>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
