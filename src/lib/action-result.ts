import { isAppError, ValidationError, type AppErrorCode } from "@/lib/errors";

/**
 * What every Server Action returns — `TECHNICAL_SPEC.md` §7.1, §10.1.
 *
 * **A Server Action never throws across the boundary** (`redirect()` and
 * `notFound()` excepted — those are control flow, not failures). A thrown error
 * crossing the client boundary in production arrives as a redacted digest, so
 * the field-level message, the code the UI branches on and the correlation id a
 * user reads back over the phone are all lost. It is returned instead.
 *
 * **Defined once, here.** A second copy of this type in a feature folder is a
 * review rejection: two shapes means two renderings of the same failure, and the
 * one a user quotes to support is whichever they happened to hit.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        readonly code: AppErrorCode;
        /**
         * What the user is told. `TECHNICAL_SPEC.md` §10.3: what failed, what
         * state the record is now in, what to do next. Never a stack trace,
         * never a SQL error, never a provider name, never an internal id other
         * than the correlation id. Never states or implies a compliance outcome
         * the system did not compute, and never expresses a probability of
         * ignition (Rules 1.25, 3.10, 10.3).
         */
        readonly message: string;
        /** Set when the failure belongs to one field, so the form can put it there. */
        readonly field?: string;
        /**
         * Shown to the user on a 5xx only, never on a 4xx (§10.3 rule 2). It is
         * always carried so the log and the screen can be joined either way.
         */
        readonly correlationId: string;
      };
    };

export function actionSucceeded<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionFailed<T>(error: {
  code: AppErrorCode;
  message: string;
  field?: string;
  correlationId: string;
}): ActionResult<T> {
  return { ok: false, error };
}

/**
 * The step-4 catch every Server Action ends with: turn a thrown `AppError` into
 * the returned shape without losing its code, its field or its correlation id.
 *
 * `unknown` in, narrowed here — nothing is swallowed and nothing is guessed
 * (§10.1). A value that is not an `AppError` is a bug rather than a handled
 * condition, so it reports the generic `DATA_INTEGRITY` message and the caller
 * still logs the original at `error`.
 */
export function actionFailedFrom<T>(
  error: unknown,
  correlationId: string,
): ActionResult<T> {
  if (isAppError(error)) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.userMessage,
        ...(error instanceof ValidationError && error.field !== undefined
          ? { field: error.field }
          : {}),
        correlationId: error.correlationId ?? correlationId,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "DATA_INTEGRITY",
      message: "Something went wrong and nothing was changed. Try again.",
      correlationId,
    },
  };
}
