"use server";

import {
  DEV_IDENTITIES,
  FIXTURE_PASSWORD,
  isDevSignInAvailable,
} from "./dev-identities";
import { signIn } from "./actions";

/**
 * Sign in as one fixture identity — the development shortcut's one action.
 *
 * **It signs in through the real Server Action**, so the schema, the rate limit,
 * the credential check, the membership choice, the cookie and the redirect are
 * all the ones a person gets. Nothing here forges a session — the same rule
 * `tests/e2e/support/roles.ts` holds, and for the same reason: a shortcut that
 * wrote its own cookie would keep working after `writeSessionHandle` broke.
 *
 * A form action, so it needs no client JavaScript. The browser posts a persona
 * key and this resolves the credentials server-side, which keeps the password
 * out of the rendered page.
 *
 * **The adapter gate is re-checked here** rather than trusted from the component
 * that drew the button.
 */
export async function devSignIn(form: FormData): Promise<void> {
  if (!isDevSignInAvailable()) {
    throw new Error(
      "The development sign-in shortcut is only available against the mock adapter.",
    );
  }

  const key = form.get("identity");
  const identity = DEV_IDENTITIES.find((candidate) => candidate.key === key);
  if (identity === undefined) {
    throw new Error(`No development identity named ${String(key)}.`);
  }

  const credentials = new FormData();
  credentials.set("email", identity.email);
  credentials.set("password", FIXTURE_PASSWORD);

  // The real action. It redirects on success, which Next signals by throwing,
  // so this call does not return on the happy path.
  await signIn(null, credentials);
}
