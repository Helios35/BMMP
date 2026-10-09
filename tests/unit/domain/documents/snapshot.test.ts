import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  readTypedVerificationCode,
  VERIFICATION_CODE_LENGTH,
  verificationCodeMatches,
  verificationCodeOf,
} from "@/domain/documents/snapshot";

/**
 * The snapshot a verification code is cut from — `TECHNICAL_SPEC.md` §8.4,
 * `ERD.md` §7.5. One spelling per value, so a stored `jsonb` read back in any
 * key order still verifies; and a code a person types from paper matches
 * exactly or not at all.
 */

describe("canonicalJson", () => {
  it("spells the same values the same way, whatever order the keys were built in", () => {
    const a = { b: 1, a: { d: [3, { y: 1, x: 2 }], c: null }, e: "é" };
    const b = { e: "é", a: { c: null, d: [3, { x: 2, y: 1 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe(
      '{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1,"e":"é"}',
    );
  });

  it("keeps array order — a reordered list is a different snapshot", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("distinguishes a value from its absence", () => {
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
  });
});

describe("verification codes", () => {
  const hash =
    "a1c9f4e7b23d508691f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4";

  it("is the first twelve characters of the snapshot hash", () => {
    expect(VERIFICATION_CODE_LENGTH).toBe(12);
    expect(verificationCodeOf(hash)).toBe("a1c9f4e7b23d");
  });

  it("forgives spaces and case, as a person reads a code off paper", () => {
    expect(readTypedVerificationCode(" A1C9 F4E7 B23D ")).toBe("a1c9f4e7b23d");
    expect(verificationCodeMatches(" A1C9 F4E7 B23D ", "a1c9f4e7b23d")).toBe(
      true,
    );
  });

  it("forgives nothing else — one changed character is no match", () => {
    expect(verificationCodeMatches("a1c9f4e7b23e", "a1c9f4e7b23d")).toBe(false);
    expect(verificationCodeMatches("a1c9f4e7b23", "a1c9f4e7b23d")).toBe(false);
    expect(verificationCodeMatches("", "a1c9f4e7b23d")).toBe(false);
  });
});
