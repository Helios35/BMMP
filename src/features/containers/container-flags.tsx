import type { ReactElement } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";

import { INTENT_SURFACE_CLASSES } from "@/components/status/intent-classes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

import {
  FLAG_DAMAGED_BODY,
  FLAG_DAMAGED_TITLE,
  FLAG_MISLABELLED_TITLE,
  FLAG_NO_LABEL_BODY,
  FLAG_NO_LABEL_TITLE,
  mislabelledBody,
} from "./container-copy";
import type { ContainerFlags } from "./server/read-container";

/**
 * The flags §3.10 puts **on the header, not buried**: a container holding
 * contents with no current printed label (Rule 4.22) and one whose printed
 * start no longer matches its current start (Rule 4.19) — both block a
 * shipment — and any damaged or defective contents (Flow D3).
 *
 * Each is a comparison of stored rows, made by the read; nothing here decides
 * one. `critical` per T-48's table for the two label flags.
 */
export function ContainerFlagsNotice({
  flags,
  formatDate,
}: {
  readonly flags: ContainerFlags;
  /** The site's civil date for an instant (Rule 4.29). */
  readonly formatDate: (instant: string) => string;
}): ReactElement | null {
  const items: ReactElement[] = [];
  if (flags.noCurrentLabel) {
    items.push(
      <Alert
        key="no-label"
        role="alert"
        data-container-flag="no_current_label"
        className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
      >
        <CircleAlert aria-hidden="true" />
        <AlertTitle className="text-body-strong">
          {FLAG_NO_LABEL_TITLE}
        </AlertTitle>
        <AlertDescription className="text-body text-current">
          {FLAG_NO_LABEL_BODY}
        </AlertDescription>
      </Alert>,
    );
  }
  if (flags.mislabelled !== null) {
    items.push(
      <Alert
        key="mislabelled"
        role="alert"
        data-container-flag="mislabelled"
        className={cn("gap-2 border", INTENT_SURFACE_CLASSES.critical)}
      >
        <CircleAlert aria-hidden="true" />
        <AlertTitle className="text-body-strong">
          {FLAG_MISLABELLED_TITLE}
        </AlertTitle>
        <AlertDescription className="text-body text-current">
          {mislabelledBody(
            formatDate(flags.mislabelled.printed),
            formatDate(flags.mislabelled.current),
          )}
        </AlertDescription>
      </Alert>,
    );
  }
  if (flags.damagedContents) {
    items.push(
      <Alert
        key="damaged"
        role="status"
        data-container-flag="damaged_contents"
        className={cn("gap-2 border", INTENT_SURFACE_CLASSES.attention)}
      >
        <TriangleAlert aria-hidden="true" />
        <AlertTitle className="text-body-strong">
          {FLAG_DAMAGED_TITLE}
        </AlertTitle>
        <AlertDescription className="text-body text-current">
          {FLAG_DAMAGED_BODY}
        </AlertDescription>
      </Alert>,
    );
  }
  if (items.length === 0) return null;
  return <div className="flex flex-col gap-3">{items}</div>;
}
