import { mkdirSync } from "node:fs";

import { test as setup } from "@playwright/test";

import {
  AUTH_STATE_DIR,
  PERSONA_KEYS,
  PERSONAS,
  signInAndLand,
  storageStateFor,
} from "./roles";

/**
 * The `setup` project — one signed-in browser state per fixture identity.
 *
 * **It goes through the real `/sign-in` form**, once per identity, and saves the
 * cookie the `signIn` Server Action wrote. Every other spec declares
 * `test.use({ storageState: storageStateFor(…) })` and starts already signed in,
 * so the form is driven nine times per run instead of once per test.
 *
 * The saving is the only thing this file does that a spec would not: **nothing
 * here forges a cookie, seeds a store or shortcuts the guard.** The session that
 * lands in `test-results/.auth/<key>.json` is the one the product issued, which
 * is what keeps the property that matters — the same suite passes against
 * Supabase once these users exist there (D-15, D-16).
 *
 * A failure here fails the whole run before a spec executes, which is the
 * intended behaviour: if a fixture address or the password has moved, every
 * downstream assertion about who may be where is meaningless.
 */

setup.describe.configure({ mode: "parallel" });

for (const key of PERSONA_KEYS) {
  const persona = PERSONAS[key];

  setup(
    `sign in as ${key} — ${persona.fullName} (${persona.personaId})`,
    async ({ page }) => {
      mkdirSync(AUTH_STATE_DIR, { recursive: true });

      await signInAndLand(page, key);

      await page.context().storageState({ path: storageStateFor(key) });
    },
  );
}
