import { z } from "zod";

/**
 * What **Rank now** sends — checked again on the server
 * (`TECHNICAL_SPEC.md` §7.1 step 2). Only the route it was pressed on, so the
 * guard reads that route's capability; the run itself ranks every kind at once
 * (Rule 10.24).
 */
export const RANK_NOW_ROUTES = ["/batteries", "/containers"] as const;

export const rankNowSchema = z.object({
  route: z.enum(RANK_NOW_ROUTES, {
    error: "Rank now could not tell which list it was pressed on.",
  }),
});
