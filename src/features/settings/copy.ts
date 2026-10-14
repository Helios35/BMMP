import { ROLE_LABELS } from "@/domain/taxonomy/role";

/**
 * The copy `/settings/organization` authors — `UX_SPEC.md` §3.17 fixes none of
 * it, so it is written once, here, where the owner can adjust it in one place.
 *
 * Two standing rules govern every string in this file:
 *
 * - **No jurisdiction threshold, deadline, citation or unit is a literal**
 *   (Rule 1.23). Nothing here states an interval, a period or a measure. The
 *   screen renders whatever number and unit the rule — or the organization's own
 *   configuration — supplies, and assumes nothing about either.
 * - **Name the remedy and who can supply it, never only the refusal**
 *   (Rule 1.26, D-35). Role names come from `ROLE_LABELS`; a T-37 label written
 *   inline is a defect even when it happens to match (`TAXONOMY.md` §5.3).
 */

/**
 * Who to send someone to on this page.
 *
 * **P1 cannot reach `/settings/organization` at all**, so nothing here offers
 * P1 a link and every block names P2 and P6 instead (E-11,
 * `ROUTE_ACCESS["/settings/organization"].note`).
 */
export const ORGANIZATION_SETTINGS_ACTORS = `a ${ROLE_LABELS.facility_manager} or a ${ROLE_LABELS.platform_admin}`;

/** The same, opening a sentence. */
const ORGANIZATION_SETTINGS_ACTORS_SENTENCE = `A ${ROLE_LABELS.facility_manager} or a ${ROLE_LABELS.platform_admin}`;

// --- E-11 — the 24-hour emergency contact number ----------------------------

/**
 * **One state, not two.** A verification that has lapsed is treated exactly as
 * one that never existed (D-32) — same alert, same copy, same consequence — so
 * this headline and body cover every entry point. A distinct "expired" visual is
 * a defect.
 *
 * The body says *in force* rather than *on file* because a lapsed verification
 * **is** on file: `ORG.cascade` carries a date and an actor, and its
 * verification still does not stand.
 */
export const EMERGENCY_UNVERIFIED_HEADLINE = "This number isn't verified.";

export const EMERGENCY_UNVERIFIED_BODY =
  "A 24-hour emergency contact number has to be verified before it can go on a shipping paper. No verification is in force for this organization.";

export const EMERGENCY_UNVERIFIED_REMEDY = `${ORGANIZATION_SETTINGS_ACTORS_SENTENCE} records the verification. Verifying is a recorded act with a date and a person attached to it.`;

/** Rendered where no number has been supplied at all. */
export const EMERGENCY_NO_NUMBER = "No number recorded.";

// --- D-63 — editing and verifying the 24-hour number --------------------------

export const EMERGENCY_PHONE_LABEL = "24-hour emergency contact number";
export const EMERGENCY_REF_LABEL = "Emergency response information reference";
export const EMERGENCY_PHONE_HINT =
  "Digits, with a leading + if the number has one.";

/** §3.17's primary action. */
export const EMERGENCY_SAVE = "Save changes";
export const EMERGENCY_SAVING = "Saving…";

/**
 * D-63 #2, at the point of change — **any change clears the verification.**
 * Stated before the person saves, not discovered afterwards.
 */
export const EMERGENCY_SAVE_CLEARS =
  "Saving a change to either value clears the verification. The number then has to be verified again before it can go on a shipping paper.";

export const EMERGENCY_SAVED = "Emergency contact saved";
export const EMERGENCY_SAVED_DETAIL =
  "The verification was cleared. Verify the number before it goes on a shipping paper.";
export const EMERGENCY_UNCHANGED = "Nothing changed, so nothing was saved.";

/** D-63 #3 — the attestation is its own act: a button, then a confirm. */
export const EMERGENCY_VERIFY = "Verify this number";
export const EMERGENCY_VERIFYING = "Recording…";
export const EMERGENCY_VERIFY_TITLE = "Verify the 24-hour number?";
/** The sentence the person confirms, exactly as D-63 and brief 07 author it. */
export const EMERGENCY_ATTESTATION =
  "I called this number and it reaches our 24-hour emergency response provider.";
