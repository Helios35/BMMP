import type { JsonValue, Sha256 } from "@/types/common";

/**
 * A render's input snapshot, as the bytes it is hashed from — `ERD.md` §7.5;
 * `TECHNICAL_SPEC.md` §8.4.
 *
 * `input_snapshot_hash` is the SHA-256 of {@link canonicalJson} of the
 * snapshot, computed **before** rendering, and the verification code printed
 * in the footer is its first {@link VERIFICATION_CODE_LENGTH} characters. The
 * content hash cannot be printed on the page — it would be the hash of a page
 * that contains it — so the code is cut from the input instead.
 *
 * **Canonical means one spelling per value**: object keys sorted at every
 * depth, no whitespace. Two snapshots that hold the same values hash the same
 * however their objects were assembled, and a stored `jsonb` read back in a
 * different key order still verifies.
 */

export const VERIFICATION_CODE_LENGTH = 12;

export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => {
        const entry = (value as { readonly [key: string]: JsonValue })[key];
        return `${JSON.stringify(key)}:${canonicalJson(entry ?? null)}`;
      })
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The code printed in a document's footer — the first twelve characters of its snapshot hash. */
export function verificationCodeOf(inputSnapshotHash: Sha256): string {
  return inputSnapshotHash.slice(0, VERIFICATION_CODE_LENGTH);
}

/**
 * A code as a person typed it from paper: spaces and case are not theirs to
 * get right. **Nothing else is forgiven** — one wrong character is a
 * different code.
 */
export function readTypedVerificationCode(typed: string): string {
  return typed.replace(/\s+/g, "").toLowerCase();
}

export function verificationCodeMatches(
  typed: string,
  verificationCode: string,
): boolean {
  const read = readTypedVerificationCode(typed);
  return read.length > 0 && read === verificationCode.toLowerCase();
}
