import { z } from "zod";

import { CONTENTS_MOVE_OPERATIONS } from "@/domain/storage/accumulation";
import { CONTAINER_TYPES } from "@/domain/taxonomy/container-type";

/**
 * Input parsing for the container writes — `TECHNICAL_SPEC.md` §7.1 step 3.
 *
 * Shapes only. **No schema here accepts a start date, a clock start, a due
 * date or a period** — there is nothing a caller could send that re-dates a
 * clock, because the absence is the enforcement (Rules 4.6, 4.9).
 */

/** Shape limits on typed text — not regulatory figures (Rule 1.23). */
const MAX_STATEMENT_LENGTH = 1000;
const MAX_NOTE_LENGTH = 500;
const MAX_LOCATION_LENGTH = 120;
/** A move is chosen by a person from one container's list, never a bulk import. */
const MAX_MOVE_SELECTION = 200;

/** `YYYY-MM-DDTHH:mm`, read in the site's zone (Rule 4.29). */
const SITE_WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** A decimal as typed — digits, one point, up to three places, as the column stores it. */
const DECIMAL_TEXT = /^\d{1,7}(\.\d{1,3})?$/;

const storageLocation = z
  .string()
  .trim()
  .min(1, "Say where the container stands.")
  .max(MAX_LOCATION_LENGTH);

export const createContainerSchema = z.object({
  containerType: z.enum(CONTAINER_TYPES, {
    error: "Choose what the container will hold.",
  }),
  storageLocation,
});

export const moveContentsSchema = z.object({
  operation: z.enum(CONTENTS_MOVE_OPERATIONS),
  sourceContainerId: z.uuid(),
  targetContainerId: z.uuid({ error: "Choose a container to move into." }),
  batteryRecordIds: z
    .array(z.uuid())
    .min(1, "Choose at least one battery to move.")
    .max(MAX_MOVE_SELECTION),
});

export const recordInspectionSchema = z.object({
  containerId: z.uuid(),
  occurredAt: z
    .string()
    .regex(SITE_WALL_CLOCK, "Give the date and time the inspection happened."),
  note: z.string().trim().max(MAX_NOTE_LENGTH).nullable(),
});

export const recordRemediationSchema = z.object({
  containerId: z.uuid(),
  statement: z
    .string()
    .trim()
    .min(1, "State what was done with the contents, and why.")
    .max(MAX_STATEMENT_LENGTH),
});

export const containerIdSchema = z.object({ containerId: z.uuid() });

export const editContainerDetailsSchema = z.object({
  containerId: z.uuid(),
  storageLocation,
  capacityKg: z
    .string()
    .trim()
    .regex(
      DECIMAL_TEXT,
      "Give the capacity as a number, up to three decimal places.",
    )
    .nullable(),
});
