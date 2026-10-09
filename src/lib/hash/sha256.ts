/**
 * SHA-256 as lowercase hex — the `content_hash` every `intake_photo` and
 * `document_render` carries, and the `input_snapshot_hash` a render's
 * verification code is cut from (`ERD.md` §7.5).
 *
 * Web Crypto rather than `node:crypto`, so the same function runs in a Route
 * Handler, an edge runtime and a test without a conditional import. The hash is
 * what makes stored bytes provable later: bytes that no longer hash to their
 * row's `content_hash` are not the photo or the document the row describes.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // A Uint8Array over a SharedArrayBuffer is not a BufferSource; copying into a
  // plain ArrayBuffer is cheap and keeps the call well-typed.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** The SHA-256 of a string's UTF-8 bytes — how a canonical snapshot is hashed. */
export async function sha256HexOfText(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}
