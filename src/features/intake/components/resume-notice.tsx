"use client";

import Link from "next/link";
import type { ReactElement } from "react";
import { History } from "lucide-react";

import { formatWallClockTime } from "@/components/offline/offline-banner";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * `ResumeNotice` — *"Picking up where you left off — started 14:22."*
 * (`UX_SPEC.md` §2.12, §3.9; Flow A-a).
 *
 * Leaving mid-flow persists the draft, and `/batteries/new` without a session
 * lists the intakes this person started and did not finish, each at the step
 * it reached. One session renders §2.12's sentence with a **Resume** link;
 * several render a list. None renders nothing.
 *
 * The time is HH:MM in the reader's zone — the same reasoning as the offline
 * banner: this is a fact about the reader's own afternoon, not a record.
 */

export interface ResumeNoticeSession {
  readonly id: string;
  readonly startedAt: string;
  /** From `INTAKE_STEP_LABELS`. */
  readonly stepLabel: string;
  readonly href: string;
}

export interface ResumeNoticeProps {
  readonly sessions: readonly ResumeNoticeSession[];
  readonly className?: string;
}

export function ResumeNotice({
  sessions,
  className,
}: ResumeNoticeProps): ReactElement | null {
  if (sessions.length === 0) return null;

  const [first] = sessions;
  if (sessions.length === 1 && first !== undefined) {
    return (
      <Alert
        role="status"
        data-resume-notice="true"
        data-resume-count={1}
        className={cn(
          "gap-2 border",
          INTENT_SURFACE_CLASSES.neutral,
          className,
        )}
      >
        <History aria-hidden="true" />
        <AlertTitle className="text-body-strong">
          {`Picking up where you left off — started ${formatWallClockTime(first.startedAt)}.`}
        </AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3 text-current">
          <span className="text-body">{`At ${first.stepLabel}.`}</span>
          <Button
            asChild
            variant="outline"
            size="lg"
            className={ACTION_BUTTON_CLASS}
          >
            <Link href={first.href} data-resume-session={first.id}>
              Resume
            </Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert
      role="status"
      data-resume-notice="true"
      data-resume-count={sessions.length}
      className={cn("gap-2 border", INTENT_SURFACE_CLASSES.neutral, className)}
    >
      <History aria-hidden="true" />
      <AlertTitle className="text-body-strong">
        {`You have ${sessions.length} unfinished intakes.`}
      </AlertTitle>
      <AlertDescription className="text-current">
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-3">
              <span className="text-body">
                {`Started ${formatWallClockTime(session.startedAt)} · ${session.stepLabel}`}
              </span>
              <Button
                asChild
                variant="outline"
                size="lg"
                className={ACTION_BUTTON_CLASS}
              >
                <Link href={session.href} data-resume-session={session.id}>
                  Resume
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
