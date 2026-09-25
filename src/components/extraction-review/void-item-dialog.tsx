"use client";

import type { ReactElement } from "react";

import {
  ReasonDialog,
  type ReasonDialogAttributes,
  type ReasonDialogCopy,
} from "./reason-dialog";
import {
  VOID_BODY,
  VOID_CANCEL,
  VOID_CONFIRM,
  VOID_CONFIRMING,
  VOID_ITEM,
  VOID_REASON_LABEL,
  VOID_REASON_REQUIRED,
  VOID_TITLE,
} from "./review-copy";
import type { ExtractionReviewActions } from "./types";

/**
 * Void — the only other way out of the review queue (`UX_SPEC.md` §2.1.5;
 * Rule 2.23).
 *
 * A queue item leaves in exactly two ways: a person confirms it, or a person
 * **voids it with a stated reason**. There is no dismiss, no ignore and no
 * expiry, for any role. The reason is required and typed: the confirm stays
 * inert — `aria-disabled` with its reason visible, never the `disabled`
 * attribute — until one is entered, and the dialog stays open until the server
 * has recorded it. The session, its photos and its extraction are all retained
 * (Rule 2.1).
 *
 * The mechanics are `ReasonDialog`'s, shared with every other act that needs a
 * stated reason; this is its void.
 */

const VOID_COPY: ReasonDialogCopy = {
  trigger: VOID_ITEM,
  title: VOID_TITLE,
  body: VOID_BODY,
  reasonLabel: VOID_REASON_LABEL,
  reasonRequired: VOID_REASON_REQUIRED,
  confirm: VOID_CONFIRM,
  confirming: VOID_CONFIRMING,
  cancel: VOID_CANCEL,
};

const VOID_ATTRIBUTES: ReasonDialogAttributes = {
  trigger: { "data-void-item": "true" },
  dialog: { "data-void-dialog": "true" },
  reason: { "data-void-reason": "true" },
  confirm: { "data-void-confirm": "true" },
};

export function VoidItemDialog({
  onVoid,
}: {
  readonly onVoid: NonNullable<ExtractionReviewActions["voidItem"]>;
}): ReactElement {
  return (
    <ReasonDialog
      copy={VOID_COPY}
      onSubmit={onVoid}
      tone="destructive"
      attributes={VOID_ATTRIBUTES}
    />
  );
}
