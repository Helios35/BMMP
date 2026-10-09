import type { IsoTimestamp, Sha256, Uuid } from "@/types/common";

/**
 * What `GET /api/documents/[id]/verify` answers — `TECHNICAL_SPEC.md` §8.4's
 * proof fields, the two re-hash comparisons, the render's status, and, when a
 * code was typed, whether it is this render's. Shared by the route and the
 * viewer that asks it.
 */
export interface DocumentVerificationResponse {
  readonly id: Uuid;
  readonly documentType: string;
  readonly status: string;
  readonly contentHash: Sha256;
  readonly byteSize: number;
  readonly renderedAt: IsoTimestamp;
  readonly inputSnapshotHash: Sha256;
  readonly verificationCode: string;
  readonly supersededByDocumentRenderId: Uuid | null;
  readonly bytesMatch: boolean;
  readonly inputSnapshotMatches: boolean;
  /** Null when no `?code=` was asked about. */
  readonly codeMatches: boolean | null;
  readonly verifiedAt: IsoTimestamp;
}

/** The two route paths, built in one place for the viewer and the tests. */
export function documentPdfPath(
  documentRenderId: Uuid,
  mode: "view" | "reprint" | "download" = "view",
): string {
  const base = `/api/documents/${documentRenderId}/pdf`;
  if (mode === "reprint") return `${base}?reprint=1`;
  if (mode === "download") return `${base}?download=1`;
  return base;
}

export function documentVerifyPath(
  documentRenderId: Uuid,
  typedCode?: string,
): string {
  const base = `/api/documents/${documentRenderId}/verify`;
  return typedCode === undefined
    ? base
    : `${base}?code=${encodeURIComponent(typedCode)}`;
}
