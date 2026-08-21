import path from "node:path";

import { expect, type Page } from "@playwright/test";

import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * How a Playwright spec becomes a person.
 *
 * ## The constraint that shapes every decision in this file
 *
 * **The same suite must pass against `DATA_ADAPTER=mock` and, after migration,
 * against `DATA_ADAPTER=supabase`** (D-15, D-16, `TECHNICAL_SPEC.md` §5.5). So a
 * test drives the product the way a person does: it signs in through the real
 * `/sign-in` form, navigates by clicking or by URL, and asserts on what renders.
 *
 * Three things follow from that, and none of them is negotiable:
 *
 * 1. **No spec reaches into `src/data`.** No adapter import, no fixture store,
 *    no `resetMockStore()`. A test that mutates the store out of band is testing
 *    the mock, and it has nothing to say about Supabase.
 * 2. **No helper forges a session cookie.** The guard, the cookie and the
 *    redirect are the things under test (spec 03 §B); a helper that wrote
 *    `bmmp_session` directly would prove none of them, and would keep passing
 *    after `writeSessionHandle` was broken.
 * 3. **Loading and seeded-failure states are proven in vitest, not here.**
 *    Driving them would need a second built server with a different
 *    environment, which is exactly the identical-suite property being given up.
 *    `playwright.config.ts` pins `MOCK_LATENCY_MS` and `MOCK_SEEDED_FAILURES`
 *    to empty for that reason.
 *
 * ## Why the addresses and the password are restated here
 *
 * They are copied from — and only from — these two places:
 *
 * - `src/data/mock/fixtures/index.ts`, the `users` array, for every address.
 * - `src/data/mock/identity.ts`, `MOCK_DEV_PASSWORD`, for the password.
 *
 * Importing them instead would pull `src/data/mock/index.ts` — and with it the
 * whole in-memory store — into the Playwright process, which is the door rule 1
 * closes. Spec 03 §A.4 permits restating them for exactly this reason.
 *
 * **The duplication cannot drift silently.** Every one of these values is an
 * input to a real sign-in in `auth.setup.ts`; change a fixture address or the
 * password and every setup project fails on the first run, loudly, before a
 * single spec executes.
 *
 * Fixture *identifiers* are a different matter and are imported: they are frozen
 * constants with no runtime behaviour, they are the same rows Supabase will hold
 * after migration, and a spec needs them to build a URL.
 */

export { INVITE_TOKENS } from "@/data/mock/fixtures/invite-tokens";
export * as fixtureIds from "@/data/mock/fixtures/ids";

/**
 * The one password every fixture identity signs in with — the value of
 * `MOCK_DEV_PASSWORD` in `src/data/mock/identity.ts`.
 *
 * Fake credentials for fake data. `resolveAdapter` refuses `DATA_ADAPTER=mock`
 * under `VERCEL_ENV=production` and throws rather than falling back (D-16), so
 * it never unlocks a real record.
 */
export const FIXTURE_PASSWORD = "bmmp-dev-password";

/**
 * A fixture identity a spec can be.
 *
 * `personaId` is the `_ANCHORS.md` persona, `role` the T-37 code, and
 * `organizationName` the tenant the session lands in — `signIn` picks the first
 * in-force membership by organization name, so this is the deterministic answer
 * and not the incidental one.
 */
export interface FixturePersona {
  readonly key: PersonaKey;
  readonly personaId: "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
  readonly role: RoleCode;
  readonly fullName: string;
  readonly email: string;
  readonly organizationName: string;
  /** Why this identity exists in the set, so a spec picks the right one. */
  readonly note: string;
}

/**
 * The identities with a signed-in storage state.
 *
 * Six roles, then the three tenancy counterparts the guard specs need: Jo at
 * Rainier proves a cross-tenant identifier is a real record and not an absent
 * one, and Olympic's two members are E-12's subjects — Olympic holds **no Terms
 * of Service acceptance in force**, so it is the only tenant where the intake
 * block is reachable.
 *
 * **`leeAuditorExpired` is deliberately absent.** Her grant has expired, so
 * `resolveSession` refuses her on every request (Rule 1.28) and no session can
 * be saved. A spec that needs her drives {@link signInAs} directly and asserts
 * the refusal.
 */
