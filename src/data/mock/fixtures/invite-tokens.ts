/**
 * Plaintext invitation tokens for the fixtures.
 *
 * **The token itself is never stored.** `membership.invite_token_hash` holds
 * SHA-256 of it (`ERD.md` §3.3), which is why these live here rather than in
 * `./index.ts`: they are the input to a hash, not a column value. They exist so
 * `/invite/[token]` is reachable at all in development and in Playwright.
 *
 * A real token is 32 random bytes. These are readable instead, deliberately —
 * a developer types one into the address bar, and a random 64-character string
 * would be retyped wrong every time. The security property that matters is
 * unchanged, because **the fixture set is fake data behind a boot guard that
 * refuses `DATA_ADAPTER=mock` in production** (§5.1.1, D-16).
 *
 * `tests/unit/invite-token.test.ts` asserts each value hashes to the digest its
 * fixture stores, so the two cannot drift apart silently.
 */

export const INVITE_TOKENS = {
  /** `MEMBERSHIP.pendingInvite` — state `valid`. */
  pendingHandler: "inv-pending-handler-7c1f4a9d20b6e358",
  /** `MEMBERSHIP.expiredInvite` — state `expired`. */
  expiredManager: "inv-expired-manager-2d8b60f145ae9c73",
  /** `MEMBERSHIP.revokedInvite` — state `revoked`. */
  revokedAuditor: "inv-revoked-auditor-91e07b3c6da248f5",
  /** `MEMBERSHIP.danaCascade` — state `used`; the membership was accepted long ago. */
  usedHandler: "inv-used-handler-4a6d2f81b09c53e7",
} as const;

/**
 * SHA-256 of each token above, as stored in `membership.invite_token_hash`.
 *
 * Written as literals rather than computed at module load, because a fixture
 * that computes its own expected value proves nothing: the test that pairs the
 * two would pass against any hash function, including a broken one.
 */
export const INVITE_TOKEN_HASHES = {
  pendingHandler:
    "4379bd0383372c3408870e053e1f33fa3558be4136e31e7d2c9a512a78aec8a2",
  expiredManager:
    "a2179a0587e9d3f324282023dac0679b52f418d27dcb918f877decfe6557b564",
  revokedAuditor:
    "e497c06ccf8841eaef0170a0728830b5f659b219b8411728f059f404b7d9f2e1",
  usedHandler:
    "5dce9fd94ca3a39939a02df9733436d2393ce1d86caaa22ac996fdcb07adcfcc",
} as const;
