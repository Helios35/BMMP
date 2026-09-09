/**
 * Byte-level image helpers for the intake upload route — hash, dimensions and
 * EXIF, read from the bytes and nothing else.
 *
 * No image library. B1a stores what was uploaded, at the size it was uploaded;
 * the downscale and the deterministic crop `TECHNICAL_SPEC.md` §11.1 describes
 * arrive with the real object store, and nothing here will need to change when
 * they do.
 */
export { sha256Hex } from "./sha256";
export {
  SUPPORTED_IMAGE_MIME_TYPES,
  isSupportedImageMimeType,
  readImageDimensions,
  readJpegDimensions,
  readPngDimensions,
  readWebpDimensions,
  type ImageDimensions,
  type ImageMimeType,
} from "./dimensions";
export { extractJpegCaptureTime, stripJpegExif } from "./exif";
