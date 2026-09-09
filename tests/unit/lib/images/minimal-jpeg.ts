/**
 * A minimal JPEG header for the byte-level tests: SOI, an APP0 (JFIF), an
 * APP1 (EXIF) segment, a start-of-frame stating the given size, then a start
 * of scan and EOI. Enough structure to walk, none of the entropy-coded data a
 * decoder would need. Shared by the dimensions and EXIF tests so both walk the
 * same bytes.
 */
function ascii(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

export function minimalJpeg(options: {
  readonly width: number;
  readonly height: number;
  readonly sof?: number;
}): Uint8Array {
  const sof = options.sof ?? 0xc0;
  const app0 = [
    0xff,
    0xe0,
    0x00,
    0x10,
    ...ascii("JFIF\0"),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
  ];
  const exifBody = [...ascii("Exif\0\0"), 0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8];
  const app1 = [0xff, 0xe1, 0x00, exifBody.length + 2, ...exifBody];
  const frame = [
    0xff,
    sof,
    0x00,
    0x11,
    8,
    (options.height >> 8) & 0xff,
    options.height & 0xff,
    (options.width >> 8) & 0xff,
    options.width & 0xff,
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ];
  const sos = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0xab, 0xcd];
  return new Uint8Array([
    0xff,
    0xd8,
    ...app0,
    ...app1,
    ...frame,
    ...sos,
    0xff,
    0xd9,
  ]);
}
