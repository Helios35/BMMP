/**
 * SHA-256 of a byte array as lowercase hex — the `content_hash` every
 * `intake_photo` and `document_render` carries.
 *
 * Web Crypto rather than `node:crypto`, so the same function runs in a Route
 * Handler, an edge runtime and a test without a conditional import. The hash is
 * what makes a stored photo provable later: bytes that no longer hash to their
 * row's `content_hash` are not the photo the record was made from.
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
