import { activeAdapterName } from "@/data";
import { ROLE_LABELS } from "@/domain/taxonomy/role";
import type { RoleCode } from "@/domain/taxonomy/role";

/**
 * **A development shortcut. It is not part of the product and it does not ship.**
 *
 * One click signs in as a fixture identity so a reviewer can walk the prototype
 * without typing a fake address and a fake password on every visit.
 *
 * ## Why this is safe, stated rather than assumed
 *
 * It renders and it runs **only when the mock adapter is live**, checked here in
 * the action as well as in the component that draws it — a control that is
 * merely not rendered is not a control that cannot be called.
 *
 * `resolveAdapter` already refuses `DATA_ADAPTER=mock` outright under
 * `VERCEL_ENV=production` and throws rather than falling back (D-16), so *mock
 * is live* and *this is not production* are the same fact. There is no second
 * environment read here, and no `NODE_ENV` check that could disagree with the
 * one the seam already made.
 *
 * ## Why the addresses are restated
 *
 * They are copied from the `users` array in `src/data/mock/fixtures/index.ts`,
 * and the password from `MOCK_DEV_PASSWORD` in `src/data/mock/identity.ts`.
 * Importing them would pull the in-memory store into this module on every
 * adapter, including the one that must never see it.
 *
 * **The duplication cannot drift silently**: every value here is an input to a
 * real sign-in, so a changed fixture makes the button fail on the first click
 * rather than quietly signing in as someone else.
 */

/** `MOCK_DEV_PASSWORD`. Fake credentials for fake data, behind the boot guard. */
export const FIXTURE_PASSWORD = "bmmp-dev-password";

export interface DevIdentity {
  readonly key: string;
  readonly personaId: "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
  readonly role: RoleCode;
  readonly name: string;
  readonly email: string;
  /**
   * Why you would pick this one — **and never which organisation it is in.**
   *
   * `/sign-in` is public and a reader there has proved nothing, so the page
   * names no account, organisation or grant (Rule 1.2). The first version of
   * this panel printed all three tenant names on the product's front door and
   * `edge-list-and-lookup-states.spec.ts` failed, which is exactly what that
   * assertion is for. A scenario is what a reviewer actually needs anyway.
   */
  readonly scenario: string;
}

export const DEV_IDENTITIES: readonly DevIdentity[] = [
  {
    key: "p1",
    personaId: "P1",
    role: "compliance_handler",
    name: "Dana Okafor",
    email: "dana.okafor@cascade-recyclers.example",
    scenario:
      "The daily user. The only role that logs a battery, and it cannot reach the audit log.",
  },
  {
    key: "p2",
    personaId: "P2",
    role: "facility_manager",
    name: "Marta Bellini",
    email: "marta.bellini@cascade-recyclers.example",
    scenario:
      "Reaches every route in this build except intake. The widest view — start here.",
  },
  {
    key: "p3",
    personaId: "P3",
    role: "producer_compliance_officer",
    name: "Priya Narang",
    email: "priya.narang@cascade-recyclers.example",
    scenario:
      "Reads the record surfaces. Neither settings route, nor the audit log.",
  },
  {
    key: "p4",
    personaId: "P4",
    role: "mobility_supplier_technician",
    name: "Omar Haddad",
    email: "omar.haddad@cascade-recyclers.example",
    scenario: "Gains intake at B3 and holds none of it here.",
  },
  {
    key: "p5",
    personaId: "P5",
    role: "auditor",
    name: "Sam Reyes",
    email: "s.reyes@northbeam-underwriting.example",
    scenario:
      "E-8a — the read-only banner, and every mutating control disabled with its reason.",
  },
  {
    key: "p6",
    personaId: "P6",
    role: "platform_admin",
    name: "Platform Admin",
    email: "admin@nextsketch.example",
    scenario:
      "Acts under a recorded support grant. The only role that can edit a catalog entry.",
  },
  {
    key: "p1-olympic",
    personaId: "P1",
    role: "compliance_handler",
    name: "Tom Ashby",
    email: "tom.ashby@olympic-mobility.example",
    scenario:
      "E-12 and E-1 — no Terms of Service acceptance in force, and no battery records at all.",
  },
  {
    key: "p2-olympic",
    personaId: "P2",
    role: "facility_manager",
    name: "Rosa Delgado",
    email: "rosa.delgado@olympic-mobility.example",
    scenario:
      "E-12's named remedy — the person the intake block tells Tom to ask.",
  },
  {
    key: "p1-rainier",
    personaId: "P1",
    role: "compliance_handler",
    name: "Jo Mensah",
    email: "jo.mensah@rainier-mobility.example",
    scenario:
      "A second tenant. Her record is the one the first must never be able to open.",
  },
];

/** `ROLE_LABELS`, never a label written inline (`TAXONOMY.md` §5.3). */
export function devIdentityLabel(identity: DevIdentity): string {
  return `${identity.personaId} · ${ROLE_LABELS[identity.role]}`;
}

/**
 * Whether the shortcut may exist at all.
 *
 * **Checked in the panel that draws it and again in the action it calls.** A
 * control that is merely not rendered is not a control that cannot be called.
 */
export function isDevSignInAvailable(): boolean {
  return activeAdapterName === "mock";
}
