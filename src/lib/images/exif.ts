import type { IsoTimestamp } from "@/types/common";

/**
 * EXIF handling for uploaded JPEGs — Rule 7.21, `TECHNICAL_SPEC.md` §11.1 step 1.
 *
 * GPS coordinates and device identifiers are customer data the product has no
 * reason to hold, so they are removed **before** the bytes are hashed and
 * stored: the `content_hash` on `intake_photo` is the hash of what is kept.
 * PNG and WebP carry no APP1 segment and pass through untouched — the route
 * still records `is_exif_stripped` for them, because "nothing to strip" is the
 * same fact as "stripped" for the purpose of the rule.
 */

const SOI = [0xff, 0xd8] as const;
const APP1 = 0xe1;
const SOS = 0xda;
const EOI = 0xd9;

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === SOI[0] && bytes[1] === SOI[1];
}

/** Markers with no length field: restart markers, start of image and TEM. */
function isStandaloneMarker(marker: number): boolean {
  return (marker >= 0xd0 && marker <= 0xd8) || marker === 0x01;
}

/**
 * Remove every APP1 (`FF E1`) segment from a JPEG and return the remaining
 * bytes as a **new** array. Anything that is not a JPEG is returned as the
 * same array, unchanged.
 *
 * APP1 is where EXIF lives, and where XMP lives too — both can carry location
 * and device identifiers, so both go. Every other segment (JFIF in APP0, ICC
 * profiles in APP2, quantisation and Huffman tables, the frame and the scan) is
 * copied verbatim, so the image decodes exactly as it did. Once the start of
 * scan is reached the rest of the file is entropy-coded data and is copied to
 * the end without further parsing.
 *
 * A segment whose declared length runs past the end of the file is not a
 * segment; from that point the bytes are copied as-is rather than dropped, so
 * a truncated upload loses nothing more than it had already lost.
 */
export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (!isJpeg(bytes)) return bytes;

  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1]!;

    if (marker === 0xff) {
      kept.push(bytes.subarray(offset, offset + 1));
      offset += 1;
      continue;
    }
    if (isStandaloneMarker(marker)) {
      kept.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (marker === SOS || marker === EOI) break;

    if (offset + 4 > bytes.length) break;
    const length = (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) break;

    if (marker !== APP1) kept.push(bytes.subarray(offset, end));
    offset = end;
  }

  kept.push(bytes.subarray(offset));

  const total = kept.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let position = 0;
  for (const part of kept) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

/**
 * The capture instant a JPEG's EXIF records — **not read in B1a.**
 *
 * A full EXIF parser (TIFF header, byte order, IFD walk, the `DateTimeOriginal`
 * tag, its offset-less local time and the separate sub-second and time-zone
 * tags) is not built in this unit. This returns `null` for every input, and
 * `intake_photo.captured_at` falls back to the upload instant at the route.
 * That is an honest fact about the upload, not a guess about the exposure;
 * the two differ by however long the phone held the photo before the network
 * came back, which the storage clock (Rule 4.4) never reads. Recorded in the
 * unit's build-notes as an open item.
 */
export function extractJpegCaptureTime(bytes: Uint8Array): IsoTimestamp | null {
  void bytes;
  return null;
}
