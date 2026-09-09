import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isSupportedImageMimeType,
  readImageDimensions,
  readJpegDimensions,
  readPngDimensions,
  readWebpDimensions,
} from "@/lib/images";

import { minimalJpeg } from "./minimal-jpeg";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");

/** The smallest valid PNG there is: one transparent pixel, 67 bytes. */
const ONE_PIXEL_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function ascii(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function le16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function le24(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

function le32(value: number): number[] {
  return [...le16(value & 0xffff), ...le16((value >>> 16) & 0xffff)];
}

function riff(chunk: string, payload: readonly number[]): Uint8Array {
  const body = [
    ...ascii("WEBP"),
    ...ascii(chunk),
    ...le32(payload.length),
    ...payload,
  ];
  const padded = body.length % 2 === 0 ? body : [...body, 0];
  return new Uint8Array([...ascii("RIFF"), ...le32(padded.length), ...padded]);
}

const WEBP_VP8X = riff("VP8X", [
  0x10,
  0,
  0,
  0,
  ...le24(640 - 1),
  ...le24(480 - 1),
]);
const WEBP_VP8 = riff("VP8 ", [
  0x10,
  0x02,
  0x00, // frame tag
  0x9d,
  0x01,
  0x2a, // start code
  ...le16(320),
  ...le16(200),
  0,
  0,
  0,
  0,
]);
const WEBP_VP8L = riff("VP8L", [
  0x2f,
  ...le32((16 - 1) | ((9 - 1) << 14)),
  0,
  0,
  0,
]);

describe("readPngDimensions", () => {
  it("reads IHDR of a valid 1×1 PNG", () => {
    expect(readPngDimensions(ONE_PIXEL_PNG)).toEqual({ width: 1, height: 1 });
  });

  it("returns null for a truncated header, a wrong signature or a wrong first chunk", () => {
    expect(readPngDimensions(ONE_PIXEL_PNG.subarray(0, 20))).toBeNull();
    const badSignature = new Uint8Array(ONE_PIXEL_PNG);
    badSignature[1] = 0x51;
    expect(readPngDimensions(badSignature)).toBeNull();
    const notIhdr = new Uint8Array(ONE_PIXEL_PNG);
    notIhdr[12] = 0x49;
    notIhdr[13] = 0x44;
    notIhdr[14] = 0x41;
    notIhdr[15] = 0x54;
    expect(readPngDimensions(notIhdr)).toBeNull();
  });

  it("returns null for a zero dimension", () => {
    const zero = new Uint8Array(ONE_PIXEL_PNG);
    zero[19] = 0;
    expect(readPngDimensions(zero)).toBeNull();
  });
});

describe("readJpegDimensions", () => {
  it("walks past APP0 and APP1 to the SOF0 frame", () => {
    expect(
      readJpegDimensions(minimalJpeg({ width: 640, height: 480 })),
    ).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("accepts progressive (SOF2) and extended sequential (SOF1) frames", () => {
    expect(
      readJpegDimensions(minimalJpeg({ width: 1024, height: 768, sof: 0xc2 })),
    ).toEqual({ width: 1024, height: 768 });
    expect(
      readJpegDimensions(minimalJpeg({ width: 300, height: 200, sof: 0xc1 })),
    ).toEqual({ width: 300, height: 200 });
  });

  it("does not mistake a Huffman table (C4) for a frame", () => {
    const dht = [0xff, 0xc4, 0x00, 0x05, 0x00, 0x01, 0x02];
    const bytes = minimalJpeg({ width: 12, height: 34 });
    const withDht = new Uint8Array([
      ...bytes.subarray(0, 2),
      ...dht,
      ...bytes.subarray(2),
    ]);
    expect(readJpegDimensions(withDht)).toEqual({ width: 12, height: 34 });
  });

  it("returns null when there is no frame before the scan, or the bytes are not a JPEG", () => {
    expect(
      readJpegDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])),
    ).toBeNull();
    expect(
      readJpegDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
    ).toBeNull();
    expect(readJpegDimensions(ONE_PIXEL_PNG)).toBeNull();
    expect(readJpegDimensions(new Uint8Array(0))).toBeNull();
  });

  it("returns null on a segment that runs past the end of the file", () => {
    const bytes = minimalJpeg({ width: 640, height: 480 }).subarray(0, 12);
    expect(readJpegDimensions(bytes)).toBeNull();
  });
});

describe("readWebpDimensions", () => {
  it("reads the canvas size from a VP8X header", () => {
    expect(readWebpDimensions(WEBP_VP8X)).toEqual({ width: 640, height: 480 });
  });

  it("reads the frame size from a lossy VP8 bitstream", () => {
    expect(readWebpDimensions(WEBP_VP8)).toEqual({ width: 320, height: 200 });
  });

  it("reads the packed size from a lossless VP8L bitstream", () => {
    expect(readWebpDimensions(WEBP_VP8L)).toEqual({ width: 16, height: 9 });
  });

  it("returns null for a bad start code, an unknown chunk or a non-RIFF file", () => {
    const badStart = new Uint8Array(WEBP_VP8);
    badStart[23] = 0x00;
    expect(readWebpDimensions(badStart)).toBeNull();
    expect(readWebpDimensions(riff("ALPH", new Array(12).fill(0)))).toBeNull();
    expect(readWebpDimensions(ONE_PIXEL_PNG)).toBeNull();
  });
});

describe("readImageDimensions", () => {
  it("dispatches on the declared type and refuses bytes that disagree with it", () => {
    expect(readImageDimensions(ONE_PIXEL_PNG, "image/png")).toEqual({
      width: 1,
      height: 1,
    });
    expect(readImageDimensions(ONE_PIXEL_PNG, "image/jpeg")).toBeNull();
    expect(readImageDimensions(ONE_PIXEL_PNG, "image/webp")).toBeNull();
    expect(readImageDimensions(WEBP_VP8X, "image/webp")).toEqual({
      width: 640,
      height: 480,
    });
    expect(
      readImageDimensions(minimalJpeg({ width: 2, height: 3 }), "image/jpeg"),
    ).toEqual({
      width: 2,
      height: 3,
    });
  });

  it("returns null for a type it does not support", () => {
    expect(readImageDimensions(ONE_PIXEL_PNG, "image/gif")).toBeNull();
    expect(readImageDimensions(ONE_PIXEL_PNG, "application/pdf")).toBeNull();
    expect(isSupportedImageMimeType("image/gif")).toBe(false);
    expect(isSupportedImageMimeType("image/png")).toBe(true);
  });
});

describe("the generated intake fixture images", () => {
  const names = [
    "label-clean.png",
    "label-low.png",
    "label-nomatch.png",
    "label-unreadable.png",
    "label-fail.png",
    "label-manualcrop.png",
    "label-scooter.png",
    "whole-pack.png",
    "damage.png",
  ];

  it.each(names)(
    "%s is a 640×480 PNG under 20 KB, identical in public/ and tests/e2e/",
    async (name) => {
      const published = new Uint8Array(
        await readFile(join(repoRoot, "public", "fixtures", "intake", name)),
      );
      const forSpecs = new Uint8Array(
        await readFile(
          join(repoRoot, "tests", "e2e", "fixtures", "intake", name),
        ),
      );
      expect(readImageDimensions(published, "image/png")).toEqual({
        width: 640,
        height: 480,
      });
      expect(published.length).toBeLessThan(20 * 1024);
      expect(Buffer.compare(published, forSpecs)).toBe(0);
    },
  );

  it("no two fixture images share bytes — the upload route refuses a duplicate hash", async () => {
    const digests = new Set<string>();
    for (const name of names) {
      const bytes = await readFile(
        join(repoRoot, "public", "fixtures", "intake", name),
      );
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      digests.add(Buffer.from(digest).toString("hex"));
    }
    expect(digests.size).toBe(names.length);
  });
});
