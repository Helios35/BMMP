/**
 * The job secret the e2e server is started with (`playwright.config.ts`) and
 * `jobs.spec.ts` presents. A test value for a server this suite builds and
 * owns — never a deployment's.
 */
export const E2E_CRON_SECRET = "e2e-cron-secret-not-a-real-secret";
