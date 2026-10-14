import { z } from "zod";

/**
 * Input parsing for the settings write paths.
 *
 * ## `/settings/users` — **written before the form exists.**
 *
 * D-31 ships P5 enforcement in B1a and leaves the grant-management workflow to
 * B1b, so this unit renders the grants read-only. The **constraint** is what
 * cannot wait: Rule 1.15 says a grant without an expiry cannot be created, and
 * that is only provable if the schema that will one day write a grant makes it
 * structurally impossible to omit one. Fixing it here means the later unit
 * implements against a settled target rather than re-deciding it, and the unit
 * test below fails the moment someone reaches for `.optional()`.
 *
 * **There is no "never" value anywhere in this vocabulary.** Not a null, not a
 * sentinel date, not an "indefinite" checkbox, not a clear button on the date
 * field. A P5 or P6 row whose expiry is absent is a data defect, and the correct
 * reading of it is "no access" — never "no limit"
 * (`src/domain/access/grant.ts`).
 */

/**
 * Granting auditor access — D-31, Rules 1.15, 1.28.
 *
 * `expiresOn` is **required**: no `.optional()`, no `.nullable()`, no default.
 * `scope` carries at least one entry, because a grant that covers nothing is not
 * a grant and Rule 12.19 narrows an export by it.
 */
export const auditorGrantSchema = z.object({
  membershipId: z.uuid(),
  /** Rule 1.18 — a support or audit grant with no stated reason is not recorded. */
  reason: z.string().trim().min(1, "State why this access is being granted."),
  scope: z
    .array(z.string().trim().min(1))
    .min(1, "A grant always covers a stated scope."),
  expiresOn: z.iso.date("Choose the date this access ends."),
});

export type AuditorGrantInput = z.infer<typeof auditorGrantSchema>;

// --- `/settings/organization` — the 24-hour emergency contact (D-63) ----------

/** Separators a person types in a phone number. Everything else is refused. */
const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;
/** E.164 allows at most 15 digits; fewer than 7 is not a reachable number. */
const PHONE_DIGITS = { min: 7, max: 15 } as const;

function phoneDigitCount(value: string): number {
  return value.replace(/\D/g, "").length;
}

/**
 * The number and the emergency response reference, as typed.
 *
 * **No date and no person.** A change is never a verification (D-63 #2, #3):
 * the adapter clears the stamp in the same write, and a verification is its
 * own act with its own action. Blank is allowed and is stored as absent —
 * which is the state that blocks a shipping paper (Rule 5.7).
 */
export const emergencyContactSchema = z.object({
  phone: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (PHONE_CHARACTERS.test(value) &&
          phoneDigitCount(value) >= PHONE_DIGITS.min &&
          phoneDigitCount(value) <= PHONE_DIGITS.max),
      "Enter the number as digits, with a leading + if it has one — for example +1-800-555-0142.",
    ),
  contractRef: z
    .string()
    .trim()
    .max(120, "Keep the reference to 120 characters or fewer."),
});

export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;

/**
 * The attestation — the number the person called, and nothing else. The date
 * comes from the server's clock and the person from the session (D-63 #3).
 */
export const verifyEmergencyContactSchema = z.object({
  phone: z.string().trim().min(1, "There is no number to verify."),
});
