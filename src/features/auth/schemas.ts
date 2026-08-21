import { z } from "zod";

/**
 * Input parsing for the three authentication surfaces —
 * `TECHNICAL_SPEC.md` §7.1 step 2.
 *
 * **Validation is server-side.** These schemas run inside the Server Actions,
 * where the caller cannot skip them. The client renders the same requirements so
 * a person is not told about a rule only after submitting, but the browser's
 * copy is a courtesy and the action's copy is the enforcement — this is a
 * compliance product and an unvalidated field ends up on a document.
 *
 * `react-hook-form` is deliberately not installed. The forms use
 * `useActionState`, so every field error arrives from the same parse the server
 * performed rather than from a second set of rules that can drift from it.
 */

/**
 * Trimmed and lowercased before anything looks at it.
 *
 * The rate limiter keys on the lowercased address and the mock matches on it
 * case-insensitively, so normalising once here is what stops `Dana@…` and
 * `dana@…` becoming two attempt windows and two accounts.
 */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .pipe(z.email("Enter a valid email address."));

/**
 * The three password requirements, rendered as a visible list and enforced by
 * `signUpSchema` — **the same three, in the same order** (`UX_SPEC.md` §3.2).
 *
 * §3.2 requires a visible requirements list rather than a strength meter: a
 * meter scores a password without saying what would improve it, and a warehouse
 * user on a phone gets a colour instead of an instruction. Each item is a pure
 * predicate so the live met/unmet display and the server parse cannot disagree
 * about whether one is satisfied.
 *
 * **A password rule is not a regulatory value** — Rule 1.23 governs jurisdiction
 * thresholds, deadlines and citations. These are product policy and belong in
 * code.
 */
export const PASSWORD_MINIMUM_LENGTH = 12;

export interface PasswordRequirement {
  readonly id: string;
  readonly label: string;
  readonly isMet: (value: string) => boolean;
}

export const PASSWORD_REQUIREMENTS: readonly PasswordRequirement[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MINIMUM_LENGTH} characters`,
    isMet: (value) => value.length >= PASSWORD_MINIMUM_LENGTH,
  },
  {
    id: "letter",
    label: "At least one letter",
    isMet: (value) => /\p{L}/u.test(value),
  },
  {
    id: "number",
    label: "At least one number",
    isMet: (value) => /\p{Nd}/u.test(value),
  },
];

/**
 * `/sign-in` — **email present and well formed, password present. Nothing more.**
 *
 * A length or complexity rule on the sign-in field tells an attacker the shape
 * of the password it is looking for, and refuses a legitimate person whose
 * account predates a policy change.
 */
export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password."),
});

export type SignInInput = z.infer<typeof signInSchema>;

const passwordField = PASSWORD_REQUIREMENTS.reduce(
  (field, requirement) => field.refine(requirement.isMet, requirement.label),
  z.string(),
);

/**
 * `/sign-up` — Rule 1.8's two ways into an organization, and there is no third.
 *
 * `organizationName` is required when founding and refused when an invitation
 * token is carried; the refinement states that rather than letting the adapter
 * discover it, because the message belongs on a field and a `ValidationError`
 * from `src/data` has no field to land on.
 */
export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your name."),
    email: emailField,
    password: passwordField,
    organizationName: z.string().trim().optional(),
    invitationToken: z.string().trim().optional(),
    /**
     * Rules 7.1, 7.5 — the grant is stated in the visible label and the form
     * does not submit without it. There is no "skip" and no "decide later".
     */
    acceptsTerms: z.literal(true, {
      error: "Accept the Terms of Service to create an account.",
    }),
  })
  .refine(
    (input) =>
      (input.invitationToken ?? "") !== "" ||
      (input.organizationName ?? "") !== "",
    {
      path: ["organizationName"],
      error: "Enter the name of your organization.",
    },
  );

export type SignUpInput = z.infer<typeof signUpSchema>;

/** `/invite/[token]` — the token is the credential, so it is only ever checked for presence here. */
export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/**
 * The first issue a parse produced, as a field name and a message.
 *
 * One issue at a time, on the field it belongs to (§10.3 — never a page
 * replacement). Returning every issue at once on a four-field form buries the
 * one the person is looking at.
 */
export function firstIssue(error: z.ZodError): {
  readonly field: string | undefined;
  readonly message: string;
} {
  const issue = error.issues[0];
  const path = issue?.path[0];
  return {
    field: typeof path === "string" ? path : undefined,
    message: issue?.message ?? "Check the details and try again.",
  };
}
