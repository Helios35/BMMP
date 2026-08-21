import { CircleAlert } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * The two shapes a failed authentication attempt renders as —
 * `TECHNICAL_SPEC.md` §10.3.
 *
 * **A failure that belongs to one field goes on that field**, inline, and never
 * replaces the page. A failure that belongs to the submission as a whole — wrong
 * credentials, a lockout, no organization — goes above the form, because there
 * is no field to blame and putting it on one would say which half was wrong
 * (`UX_SPEC.md` §3.1).
 *
 * Both carry an icon as well as colour, because colour is never the only signal
 * (§1.2 Rule 4), and neither is `critical` red at field level: §1.2 Rule 5
 * reserves that for a hard block, a destructive confirmation or an overdue
 * clock, and **never for a validation hint.**
 */

export function FormError({ message }: { readonly message: string }) {
  return (
    <Alert
      className={cn(INTENT_SURFACE_CLASSES.attention, "gap-2 px-3 py-3")}
      role="alert"
    >
      <CircleAlert aria-hidden="true" className="size-4" />
      <AlertDescription className="text-body text-current">
        {message}
      </AlertDescription>
    </Alert>
  );
}

export function FieldError({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string;
}) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-caption text-intent-attention-foreground"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/**
 * The `neutral` notice above a form — an invitation's organization, or why a
 * session ended.
 *
 * `role="status"` rather than `role="alert"`: nothing has failed, and an
 * assertive announcement on arrival talks over the page a screen-reader user is
 * still hearing (§G7).
 */
export function FormNotice({
  headline,
  body,
}: {
  readonly headline: string;
  readonly body?: string;
}) {
  return (
    <Alert
      className={cn(INTENT_SURFACE_CLASSES.neutral, "gap-1 px-3 py-3")}
      role="status"
    >
      <AlertDescription className="grid gap-1 text-body text-current">
        <span className="text-body-strong">{headline}</span>
        {body === undefined ? null : <span>{body}</span>}
      </AlertDescription>
    </Alert>
  );
}
