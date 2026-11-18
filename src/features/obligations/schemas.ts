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
});

export const reopenSchema = z.object({
  deadlineId: ID,
  reason: z.string().trim().min(1, { error: "Say why it is reopened." }),
});