export const PERSONA_KEYS = [
  "p1",
  "p2",
  "p3",
  "p4",
  "p5",
  "p6",
  "p1Rainier",
  "p1Olympic",
  "p2Olympic",
] as const;

export type PersonaKey = (typeof PERSONA_KEYS)[number];

export const PERSONAS: Readonly<Record<PersonaKey, FixturePersona>> = {
  p1: {
    key: "p1",
    personaId: "P1",
    role: "compliance_handler",
    fullName: "Dana Okafor",
    email: "dana.okafor@cascade-recyclers.example",
    organizationName: "Cascade Auto Recyclers",
    note: "The daily user. Cannot reach /audit (Rule 12.8), and holds the only write on /batteries/new.",
  },
  p2: {
    key: "p2",
    personaId: "P2",
    role: "facility_manager",
    fullName: "Marta Bellini",
    email: "marta.bellini@cascade-recyclers.example",
    organizationName: "Cascade Auto Recyclers",
    note: "Holds Cascade's binding authority (D-35) and reaches every route this unit renders except /batteries/new.",
  },
  p3: {
    key: "p3",
    personaId: "P3",
    role: "producer_compliance_officer",
    fullName: "Priya Narang",
    email: "priya.narang@cascade-recyclers.example",
    organizationName: "Cascade Auto Recyclers",
    note: "Reads the record surfaces; reaches neither settings route nor /audit.",
  },
  p4: {
    key: "p4",
    personaId: "P4",
    role: "mobility_supplier_technician",
    fullName: "Omar Haddad",
    email: "omar.haddad@cascade-recyclers.example",
    organizationName: "Cascade Auto Recyclers",
    note: "Gains write on /batteries/new at B3; holds none of it here.",
  },
  p5: {
    key: "p5",
    personaId: "P5",
    role: "auditor",
    fullName: "Sam Reyes",
    email: "s.reyes@northbeam-underwriting.example",
    organizationName: "Cascade Auto Recyclers",
    note: "Read-only, externally, everywhere, always (Rule 1.14). Grant in force. Export is never disabled (Rule 5.27, E-8a).",
  },
  p6: {
    key: "p6",
    personaId: "P6",
    role: "platform_admin",
    fullName: "Platform Admin",
    email: "admin@nextsketch.example",
    organizationName: "Cascade Auto Recyclers",
    note: "Acts inside Cascade under a recorded support grant only (Rules 1.17, 1.18). The Rainier grant has expired.",
  },
  p1Rainier: {
    key: "p1Rainier",
    personaId: "P1",
    role: "compliance_handler",
    fullName: "Jo Mensah",
    email: "jo.mensah@rainier-mobility.example",
    organizationName: "Rainier Mobility Services",
    note: "The second tenant. BATTERY.rainierScooter is hers, which is what makes the cross-tenant test prove something.",
  },
  p1Olympic: {
    key: "p1Olympic",
    personaId: "P1",
    role: "compliance_handler",
    fullName: "Tom Ashby",
    email: "tom.ashby@olympic-mobility.example",
    organizationName: "Olympic Mobility Supply",
    note: "E-12. Olympic has no acceptance in force, so /batteries/new blocks for him and every read-only route stays open.",
  },
  p2Olympic: {
    key: "p2Olympic",
    personaId: "P2",
    role: "facility_manager",
    fullName: "Rosa Delgado",
    email: "rosa.delgado@olympic-mobility.example",
    organizationName: "Olympic Mobility Supply",
    note: "E-12's named remedy — Olympic's binding-authority holder, the person the intake block tells Tom to ask.",
  },
};

/**
 * Names for the two properties a spec asks for by name rather than by role.
 *
 * E-16 turns on how many organizations a session can act in, not on which role
 * it holds, and a spec that hard-codes `"p1"` for "the single-organization user"
 * silently becomes wrong the day Dana is invited to a second tenant. Marta is
 * the only fixture identity with two in-force memberships
 * (`src/data/mock/fixtures/index.ts` — `MEMBERSHIP.martaCascade` +
 * `martaOlympic`); every other identity has exactly one.
 */
export const PERSONA_ALIASES = {
  /** E-16 — the organization switcher is not rendered for this session. */
  singleOrganization: "p1",
  /** E-16's counterpart — the switcher is rendered, with two entries. */
  twoOrganizations: "p2",
} as const satisfies Readonly<Record<string, PersonaKey>>;

