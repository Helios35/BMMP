import { z } from "zod";

import { RECALL_RECORDING_SOURCES } from "@/domain/recalls/hit";

/**
 * What the recall controls send — every field checked again on the server
 * (`TECHNICAL_SPEC.md` §7.1 step 2). The reason and the reference are
 * required, trimmed, never defaulted (Rules 6.23, 6.24, 10.15).
 */

const recordId = z.string().trim().min(1, "This record could not be found.");
const matchId = z.string().trim().min(1, "This recall could not be found.");

/** A reason long enough to read back later, short enough to fit the row. */
const REASON_MAX = 2000;
const REFERENCE_MAX = 200;
const TITLE_MAX = 300;

export const checkRecallsNowSchema = z.object({ recordId });

export const confirmRecallSchema = z.object({ recordId, matchId });

export const dismissRecallSchema = z.object({
  recordId,
  matchId,
  reason: z
    .string()
    .trim()
    .min(1, "State the reason. It stays on the record beside the recall.")
    .max(REASON_MAX, "Keep the reason under 2,000 characters."),
});

export const recordRecallSchema = z.object({
  recordId,
  source: z.enum(RECALL_RECORDING_SOURCES, {
    error: "Choose where the recall came from.",
  }),
  reference: z
    .string()
    .trim()
    .min(
      1,
      "Enter the notice's reference — a recall is recorded with its source.",
    )
    .max(REFERENCE_MAX, "Keep the reference under 200 characters."),
  title: z
    .string()
    .trim()
    .max(TITLE_MAX, "Keep the title under 300 characters.")
    .transform((value) => (value === "" ? null : value)),
});

export type RecordRecallInput = z.infer<typeof recordRecallSchema>;

/** One issue at a time, on its field — `src/lib/first-issue.ts`. */
export { firstIssue } from "@/lib/first-issue";
