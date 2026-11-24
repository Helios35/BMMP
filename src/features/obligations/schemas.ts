import { z } from "zod";

/**
 * The obligations actions' inputs — `UX_SPEC.md` §3.21; Rules 8.6, 8.12.
 * Shapes only: whether the role may act, whether the entry is published and
 * whether the deadline is open are the adapter's to refuse.
 */

const ID = z.uuid({ error: "That record could not be identified." });

const STATES = z
  .array(ID, { error: "Choose the states it is sold in." })
  .min(1, { error: "Choose at least one state it is sold in." });

export const addProductSchema = z.object({
  catalogEntryId: z.uuid({ error: "Choose a catalog entry." }),
  jurisdictionIds: STATES,
});

export const changeStatesSchema = z.object({
  productId: ID,
  jurisdictionIds: STATES,
});

export const removeProductSchema = z.object({
  productId: ID,
  reason: z.string().trim().min(1, { error: "Say why it is removed." }),
});

export const markDoneSchema = z.object({
  deadlineId: ID,
  completedOn: z.iso.date({ error: "Give the date it was met." }),
  note: z
    .string()
    .trim()
    .min(1, { error: "Say what was done — the note is required." }),
  reference: z.string().trim().max(200).optional(),
  /** Rule 8.19 — an issued packet of this deadline, linked as evidence. Optional. */
  evidenceDocumentRenderId: z
    .uuid({ error: "That packet could not be identified." })
    .optional(),
});

/** Rule 8.17 — units are a whole number, zero allowed; the note is required. */
export const recordSalesSchema = z.object({
  productId: ID,
  jurisdictionId: z.uuid({ error: "Choose the state." }),
  year: z
    .number({ error: "Choose the calendar year." })
    .int({ error: "Choose the calendar year." })
    .min(1900, { error: "Choose the calendar year." }),
  units: z
    .number({ error: "Units are a whole number, zero or more." })
    .int({ error: "Units are a whole number, zero or more." })
    .min(0, { error: "Units are a whole number, zero or more." }),
  basisNote: z
    .string()
    .trim()
    .min(1, { error: "Say where the number came from — the note is required." })
    .max(500),
});

/** Rules 8.19, 8.21 — a deadline, and the year picked where the law names none. */
export const packetSchema = z.object({
  deadlineId: ID,
  year: z.number().int().nullable(),
});

export const reopenSchema = z.object({
  deadlineId: ID,
  reason: z.string().trim().min(1, { error: "Say why it is reopened." }),
});
