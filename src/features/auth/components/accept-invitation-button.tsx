"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

import { acceptInvitation } from "../actions";
import { FormError } from "./form-messages";

/**
 * **Accept, for a caller who is already signed in** — Rule 1.5.
 *
 * A user may be invited to a *second* organization while signed in to the first,
 * which is why `src/proxy.ts` exempts `/invite/[token]` from the signed-in
 * redirect. It is also why Flow E step 2's "carry the token to `/sign-in`"
 * cannot serve this caller: the middleware would send them to `/` and the
 * invitation would never be accepted. So this submits the Server Action
 * directly, and the new organization becomes the active one.
 *
 * A refusal renders here rather than redirecting — a redirect loses the reason,
 * and "you are already a member of that organization" is exactly the thing the
 * reader needs to be told on the page they are looking at.
 */
export function AcceptInvitationButton({ token }: { readonly token: string }) {
  const [state, formAction, pending] = useActionState<
    ActionResult<never> | null,
    FormData
  >(acceptInvitation, null);

  return (
    <div className="grid gap-2">
      {state !== null && !state.ok ? (
        <FormError message={state.error.message} />
      ) : null}
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <Button
          type="submit"
          size="lg"
          className="h-12 w-full"
          disabled={pending}
        >
          {pending ? "Accepting…" : "Accept invitation"}
        </Button>
      </form>
    </div>
  );
}
