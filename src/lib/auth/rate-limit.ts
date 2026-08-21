import "server-only";

/**
 * Sign-in attempt throttling.
 *
 * **A prototype affordance, and it says so out loud.** The state is a
 * process-local `Map`: it is not shared between serverless instances, it does
 * not survive a restart, and it is therefore not a security control. It exists
 * so `/sign-in` can render the "too many attempts" state `UX_SPEC.md` §3.1
 * specifies at all, on a mocked identity provider that has no limiter of its own
 * (D-39). **Supabase Auth's own limiter replaces it at the swap**, and this file
 * is deleted rather than ported.
 *
 * The two numbers below are product behaviour, not regulatory values. Rule 1.23
 * governs jurisdiction thresholds and deadlines; a lockout window is neither,
 * and it is named here so the copy interpolates it instead of restating it.
 */

export const SIGN_IN_ATTEMPT_LIMIT = 5;
export const SIGN_IN_LOCKOUT_MINUTES = 15;

const LOCKOUT_MILLISECONDS = SIGN_IN_LOCKOUT_MINUTES * 60 * 1000;

interface AttemptRecord {
  readonly failures: number;
  /** When the window that holds these failures closes. */
  readonly windowEndsAt: number;
}

const attemptsByEmail = new Map<string, AttemptRecord>();

/** Keyed on the lowercased address, so `Dana@…` and `dana@…` share one window. */
function keyFor(email: string): string {
  return email.trim().toLowerCase();
}

export interface SignInAttemptVerdict {
  readonly allowed: boolean;
  /** Whole minutes until the window closes. Zero when the attempt is allowed. */
  readonly retryAfterMinutes: number;
}

/**
 * Whether another attempt may be made for this address.
 *
 * **The caller must not render a different message before the lockout begins
 * than after it.** `UX_SPEC.md` §3.1: sign-in never says which half was wrong,
 * and a lockout message that only appears for real accounts would answer that
 * question by omission.
 */
export function signInAttemptVerdict(
  email: string,
  at: number = Date.now(),
): SignInAttemptVerdict {
  const record = attemptsByEmail.get(keyFor(email));
  if (record === undefined || record.windowEndsAt <= at) {
    return { allowed: true, retryAfterMinutes: 0 };
  }
  if (record.failures < SIGN_IN_ATTEMPT_LIMIT) {
    return { allowed: true, retryAfterMinutes: 0 };
  }
  return {
    allowed: false,
    retryAfterMinutes: Math.max(
      1,
      Math.ceil((record.windowEndsAt - at) / 60_000),
    ),
  };
}

/** Count one failed attempt. The window starts at the first failure and does not slide. */
export function recordSignInFailure(
  email: string,
  at: number = Date.now(),
): void {
  const key = keyFor(email);
  const record = attemptsByEmail.get(key);
  if (record === undefined || record.windowEndsAt <= at) {
    attemptsByEmail.set(key, {
      failures: 1,
      windowEndsAt: at + LOCKOUT_MILLISECONDS,
    });
    return;
  }
  attemptsByEmail.set(key, {
    failures: record.failures + 1,
    windowEndsAt: record.windowEndsAt,
  });
}

/** Clear the window after a successful sign-in. */
export function clearSignInFailures(email: string): void {
  attemptsByEmail.delete(keyFor(email));
}

/** Empty the whole table. For tests, which must not inherit each other's windows. */
export function resetSignInAttempts(): void {
  attemptsByEmail.clear();
}
