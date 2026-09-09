/**
 * Pixel dimensions from the bytes of a PNG, JPEG or WebP, read from the
 * container headers alone — no decoder, no image library, no pixel is touched.
 *
 * `intake_photo.width_px` and `height_px` are stored facts about the bytes on
 * disk, so they are read from the bytes and never trusted from a form field or
 * a browser. Every reader here returns `null` rather than a guess when the
 * header is not where the format says it is: an upload whose dimensions cannot
 * be read is refused at the route, never stored with a made-up size.
 */

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export function isSupportedImageMimeType(
  value: string,
): value is ImageMimeType {
  return (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

function readUint32BE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 4 > bytes.length) return null;
  return (
    ((bytes[offset]! << 24) >>> 0) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function readUint16BE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 2 > bytes.length) return null;
  return (bytes[offset]! << 8) + bytes[offset + 1]!;
}

function readUint16LE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 2 > bytes.length) return null;
  return bytes[offset]! + (bytes[offset + 1]! << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 3 > bytes.length) return null;
  return (
    bytes[offset]! + (bytes[offset + 1]! << 8) + (bytes[offset + 2]! << 16)
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 4 > bytes.length) return null;
  return (
    bytes[offset]! +
    (bytes[offset + 1]! << 8) +
    (bytes[offset + 2]! << 16) +
    bytes[offset + 3]! * 0x1000000
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset + length > bytes.length) return "";
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function positive(
  width: number | null,
  height: number | null,
): ImageDimensions | null {
  if (width === null || height === null) return null;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

// --- PNG ------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** The first chunk of a PNG is IHDR by specification; width and height open it. */
export function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) return null;
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null;
  if (ascii(bytes, 12, 4) !== "IHDR") return null;
  return positive(readUint32BE(bytes, 16), readUint32BE(bytes, 20));
}

// --- JPEG -----------------------------------------------------------------------

/**
 * Start-of-frame markers, every one of which carries the frame's dimensions at
 * the same offsets. `C4` (Huffman table), `C8` (reserved) and `CC` (arithmetic
 * table) sit in the same range and are not frames.
 */
function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
  );
}

/** Markers with no length field: restart markers, start of image and TEM. */
function isStandaloneMarker(marker: number): boolean {
  return (marker >= 0xd0 && marker <= 0xd8) || marker === 0x01;
}

/**
 * Walk the segments from SOI until a start-of-frame segment. Stops at the
 * start of scan (`DA`) or end of image (`D9`), because a frame header always
 * precedes the scan; a file without one has no readable size.
 */
export function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    // Fill bytes: any number of FF may pad a marker.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (isStandaloneMarker(marker)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;

    const length = readUint16BE(bytes, offset + 2);
    if (length === null || length < 2) return null;

    if (isStartOfFrame(marker)) {
      // length(2) precision(1) height(2) width(2)
      return positive(
        readUint16BE(bytes, offset + 7),
        readUint16BE(bytes, offset + 5),
      );
    }
    offset += 2 + length;
  }
  return null;
}

// --- WebP -----------------------------------------------------------------------

/**
 * RIFF container; the first chunk after `WEBP` says which of the three
 * bitstreams it is, and each states its size differently.
 */
export function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  // The RIFF header and the first chunk's fourcc; each bitstream's own reads
  // below are bounds-checked and answer null on their own when short.
  if (bytes.length < 16) return null;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP")
    return null;

  const chunk = ascii(bytes, 12, 4);
  const payload = 20;

  if (chunk === "VP8 ") {
    // Lossy: a 3-byte frame tag, the start code 9D 01 2A, then 14-bit width and height.
    if (
      bytes[payload + 3] !== 0x9d ||
      bytes[payload + 4] !== 0x01 ||
      bytes[payload + 5] !== 0x2a
    )
      return null;
    const width = readUint16LE(bytes, payload + 6);
    const height = readUint16LE(bytes, payload + 8);
    return positive(
      width === null ? null : width & 0x3fff,
      height === null ? null : height & 0x3fff,
    );
  }

  if (chunk === "VP8L") {
    // Lossless: signature 2F, then 14 bits width-1 and 14 bits height-1.
    if (bytes[payload] !== 0x2f) return null;
    const bits = readUint32LE(bytes, payload + 1);
    if (bits === null) return null;
    return positive((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }

  if (chunk === "VP8X") {
    // Extended: flags(4), then 24-bit canvas width-1 and height-1.
    const width = readUint24LE(bytes, payload + 4);
    const height = readUint24LE(bytes, payload + 7);
    return positive(
      width === null ? null : width + 1,
      height === null ? null : height + 1,
    );
  }

  return null;
}

/**
 * Dimensions by declared type. The declared type has to agree with the bytes:
 * a PNG uploaded as `image/jpeg` reads as nothing, which the route turns into
 * a refusal, rather than as whatever the wrong parser happened to find.
 */
export function readImageDimensions(
  bytes: Uint8Array,
  mimeType: string,
): ImageDimensions | null {
  switch (mimeType) {
    case "image/png":
      return readPngDimensions(bytes);
    case "image/jpeg":
      return readJpegDimensions(bytes);
    case "image/webp":
      return readWebpDimensions(bytes);
    default:
      return null;
  }
}
