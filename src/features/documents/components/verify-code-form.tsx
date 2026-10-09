"use client";

import { useId, useState, type FormEvent, type ReactElement } from "react";

import { ACTION_BUTTON_CLASS, SectionCard } from "@/components/page";
import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  VERIFY_BODY,
  VERIFY_CHECKING,
  VERIFY_EMPTY,
  VERIFY_LABEL,
  VERIFY_MATCH,
  VERIFY_NO_MATCH,
  VERIFY_NO_MATCH_BODY,
  VERIFY_SUBMIT,
  VERIFY_TITLE,
  verifyMatchBody,
} from "../document-copy";
import {
  documentVerifyPath,
  type DocumentVerificationResponse,
} from "../verification";

/**
 * **Check a paper copy** — `TECHNICAL_SPEC.md` §8.4 mechanism 3: "a holder of
 * a paper copy can type the code into the viewer and be told whether it
 * matches."
 *
 * The answer is the server's — `GET /api/documents/[id]/verify?code=`, which
 * re-hashes the stored input before it says yes — never a comparison against
 * the code on this screen. A match on a voided or superseded render says so:
 * the paper is that document, and that document is no longer valid.
 */

type Answer =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "match"; readonly status: string }
  | { readonly kind: "no_match" }
  | { readonly kind: "failed"; readonly message: string };

export function VerifyCodeForm({
  renderId,
  statusLabel,
}: {
  readonly renderId: string;
  /** T-39's label for the render's status, said beside a match. */
  readonly statusLabel: string;
}): ReactElement {
  const inputId = useId();
  const [code, setCode] = useState("");
  const [answer, setAnswer] = useState<Answer>({ kind: "idle" });

  async function check(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (code.trim() === "") {
      setAnswer({ kind: "failed", message: VERIFY_EMPTY });
      return;
    }
    setAnswer({ kind: "checking" });
    try {
      const response = await fetch(documentVerifyPath(renderId, code), {
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body: unknown = await response.json();
        const detail =
          typeof body === "object" && body !== null && "detail" in body
            ? (body as { readonly detail: unknown }).detail
            : null;
        setAnswer({
          kind: "failed",
          message:
            typeof detail === "string"
              ? detail
              : "The code could not be checked. Try again.",
        });
        return;
      }
      const result = (await response.json()) as DocumentVerificationResponse;
      setAnswer(
        result.codeMatches === true
          ? { kind: "match", status: statusLabel }
          : { kind: "no_match" },
      );
    } catch (error) {
      console.error("[documents] the code could not be checked", error);
      setAnswer({
        kind: "failed",
        message: "The code could not be checked. Try again.",
      });
    }
  }

  return (
    <SectionCard
      title={VERIFY_TITLE}
      dataAttributes={{ "data-verify-code": "true", "data-print-hide": "true" }}
    >
      <form
        onSubmit={(event) => void check(event)}
        className="flex flex-col gap-3"
      >
        <p className="max-w-[72ch] text-body">{VERIFY_BODY}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={inputId}>{VERIFY_LABEL}</Label>
            <Input
              id={inputId}
              data-verify-input="true"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-56 font-mono"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            data-verify-submit="true"
            aria-busy={answer.kind === "checking" ? "true" : undefined}
            className={ACTION_BUTTON_CLASS}
          >
            {answer.kind === "checking" ? VERIFY_CHECKING : VERIFY_SUBMIT}
          </Button>
        </div>
        <div aria-live="polite">
          {answer.kind === "match" ? (
            <p
              data-verify-result="match"
              className={cn(
                "rounded-md border p-3 text-body",
                INTENT_SURFACE_CLASSES.ok,
              )}
            >
              <span className="text-body-strong">{`${VERIFY_MATCH}. `}</span>
              {verifyMatchBody(answer.status)}
            </p>
          ) : null}
          {answer.kind === "no_match" ? (
            <p
              data-verify-result="no_match"
              className={cn(
                "rounded-md border p-3 text-body",
                INTENT_SURFACE_CLASSES.critical,
              )}
            >
              <span className="text-body-strong">{`${VERIFY_NO_MATCH}. `}</span>
              {VERIFY_NO_MATCH_BODY}
            </p>
          ) : null}
          {answer.kind === "failed" ? (
            <p data-verify-result="failed" className="text-body">
              {answer.message}
            </p>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}
