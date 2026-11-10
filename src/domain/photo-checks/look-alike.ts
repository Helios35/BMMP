import type { Uuid } from "@/types/common";

/**
 * The copy check — Rule 2.37; D-56 level 2, D-63 #5, D-75 #7, #8; T-52
 * `photo_looks_reused`.
 *
 * **A re-saved, cropped or edited copy of a photo on another battery record
 * in the organization is a reason to look, never a verdict.** Every intake
 * photo gets a look-alike fingerprint when it is stored, beside its content
 * hash; two fingerprints that are close send the record to review naming the
 * other record. **How close counts is platform configuration** (D-40), read
 * through `src/data` and handed in — no closeness lives in this file, and **no
 * distance or number is stored, shown or exported**: the result is a list of
 * photos and records, nothing more.
 *
 * The exclusions are the exact check's (`duplicate-photo.ts`, D-63 #5): the
 * same session, a crop on either side, a session with no record, and the
 * subject's own record. Two more are this check's own:
 *
 * - **an exact copy is not also a look-alike** — the same bytes are reported
 *   once, as `duplicate_photo` (Rule 2.37);
 * - **a photo with no fingerprint is not compared** (Rule 2.37), and neither
 *   is a fingerprint of another scheme than the configuration's, because a
 *   closeness stated for one fingerprint function says nothing about another.
 *
 * It carries no "AI suggested" tag: a fingerprint is a fixed function of the
 * image, not a model's judgment (D-75 #8).
 *
 * Pure.
 */

/** `<scheme>:<hex>` — the shape `VisionProvider.fingerprintPhoto` returns. */
const FINGERPRINT_PATTERN = /^([a-z0-9-]+):([0-9a-f]+)$/;

export interface LookAlikeConfiguration {
  /** Stamped on every copy check run, so a match can be re-explained after it changes (Rule 12.15). */
  readonly configurationVersion: string;
  /** The fingerprint function this closeness is stated for. */
  readonly fingerprintScheme: string;
  /** Two fingerprints of the scheme that differ in at most this many bits look alike. */
  readonly maxDifferingBits: number;
}

export type LookAlikeConfigurationValidation =
  | { readonly ok: true; readonly configuration: LookAlikeConfiguration }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * A missing or malformed row is a loud failure, never a permissive default:
 * a closeness that defaulted to zero would quietly turn the check into the
 * exact check, and one that defaulted high would send every record to review.
 */
export function validateLookAlikeConfiguration(
  value: unknown,
): LookAlikeConfigurationValidation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, issues: ["configuration is not an object"] };
  }
  const row = value as Record<string, unknown>;
  const issues: string[] = [];
  const version = row.configurationVersion;
  if (typeof version !== "string" || version.trim() === "") {
    issues.push("configurationVersion must be a non-empty string");
  }
  const scheme = row.fingerprintScheme;
  if (typeof scheme !== "string" || !/^[a-z0-9-]+$/.test(scheme)) {
    issues.push("fingerprintScheme must be a lower-case scheme name");
  }
  const bits = row.maxDifferingBits;
  if (typeof bits !== "number" || !Number.isInteger(bits) || bits < 0) {
    issues.push("maxDifferingBits must be a whole number, zero or more");
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    configuration: {
      configurationVersion: version as string,
      fingerprintScheme: scheme as string,
      maxDifferingBits: bits as number,
    },
  };
}

interface ParsedFingerprint {
  readonly scheme: string;
  readonly hex: string;
}

function parseFingerprint(value: string): ParsedFingerprint | null {
  const match = FINGERPRINT_PATTERN.exec(value);
  if (match === null) return null;
  const [, scheme, hex] = match;
  if (scheme === undefined || hex === undefined) return null;
  return { scheme, hex };
}

/** Whether a stored string is a fingerprint this check can read. */
export function isLookFingerprint(value: string): boolean {
  return parseFingerprint(value) !== null;
}

