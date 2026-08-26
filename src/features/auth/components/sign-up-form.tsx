"use client";

import { useActionState, useState } from "react";
import { Check, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";

import { signUp } from "../actions";
import { PASSWORD_REQUIREMENTS } from "../schemas";
import {
  TERMS_CHECKBOX_AUTHORITY,
  TERMS_CHECKBOX_LEAD,
  TERMS_DOCUMENT_HREF,
  TERMS_LINK_TEXT,
  TERMS_RECORD_NOTE,
} from "../terms-document";
import { FieldError, FormError } from "./form-messages";

/**
 * `/sign-up`'s form — `UX_SPEC.md` §3.2.
 *
 * Two things on it are legal instruments rather than fields, and both are
 * treated as such:
 *
 * **The Terms of Service checkbox states the data training-rights grant in the
 * visible label**, not behind a link alone (§3.2). It is required, it is never
 * pre-checked, and there is no "skip" and no "decide later" — Rule 7.1 makes the
 * grant a precondition of the first battery, and Rules 7.6 and 7.7 make a record
 * captured without one *permanently* ineligible with no administrative way back.
 *
 * **The password requirements are a visible list, not a strength meter** (§3.2).
 * The list is the same `PASSWORD_REQUIREMENTS` the Server Action parses against,
 * so the met/unmet marks and the refusal cannot disagree.
 */

export interface SignUpFormProps {
  /** Carried from `/invite/[token]`. Its presence is what makes this an invited sign-up (Rule 1.8). */
  readonly token: string | null;
  /** Pre-filled and read-only when invited — Flow E step 2. Null when founding. */
  readonly invitedEmail: string | null;
  /** Named, never editable, when invited. The reader is joining it, not creating it. */
  readonly invitedOrganizationName: string | null;
}

export function SignUpForm({
  token,
  invitedEmail,
  invitedOrganizationName,
}: SignUpFormProps) {
  const [state, formAction, pending] = useActionState<
    ActionResult<never> | null,
    FormData
  >(signUp, null);
  const [password, setPassword] = useState("");

  const failed = state !== null && !state.ok;
  const fieldError = failed ? state.error.field : undefined;
  const isInvited = token !== null;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {isInvited ? <input type="hidden" name="token" value={token} /> : null}

      {failed && fieldError === undefined ? (
        <FormError message={state.error.message} />
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="fullName" className="text-label">
          Full name
        </Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          className="min-h-11 text-body"
          aria-invalid={fieldError === "fullName" ? true : undefined}
          aria-describedby={
            fieldError === "fullName" ? "fullName-error" : undefined
          }
        />
        {failed && fieldError === "fullName" ? (
          <FieldError id="fullName-error" message={state.error.message} />
        ) : null}
      </div>

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
          // Read-only rather than disabled: a disabled field submits nothing, and
          // the address is what the invitation was issued to.
          readOnly={invitedEmail !== null}
          defaultValue={invitedEmail ?? ""}
          className="min-h-11 text-body read-only:bg-muted"
          aria-invalid={fieldError === "email" ? true : undefined}
          aria-describedby={fieldError === "email" ? "email-error" : undefined}
        />
        {failed && fieldError === "email" ? (
          <FieldError id="email-error" message={state.error.message} />
        ) : null}
        {failed && state.error.code === "CONFLICT" ? (
          <p className="text-body">
            <a
              href="/sign-in"
              data-inline-target="true"
              className="rounded-md underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            >
              Sign in
            </a>{" "}
            instead.
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password" className="text-label">
          Password
        </Label>
        <ul className="grid gap-1" aria-label="Password requirements">
          {PASSWORD_REQUIREMENTS.map((requirement) => {
            const met = requirement.isMet(password);
            return (
              <li
                key={requirement.id}
                className="flex items-center gap-2 text-caption"
                data-requirement-state={met ? "met" : "unmet"}
              >
                {met ? (
                  <Check
                    aria-hidden="true"
                    className="size-4 shrink-0 text-intent-ok-foreground"
                  />
                ) : (
                  <Circle
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
                <span className={met ? "text-intent-ok-foreground" : undefined}>
                  {requirement.label}
                </span>
                {/* Icon and colour both change, and the state is also stated in
                    words for a screen reader — colour is never the only signal. */}
                <span className="sr-only">{met ? "met" : "not met yet"}</span>
              </li>
            );
          })}
        </ul>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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

      {isInvited ? (
        <div className="grid gap-1">
          <span className="text-label">Organization</span>
          <p className="text-body-strong">{invitedOrganizationName}</p>
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="organizationName" className="text-label">
            Organization name
          </Label>
          <Input
            id="organizationName"
            name="organizationName"
            autoComplete="organization"
            required
            className="min-h-11 text-body"
            aria-invalid={fieldError === "organizationName" ? true : undefined}
            aria-describedby={
              fieldError === "organizationName"
                ? "organizationName-error"
                : undefined
            }
          />
          {failed && fieldError === "organizationName" ? (
            <FieldError
              id="organizationName-error"
              message={state.error.message}
            />
          ) : null}
        </div>
      )}

      <div className="grid gap-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id="acceptsTerms"
            name="acceptsTerms"
            required
            // 44px on the most consequential control on the page, per §1.5's
            // floor — which applies on desktop too.
            className="size-11 rounded-md [&_svg]:size-6"
            aria-describedby="acceptsTerms-note"
            aria-invalid={fieldError === "acceptsTerms" ? true : undefined}
          />
          <Label
            htmlFor="acceptsTerms"
            className="max-w-[72ch] flex-1 items-start text-body"
          >
            <span>
              {TERMS_CHECKBOX_LEAD} {TERMS_CHECKBOX_AUTHORITY}
              {TERMS_DOCUMENT_HREF === null ? null : (
                <>
                  {" "}
                  <a
                    href={TERMS_DOCUMENT_HREF}
                    target="_blank"
                    rel="noreferrer"
                    data-inline-target="true"
                    className="rounded-md underline underline-offset-4"
                  >
                    {TERMS_LINK_TEXT}
                  </a>
                </>
              )}
            </span>
          </Label>
        </div>
        <p
          id="acceptsTerms-note"
          className="text-caption text-muted-foreground"
        >
          {TERMS_RECORD_NOTE}
        </p>
        {failed && fieldError === "acceptsTerms" ? (
          <FieldError id="acceptsTerms-error" message={state.error.message} />
        ) : null}
      </div>

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full"
        disabled={pending}
      >
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
