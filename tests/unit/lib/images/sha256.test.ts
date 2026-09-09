import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/images";

/** FIPS 180-4 test vectors. The hash is what makes a stored photo provable. */
describe("sha256Hex", () => {
  it("hashes the empty input to the well-known digest", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it('hashes "abc" to the well-known digest, lowercase hex, 64 characters', async () => {
    const digest = await sha256Hex(new TextEncoder().encode("abc"));
    expect(digest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes a view into a larger buffer by the view's bytes only", async () => {
    const backing = new TextEncoder().encode("xxabcxx");
    const view = backing.subarray(2, 5);
    expect(await sha256Hex(view)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic and sensitive to a single bit", async () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 5]);
    expect(await sha256Hex(a)).toBe(await sha256Hex(new Uint8Array(a)));
    expect(await sha256Hex(a)).not.toBe(await sha256Hex(b));
  });
});