function differingBits(a: string, b: string): number {
  let bits = 0;
  for (let index = 0; index < a.length; index += 1) {
    let x = parseInt(a[index] as string, 16) ^ parseInt(b[index] as string, 16);
    while (x !== 0) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

/**
 * Whether two fingerprints look alike under the configuration. Both must be of
 * the configuration's scheme and the same length; anything else is not
 * compared and so never looks alike. The count of differing bits is computed
 * here and goes nowhere — this returns a boolean.
 */
export function fingerprintsLookAlike(
  a: string,
  b: string,
  configuration: LookAlikeConfiguration,
): boolean {
  const left = parseFingerprint(a);
  const right = parseFingerprint(b);
  if (left === null || right === null) return false;
  if (
    left.scheme !== configuration.fingerprintScheme ||
    right.scheme !== configuration.fingerprintScheme
  ) {
    return false;
  }
  if (left.hex.length !== right.hex.length) return false;
  return differingBits(left.hex, right.hex) <= configuration.maxDifferingBits;
}

export interface LookAlikePhoto {
  readonly photoId: Uuid;
  readonly intakeSessionId: Uuid;
  /** The session's battery record. `null` for a session that never had one. */
  readonly batteryRecordId: Uuid | null;
  readonly contentHash: string;
  /** `null` — or absent on a row stored before fingerprints — is not compared. */
  readonly lookFingerprint: string | null;
  /** Non-null `parentIntakePhotoId`. */
  readonly isCrop: boolean;
}

export interface LookAlikeSubject {
  readonly intakeSessionId: Uuid;
  readonly batteryRecordId: Uuid | null;
  /** The session's own photos. Crops among them are ignored. */
  readonly photos: readonly LookAlikePhoto[];
}

export interface LookAlikeMatch {
  /** The subject's photo that looks like a copy. */
  readonly photoId: Uuid;
  /** The other records' photos it looks like, in a stable order. */
  readonly matchedPhotoIds: readonly Uuid[];
  /** Every other record carrying one, in a stable order. */
  readonly batteryRecordIds: readonly Uuid[];
}

/**
 * The subject's photos that look like a copy of a photo on another record,
 * each with the photos and records it looks like. Empty means none found.
 *
 * `candidates` is every photo in the organization the caller read as worth
 * comparing; the subject's own rows may be among them and are excluded here.
 */
export function findLookAlikePhotos(
  subject: LookAlikeSubject,
  candidates: readonly LookAlikePhoto[],
  configuration: LookAlikeConfiguration,
): readonly LookAlikeMatch[] {
  const matches: LookAlikeMatch[] = [];
  for (const photo of subject.photos) {
    if (photo.isCrop || photo.lookFingerprint === null) continue;
    const matchedPhotoIds = new Set<Uuid>();
    const records = new Set<Uuid>();
    for (const candidate of candidates) {
      if (candidate.isCrop || candidate.lookFingerprint === null) continue;
      if (candidate.intakeSessionId === subject.intakeSessionId) continue;
      if (candidate.batteryRecordId === null) continue;
      if (candidate.batteryRecordId === subject.batteryRecordId) continue;
      // An exact copy is the exact check's, reported once (Rule 2.37).
      if (candidate.contentHash === photo.contentHash) continue;
      if (
        !fingerprintsLookAlike(
          photo.lookFingerprint,
          candidate.lookFingerprint,
          configuration,
        )
      ) {
        continue;
      }
      matchedPhotoIds.add(candidate.photoId);
      records.add(candidate.batteryRecordId);
    }
    if (records.size > 0) {
      matches.push({
        photoId: photo.photoId,
        matchedPhotoIds: [...matchedPhotoIds].sort(),
        batteryRecordIds: [...records].sort(),
      });
    }
  }
  return matches;
}

/** Every distinct record the matches point at, in a stable order. */
export function lookAlikeRecordIds(
  matches: readonly LookAlikeMatch[],
): readonly Uuid[] {
  return [
    ...new Set(matches.flatMap((match) => match.batteryRecordIds)),
  ].sort();
}
