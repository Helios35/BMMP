/**
 * The error taxonomy — `TECHNICAL_SPEC.md` §10.1.
 *
 * **Both adapters throw the same codes**, so a test that asserts on
 * `TENANT_SCOPE` passes on mock and on Supabase. That is a contract hygiene rule
 * (§5.2), not a convenience.
 *
 * **The rule: nothing is swallowed.** Every `catch` either rethrows an
 * `AppError` or records an `audit_event`. An empty catch block, a bare
 * `catch { return null }` and `catch { /* ignore *\/ }` are review rejections.
 * Where a failure is genuinely tolerable — a recall check that could not reach
 * the government API — it is recorded as a *pending* state on the row with a
 * reason, never as an absent one.
 */

export const APP_ERROR_CODES = [
  "VALIDATION",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TENANT_SCOPE",
  "RULE_UNRESOLVED",
  "INTEGRATION",
  "DOCUMENT_RENDER",
  "DOCUMENT_INTEGRITY",
  "DATA_INTEGRITY",
  "NOT_IMPLEMENTED",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export type AppErrorSeverity = "warn" | "error";

export interface AppErrorOptions {
  /** What the user is told. Never a stack trace, a SQL error, a provider name or an internal id. */
  readonly userMessage: string;
  readonly correlationId?: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;
  readonly severity: AppErrorSeverity;
  readonly retryable: boolean;
  readonly correlationId: string | undefined;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(
    code: AppErrorCode,
    httpStatus: number,
    severity: AppErrorSeverity,
    retryable: boolean,
    options: AppErrorOptions,
  ) {
    super(options.userMessage, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.severity = severity;
    this.retryable = retryable;
    this.userMessage = options.userMessage;
    this.correlationId = options.correlationId;
    this.context = options.context ?? {};
  }
}

/** Field-level messages inline. Nothing is submitted. */
export class ValidationError extends AppError {
  readonly field: string | undefined;
  constructor(options: AppErrorOptions & { field?: string }) {
    super("VALIDATION", 400, "warn", false, options);
    this.field = options.field;
  }
}

/** Redirect to `/sign-in` with a return path. */
export class AuthError extends AppError {
  constructor(options: AppErrorOptions) {
    super("UNAUTHENTICATED", 401, "warn", false, options);
  }
}

/**
 * "Your role cannot do this," naming the role, the rule and who to ask
 * (Rule 1.26). **Denials are audited** (Rules 1.16, 12.6) — an attempt is
 * evidence, and a silently disabled control is a defect, not a safe default.
 */
export class PermissionError extends AppError {
  constructor(options: AppErrorOptions) {
    super("FORBIDDEN", 403, "warn", false, options);
  }
}

/**
 * **Never distinguishes "absent" from "another tenant's"** (Rule 1.2).
 * Existence is not disclosed across tenants under any circumstances.
 */
export class NotFoundError extends AppError {
  constructor(options: AppErrorOptions) {
    super("NOT_FOUND", 404, "warn", false, options);
  }
}

/** "This changed while you were working," with a refresh action. */
export class ConflictError extends AppError {
  constructor(options: AppErrorOptions) {
    super("CONFLICT", 409, "warn", false, options);
  }
}

/**
 * Generic forbidden to the user. **Logged at `error` and alerted on — this
 * should be unreachable.**
 *
 * A cross-tenant read that the adapter caught is a sev-1 signal, not a routine
 * denial (`RUNBOOK.md` F-3).
 */
export class TenantScopeError extends AppError {
  constructor(options: AppErrorOptions) {
    super("TENANT_SCOPE", 403, "error", false, options);
  }
}

/**
 * "No rule is on file for &lt;jurisdiction&gt; covering &lt;topic&gt; as of
 * &lt;date&gt;." Blocks the action, names the gap, points at P6.
 *
 * **Never a default** — Rule 3.10 (no jurisdiction profile blocks, never
 * defaults) and Rule 3.4 (a missing input blocks rather than being assumed).
 * Alerted on, because it means reference data is missing, which means a customer
 * is blocked.
 */
export class RuleResolutionError extends AppError {
  constructor(options: AppErrorOptions) {
    super("RULE_UNRESOLVED", 422, "error", false, options);
  }
}

/** Which service, whether it will retry, what still works. */
export class IntegrationError extends AppError {
  constructor(options: AppErrorOptions & { retryable?: boolean }) {
    super("INTEGRATION", 502, "error", options.retryable ?? true, options);
  }
}

/**
 * Blocking, explicit, with a correlation id.
 *
 * **The user gets a blocking error, never a partial success.** No optimistic
 * "generating…" state resolves silently to nothing; the shipment stays in its
 * prior status and the UI says so (`TECHNICAL_SPEC.md` §10.4).
 */
export class DocumentRenderError extends AppError {
  constructor(options: AppErrorOptions) {
    super("DOCUMENT_RENDER", 500, "error", false, options);
  }
}

/**
 * "This document failed its integrity check and will not be served." Alerts
 * immediately.
 *
 * A document whose stored bytes no longer hash to its `content_hash` is not
 * served at all — serving it anyway would defeat the only thing that makes a
 * reprint provable.
 */
export class DocumentIntegrityError extends AppError {
  constructor(options: AppErrorOptions) {
    super("DOCUMENT_INTEGRITY", 500, "error", false, options);
  }
}

/** Generic failure to the user, full detail to logs, alert. */
export class DataIntegrityError extends AppError {
  constructor(options: AppErrorOptions) {
    super("DATA_INTEGRITY", 500, "error", false, options);
  }
}

/**
 * A contract method that exists but has no implementation in this adapter yet.
 *
 * Used by the Supabase adapter, which is written after the prototype settles the
 * screens. **It fails loudly rather than returning an empty result**, because an
 * adapter that quietly answers "nothing here" is indistinguishable from a tenant
 * whose records have gone missing.
 */
export class NotImplementedError extends AppError {
  constructor(options: AppErrorOptions) {
    super("NOT_IMPLEMENTED", 501, "error", false, options);
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