export type PersonaAlias = keyof typeof PERSONA_ALIASES;

/** Anything a spec may name a person by. */
export type PersonaRef = PersonaKey | PersonaAlias;

function isAlias(ref: PersonaRef): ref is PersonaAlias {
  return ref in PERSONA_ALIASES;
}

/** The identity behind a key or an alias. */
export function personaFor(ref: PersonaRef): FixturePersona {
  return PERSONAS[isAlias(ref) ? PERSONA_ALIASES[ref] : ref];
}

/**
 * Where the signed-in browser states live.
 *
 * **Under `test-results/` because `.gitignore`, `.prettierignore` and
 * `eslint.config.mjs` already ignore that path**, and none of those three files
 * belongs to this unit's e2e work. Spec 03 §A.4 names `tests/e2e/.auth/`; moving
 * there needs one line added to `.gitignore` and one to `.prettierignore`, or a
 * signed-in cookie for every fixture identity lands in the working tree and
 * `pnpm format:check` fails on a file Playwright wrote.
 *
 * `playwright.config.ts` points `outputDir` at `test-results/artifacts`, so
 * Playwright's per-run cleanup empties that directory and leaves this one alone.
 * The setup project rewrites every file on every run regardless, so a stale
 * state is not a state a spec can pick up.
 */
export const AUTH_STATE_DIR = path.join(process.cwd(), "test-results", ".auth");

/**
 * The `storageState` path for one identity — `test.use({ storageState:
 * storageStateFor("p5") })`.
 *
 * Written by the `setup` project, which every browser project depends on, so the
 * file exists before any spec that declares it runs.
 */
export function storageStateFor(ref: PersonaRef): string {
  return path.join(AUTH_STATE_DIR, `${personaFor(ref).key}.json`);
}

export interface SignInOptions {
  /**
   * The path to land on afterwards, carried as `?next=`.
   *
   * Validated server-side by `safeNextPath`, so a public route or an off-site
   * value resolves to `/` — which is the behaviour a spec asserting the open
   * redirect is closed wants to see.
   */
  readonly next?: string;
}

/**
 * Sign in as a fixture identity **through the real form**.
 *
 * Fills `/sign-in`, submits it, and waits for the redirect off the page. The
 * session cookie is written by the `signIn` Server Action exactly as it is for a
 * person, so the guard, the cookie and the redirect are all exercised — which is
 * the whole reason no helper here forges one.
 *
 * Returns the identity, so a spec can assert against the name or the
 * organization without restating either.
 */
export async function signInAs(
  page: Page,
  ref: PersonaRef,
  options: SignInOptions = {},
): Promise<FixturePersona> {
  const persona = personaFor(ref);
  const { next } = options;

  await page.goto(
    next === undefined
      ? "/sign-in"
      : `/sign-in?next=${encodeURIComponent(next)}`,
  );

  await page.getByLabel("Email").fill(persona.email);
  await page.getByLabel("Password").fill(FIXTURE_PASSWORD);

  const landed = page.waitForURL((url) => url.pathname !== "/sign-in");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  try {
    await landed;
  } catch (cause) {
    // A sign-in that fails leaves the reader on the form with the reason in an
    // alert. Surfacing it turns "waitForURL timed out" — which says nothing —
    // into the message the product actually gave.
    const stated = await page
      .getByRole("alert")
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(
      `Sign-in as ${persona.email} (${persona.key}) did not leave /sign-in.` +
        (stated === null ? "" : ` The form said: ${stated.trim()}`),
      { cause },
    );
  }

  return persona;
}

/**
 * Sign in and prove the session is real before anything is built on it.
 *
 * Every `(app)` route renders `<h1 id="page-title">` (spec 01 §G2), so its
 * presence is the role-agnostic proof that a guarded route rendered rather than
 * bouncing back to `/sign-in`.
 */
export async function signInAndLand(
  page: Page,
  ref: PersonaRef,
  options: SignInOptions = {},
): Promise<FixturePersona> {
  const persona = await signInAs(page, ref, options);
  await expect(page.locator("#page-title")).toBeVisible();
  return persona;
}
