import { describe, expect, it } from "vitest";
import {
  extractJpegCaptureTime,
  readJpegDimensions,
  stripJpegExif,
} from "@/lib/images";

import { minimalJpeg } from "./minimal-jpeg";

/**
 * Rule 7.21: GPS and device identifiers are not retained. The strip runs
 * before the hash, so what is hashed is what is kept.
 */
function findSegments(bytes: Uint8Array): number[] {
  const markers: number[] = [];
  let offset = 2;
  while (offset + 1 < bytes.length) {
    const marker = bytes[offset + 1]!;
    markers.push(marker);
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
    offset += 2 + length;
  }
  return markers;
}

describe("stripJpegExif", () => {
  it("removes the APP1 segment and keeps every other segment in order", () => {
    const original = minimalJpeg({ width: 640, height: 480 });
    expect(findSegments(original)).toEqual([0xe0, 0xe1, 0xc0, 0xda]);

    const stripped = stripJpegExif(original);
    expect(findSegments(stripped)).toEqual([0xe0, 0xc0, 0xda]);
    expect(stripped.length).toBeLessThan(original.length);
    expect(stripped[0]).toBe(0xff);
    expect(stripped[1]).toBe(0xd8);
    expect(stripped[stripped.length - 1]).toBe(0xd9);
  });

  it("leaves the frame readable, so dimensions after the strip equal those before", () => {
    const original = minimalJpeg({ width: 1200, height: 900 });
    expect(readJpegDimensions(stripJpegExif(original))).toEqual(
      readJpegDimensions(original),
    );
  });

  it("copies everything from the start of scan onward verbatim", () => {
    const original = minimalJpeg({ width: 8, height: 8 });
    const stripped = stripJpegExif(original);
    const sosAt = (bytes: Uint8Array) =>
      bytes.findIndex((byte, i) => byte === 0xff && bytes[i + 1] === 0xda);
    expect(
      Buffer.compare(
        original.subarray(sosAt(original)),
        stripped.subarray(sosAt(stripped)),
      ),
    ).toBe(0);
  });

  it("removes every APP1 segment when there are several (EXIF and XMP)", () => {
    const base = minimalJpeg({ width: 10, height: 10 });
    const xmp = [0xff, 0xe1, 0x00, 0x06, 0x78, 0x6d, 0x70, 0x00];
    const doubled = new Uint8Array([
      ...base.subarray(0, 2),
      ...xmp,
      ...base.subarray(2),
    ]);
    expect(findSegments(doubled).filter((m) => m === 0xe1)).toHaveLength(2);
    expect(findSegments(stripJpegExif(doubled))).not.toContain(0xe1);
  });

  it("returns a new array for a JPEG even when it has no APP1", () => {
    const already = stripJpegExif(minimalJpeg({ width: 4, height: 4 }));
    const again = stripJpegExif(already);
    expect(again).not.toBe(already);
    expect(Buffer.compare(again, already)).toBe(0);
  });

  it("returns non-JPEG input as the same array, unchanged", () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
    ]);
    expect(stripJpegExif(png)).toBe(png);
    const empty = new Uint8Array(0);
    expect(stripJpegExif(empty)).toBe(empty);
  });

  it("stops parsing at a segment that overruns the file and keeps the rest as-is", () => {
    const truncated = minimalJpeg({ width: 640, height: 480 }).subarray(0, 25);
    const stripped = stripJpegExif(truncated);
    // APP0 (18 bytes) is intact and kept; the APP1 that follows is cut short,
    // so its bytes are carried over rather than dropped.
    expect(stripped.length).toBe(truncated.length);
    expect(Buffer.compare(stripped, truncated)).toBe(0);
    expect(stripped).not.toBe(truncated);
  });

  it("does not disturb restart markers or fill bytes", () => {
    const base = minimalJpeg({ width: 5, height: 5 });
    const withRst = new Uint8Array([
      ...base.subarray(0, 2),
      0xff,
      0xff,
      0xd0, // fill byte then RST0
      ...base.subarray(2),
    ]);
    const stripped = stripJpegExif(withRst);
    expect(Array.from(stripped.subarray(0, 5))).toEqual([
      0xff, 0xd8, 0xff, 0xff, 0xd0,
    ]);
    expect(
      findSegments(new Uint8Array([0xff, 0xd8, ...stripped.subarray(5)])),
    ).toEqual([0xe0, 0xc0, 0xda]);
  });
});

describe("extractJpegCaptureTime", () => {
  it("returns null in B1a for every input — the capture time falls back to the upload instant", () => {
    expect(
      extractJpegCaptureTime(minimalJpeg({ width: 640, height: 480 })),
    ).toBeNull();
    expect(extractJpegCaptureTime(new Uint8Array(0))).toBeNull();
  });
});
