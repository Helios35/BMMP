"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";

import { signIn } from "../actions";
import { FieldError, FormError } from "./form-messages";

/**
 * `/sign-in`'s form — `UX_SPEC.md` §3.1.
 *
 * `"use client"` because `useActionState` needs it, and for no other reason: the
 * decision about who may be where is taken server-side before this renders, and
 * this component holds no capability, no role and no `RequestContext`.
 *
 * **Every rule this form applies is applied again in `signIn`.** `react-hook-form`
 * is deliberately not installed and no second set of validation rules exists —
 * the messages a person reads here came from the parse the server performed.
 */

export interface SignInFormProps {
  /** Already validated by `safeNextPath` on the server. Carried so the round trip keeps it. */
  readonly next: string | null;
  /** Present when the reader arrived from `/invite/[token]`. */
  readonly token: string | null;
}

export function SignInForm({ next, token }: SignInFormProps) {
  const [state, formAction, pending] = useActionState<
    ActionResult<never> | null,
    FormData
  >(signIn, null);

  const failed = state !== null && !state.ok;
  const fieldError = failed ? state.error.field : undefined;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {next === null ? null : <input type="hidden" name="next" value={next} />}
      {token === null ? null : (
        <input type="hidden" name="token" value={token} />
      )}

      {failed && fieldError === undefined ? (
        <FormError message={state.error.message} />
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="email" className="text-label">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="min-h-11 text-body"
          aria-invalid={fieldError === "email" ? true : undefined}
          aria-describedby={fieldError === "email" ? "email-error" : undefined}
        />
        {failed && fieldError === "email" ? (
          <FieldError id="email-error" message={state.error.message} />
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password" className="text-label">
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-11 text-body"
          aria-invalid={fieldError === "password" ? true : undefined}
          aria-describedby={
            fieldError === "password" ? "password-error" : undefined
          }
        />
        {failed && fieldError === "password" ? (
          <FieldError id="password-error" message={state.error.message} />
        ) : null}
      </div>

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full"
        disabled={pending}
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      {failed && token !== null ? (
        // A route forward rather than a dead end (§10.3 rule 1). The invitation
        // could not be applied; the account behind it may still be reachable.
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center justify-center rounded-md text-body underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          Sign in without the invitation
        </Link>
      ) : null}
    </form>
  );
}