export const EMERGENCY_VERIFY_DETAIL =
  "Your name and today's date are recorded against the number. Nobody can enter either by hand.";
export const EMERGENCY_VERIFY_CONFIRM = "Verify";
export const EMERGENCY_CANCEL = "Cancel";
export const EMERGENCY_VERIFIED = "Verification recorded";
export const EMERGENCY_VERIFY_NEEDS_NUMBER =
  "Record a number before verifying it.";
export const EMERGENCY_VERIFY_UNSAVED =
  "Save or undo your change first. The number you verify is the number on file.";

/** E-11's way back to the draft the person left. */
export const RETURN_TO_SHIPMENT = "Back to the shipment draft";

// --- §3.6.3 — clock demonstration method, per site --------------------------

export const CLOCK_METHOD_NOT_RECORDED = "Not recorded";

export const CLOCK_METHOD_REMEDY = `${ORGANIZATION_SETTINGS_ACTORS_SENTENCE} records this, per site, with its effective date.`;

/**
 * **Do not infer it.** Container-marking evidence exists in the data and
 * inferring a compliance fact from adjacent data is precisely what this product
 * forbids — the method is recorded or it is not recorded (Rules 4.2, 4.3).
 */
export const CLOCK_METHOD_NOT_INFERRED =
  "The method is recorded, never inferred from what is already on a container.";

/**
 * Rule 4.3, authored for the unit that builds the write path. **It renders at
 * the point of change, not here** — a standing sentence on a read-only page is
 * noise; the same sentence beside the control that changes the method is the
 * requirement.
 */
export const CLOCK_METHOD_CHANGE_DOES_NOT_RESTART =
  "Changing the method does not restart any clock.";

// --- E-13 — a site with no jurisdiction profile ------------------------------

export const NO_JURISDICTION_HEADLINE =
  "This site has no jurisdiction profile.";

/**
 * **Classification is blocked, not defaulted** (Rule 3.10). No fallback
 * jurisdiction, no "assume federal", no default threshold, no placeholder
 * citation — every one of those would put a number the law never supplied onto a
 * document.
 */
export const NO_JURISDICTION_BODY = `Nothing is classified for this site until a jurisdiction is recorded for it. ${ORGANIZATION_SETTINGS_ACTORS_SENTENCE} can supply it. No default is assumed in the meantime.`;

// --- §3.6.4 — the jurisdiction profile --------------------------------------

/**
 * Why the rule payload renders key-to-value with nothing humanised.
 *
 * Rendering "Retention: 3 years" would require this screen to know that a key
 * named for years means years — an assumption about jurisdiction data, and the
 * next jurisdiction measures by energy rather than by volume (Rule 1.23).
 */
export const RULE_PAYLOAD_NOTE =
  "Values are shown exactly as the rule version stores them, with no interpretation.";

export const NO_RULE_VERSION_IN_FORCE =
  "No published version of this rule is in force on this date.";

export const NO_RULES_FOR_JURISDICTION =
  "No active rules are recorded for this jurisdiction.";

// --- §3.6.5 — Terms of Service ----------------------------------------------

/**
 * Rules 7.6, 7.7, 7.15 — a record captured while no acceptance was in force is
 * **permanently** not training-eligible and no later acceptance reverses it.
 * Nothing on this screen may suggest otherwise.
 */
export const TOS_PRIOR_VERSION_NOTE =
  "Each accepted version stays on file permanently, because it governs the records captured under it.";

/**
 * The two settings pages' descriptions.
 *
 * Constants because **each page's loading skeleton renders the same sentence
 * invisibly**, so it occupies exactly the space the real one will at every width
 * (`UX_SPEC.md` §6.3). Inline strings would drift the first time a word changed,
 * and the drift would be a silent jump under the reader rather than a failure.
 */
export const ORGANIZATION_PAGE_DESCRIPTION =
  "The 24-hour emergency contact is edited and verified here. Everything else on this page is read-only in this release.";

export const MEMBERS_PAGE_DESCRIPTION =
  "Who is in this organization and what each of them can do. Everything on this page is read-only in this release.";
