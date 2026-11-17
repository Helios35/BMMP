"use client";

import type { ReactElement, ReactNode } from "react";

import { ACTION_BUTTON_CLASS } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { CLOSE, PANEL_DESCRIPTION, RANKING_DETAILS } from "./ranking-copy";

/**
 * A ranking's panel in a dialog — for a lot, which has no page of its own
 * (`UX_SPEC.md` §3.9; the owner's call in `b1a-08`). The panel is rendered on
 * the server and handed in; this only opens and closes it. Every role may
 * open it: reading a ranking is reading.
 */
export function RankingDetailsDialog({
  title,
  itemCode,
  children,
}: {
  readonly title: string;
  readonly itemCode: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={ACTION_BUTTON_CLASS}
          data-hazard-details-trigger={itemCode}
        >
          {RANKING_DETAILS}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto"
        data-hazard-details-dialog={itemCode}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{PANEL_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" className={ACTION_BUTTON_CLASS}>
              {CLOSE}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
