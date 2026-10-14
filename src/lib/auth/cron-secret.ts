import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The `CRON_SECRET` bearer on `POST /api/jobs/*` — `TECHNICAL_SPEC.md` §7.2.
 *
 * Three answers, and **unset is not open**: a job route with no secret
 * configured refuses everyone (`503`) rather than running for anyone, because
 * a deployment that forgot the variable must not become a deployment anyone
 * can drive. A wrong or missing bearer is `401`.
 *
 * The comparison is constant-time over SHA-256 digests, so neither the
 * secret's length nor how much of it matched leaks through timing.
 */
export type CronAuthorization = "unconfigured" | "refused" | "authorized";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function authorizeCron(
  authorizationHeader: string | null,
  secret: string | undefined = process.env.CRON_SECRET,
): CronAuthorization {
  const configured = secret?.trim() ?? "";
  if (configured === "") return "unconfigured";
  const presented = authorizationHeader ?? "";
  return timingSafeEqual(digest(presented), digest(`Bearer ${configured}`))
    ? "authorized"
    : "refused";
}
