import type { AdapterDescription, DataAdapter } from "@/data/contracts";
import { NotImplementedError } from "@/lib/errors";

/**
 * The real implementation, written against the same contract as the mock.
 *
 * This is the only folder in `src/` outside `src/lib/` permitted to import
 * `@supabase/*`. `scripts/check-data-seam.mjs` fails the build if anything else
 * does (D-16).
 *
 * **Deliberately unimplemented.** This product ships its first working slice as
 * a mock-data prototype: every screen and flow runs on fake data behind this one
 * swap point, and the real backend is written afterward, against a contract the
 * screens have already proven (`PROJECT_SETUP_BMMP.md` §3.2, D-19). Writing it
 * now would mean guessing at a schema the prototype has not yet argued with.
 *
 * **Migration is four steps** (`TECHNICAL_SPEC.md` §5.5), and the order matters:
 *
 * 1. Write this folder against the **existing, unchanged** contract.
 * 2. Flip `DATA_ADAPTER` from `mock` to `supabase`.
 * 3. Run the same Playwright suite. **It must pass both ways.**
 * 4. Screens do not change. **If a screen has to change, the seam leaked — fix
 *    the seam, not the screen.**
 *
 * ## Why every method throws rather than returning nothing
 *
 * A stub that returned an empty page would let a misconfigured deployment look
 * like a tenant whose records had gone missing. Failing loudly with a stated
 * code is the same discipline the boot guard applies to `DATA_ADAPTER` itself:
 * **on a compliance product, looking like it is working is the worst available
 * failure mode.**
 *
 * ## Two things this folder will have to get right, recorded now
 *
 * - **Row-level security is the point.** `@supabase/ssr` server clients carry
 *   the caller's JWT so policies apply. **The service-role key is used in
 *   exactly two places** — the audit export job and the platform-admin rule
 *   publication path, both server-only route handlers, both still writing
 *   `audit_event`. Using it to satisfy an ordinary user request silently
 *   disables every policy in `TECHNICAL_SPEC.md` §9.5.
 * - **The adapter fetches; the domain decides.** `ruleVersions.resolve` gathers
 *   candidate rows and hands them to `src/domain/rules/resolve.ts`, and
 *   `catalogEntries.findCandidates` retrieves without ranking. If either one
 *   grows its own precedence or its own scorer, the two adapters diverge and the
 *   e2e suite stops proving anything.
 */

const NOT_IMPLEMENTED_MESSAGE =
  "The Supabase adapter is not implemented yet. This build runs on the mock " +
  "data adapter; the real implementation is written once the prototype has " +
  "settled the screens (PROJECT_SETUP_BMMP.md Section 3.2, D-19).";

function refuse(method: string): never {
  throw new NotImplementedError({
    userMessage: NOT_IMPLEMENTED_MESSAGE,
    context: { adapter: "supabase", method },
  });
}

/** Every method of a repository-shaped object, refusing with its own name. */
function unimplemented<T>(entity: string, methods: readonly string[]): T {
  const target: Record<string, () => never> = {};
  for (const method of methods) {
    target[method] = () => refuse(`${entity}.${method}`);
  }
  return target as T;
}

const CRUD = ["list", "get", "create", "update"] as const;
const APPEND_ONLY = ["list", "get", "append"] as const;

const describe = (): AdapterDescription => ({ name: "supabase", kind: "live" });

export const supabaseAdapter: DataAdapter = {
  describe,

  // Identity refuses exactly like the other twenty-six. **No Supabase Auth call
  // is written in this unit** (D-39): the screens, the guard, the tenancy and
  // the audit are real against the mock, and when Auth lands this object gains
  // an implementation while nothing in `src/app`, `src/features`,
  // `src/components` or `src/domain` moves.
  identity: unimplemented("identity", [
    "verifyCredentials",
    "createAccount",
    "readInvitation",
    "acceptInvitation",
    "resolveSession",
    "listSessionMemberships",
  ]),
  organizations: unimplemented("organizations", CRUD),
  users: unimplemented("users", CRUD),
  memberships: unimplemented("memberships", CRUD),
  tosAcceptances: unimplemented("tosAcceptances", [
    ...APPEND_ONLY,
    "setStatus",
  ]),

  jurisdictions: unimplemented("jurisdictions", [...CRUD, "chainFrom"]),
  jurisdictionRules: unimplemented("jurisdictionRules", CRUD),
  ruleVersions: unimplemented("ruleVersions", [
    ...APPEND_ONLY,
    "resolve",
    "findCandidates",
    "publish",
  ]),
  formatClassifications: unimplemented("formatClassifications", APPEND_ONLY),

  batteryRecords: unimplemented("batteryRecords", CRUD),
  catalogEntries: unimplemented("catalogEntries", [...CRUD, "findCandidates"]),
  intakeSessions: unimplemented("intakeSessions", [
    ...CRUD,
    "commitConfirmation",
  ]),
  intakePhotos: unimplemented("intakePhotos", APPEND_ONLY),
  labelExtractions: unimplemented("labelExtractions", APPEND_ONLY),
  dateCodeDecodes: unimplemented("dateCodeDecodes", APPEND_ONLY),

  containers: unimplemented("containers", CRUD),
  lots: unimplemented("lots", CRUD),
  storageClocks: unimplemented("storageClocks", CRUD),
  storageEvents: unimplemented("storageEvents", APPEND_ONLY),
  alerts: unimplemented("alerts", [...CRUD, "raiseIfAbsent"]),

  classificationDecisions: unimplemented(
    "classificationDecisions",
    APPEND_ONLY,
  ),
  shipments: unimplemented("shipments", [...CRUD, "offer"]),
  shippingPapers: unimplemented("shippingPapers", APPEND_ONLY),
  containerLabels: unimplemented("containerLabels", APPEND_ONLY),
  documentRenders: unimplemented("documentRenders", [
    ...APPEND_ONLY,
    "readBytes",
    "verify",
    "markSuperseded",
  ]),

  damageAssessments: unimplemented("damageAssessments", APPEND_ONLY),
  // `write` is the `security definer` door (§10.5, `app.write_audit_event()`).
  // It refuses here like everything else — an adapter that answered it silently
  // would be an audit trail nobody could tell was empty.
  auditEvents: unimplemented("auditEvents", [...APPEND_ONLY, "write"]),

  objects: unimplemented("objects", ["put", "get", "signedUrl"]),
};
