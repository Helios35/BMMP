"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { ImageOff } from "lucide-react";
import { toast } from "sonner";

import {
  ReasonDialog,
  type ReasonDialogCopy,
} from "@/components/extraction-review";
import { Field, FieldList, SectionCard } from "@/components/page";

import { approveCatalogProposal, rejectCatalogProposal } from "../actions";
import {
  APPROVE,
  APPROVE_BODY,
  APPROVE_CONFIRM,
  APPROVE_REASON_LABEL,
  APPROVE_REASON_REQUIRED,
  APPROVE_TITLE,
  APPROVING,
  approvedNotice,
  CANCEL,
  IMAGE_NOT_SERVED,
  PHOTO_NOT_LINKED,
  proposedByLine,
  REJECT,
  REJECT_BODY,
  REJECT_CONFIRM,
  REJECT_REASON_LABEL,
  REJECT_REASON_REQUIRED,
  REJECT_TITLE,
  REJECTED_NOTICE,
  REJECTING,
} from "../catalog-admin-copy";
import type { ProposalPhoto, ProposalView } from "../server/proposals";

/**
 * One proposal, beside the photo it came from — `UX_SPEC.md` §3.19;
 * `SITE_ARCHITECTURE.md` Flow F step 3.
 *
 * *"P6 reviews the proposal against the linked `intake_photo` and label crop."*
 * The photo and the crop sit on the left, at their own aspect ratio (the
 * bytes are not served in B1a, exactly as on the intake step), and the
 * proposed fields on the right. **Approve** and **Reject** each need a stated
 * reason and wait for the server; the page re-reads, and the proposal leaves
 * the list because it is decided, not because the screen said so.
 */

const APPROVE_COPY: ReasonDialogCopy = {
  trigger: APPROVE,
  title: APPROVE_TITLE,
  body: APPROVE_BODY,
  reasonLabel: APPROVE_REASON_LABEL,
  reasonRequired: APPROVE_REASON_REQUIRED,
  confirm: APPROVE_CONFIRM,
  confirming: APPROVING,
  cancel: CANCEL,
};

const REJECT_COPY: ReasonDialogCopy = {
  trigger: REJECT,
  title: REJECT_TITLE,
  body: REJECT_BODY,
  reasonLabel: REJECT_REASON_LABEL,
  reasonRequired: REJECT_REASON_REQUIRED,
  confirm: REJECT_CONFIRM,
  confirming: REJECTING,
  cancel: CANCEL,
};

export function ProposalCard({
  proposal,
}: {
  readonly proposal: ProposalView;
}): ReactElement {
  const router = useRouter();

  async function approve(reason: string) {
    const result = await approveCatalogProposal({
      catalogEntryId: proposal.id,
      reason,
    });
    if (result.ok) {
      toast.success(approvedNotice(result.data.raisedRecordIds.length));
      router.refresh();
    }
    return result;
  }

  async function reject(reason: string) {
    const result = await rejectCatalogProposal({
      catalogEntryId: proposal.id,
      reason,
    });
    if (result.ok) {
      toast.success(REJECTED_NOTICE);
      router.refresh();
    }
    return result;
  }

  return (
    <SectionCard
      title={proposal.title}
      description={proposedByLine(
        proposal.proposedByName,
        proposal.proposedAtLabel,
      )}
      headingLevel={3}
      dataAttributes={{ "data-proposal": proposal.id }}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div data-proposal-photos="true" className="flex flex-col gap-3">
          {proposal.photo === null && proposal.crop === null ? (
            <p className="text-body text-muted-foreground">
              {PHOTO_NOT_LINKED}
            </p>
          ) : (
            <>
              <PhotoFrame photo={proposal.photo} kind="label" />
              <PhotoFrame photo={proposal.crop} kind="label_crop" />
            </>
          )}
        </div>
        <FieldList>
          {proposal.fields.map((field) => (
            <Field key={field.label} label={field.label} value={field.value} />
          ))}
        </FieldList>
      </div>

      <div
        data-proposal-actions="true"
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <ReasonDialog
          copy={REJECT_COPY}
          onSubmit={reject}
          tone="destructive"
          attributes={{
            trigger: { "data-reject-proposal": "true" },
            dialog: { "data-reject-dialog": "true" },
            reason: { "data-reject-reason": "true" },
            confirm: { "data-reject-confirm": "true" },
          }}
        />
        <ReasonDialog
          copy={APPROVE_COPY}
          onSubmit={approve}
          tone="affirmative"
          attributes={{
            trigger: { "data-approve-proposal": "true" },
            dialog: { "data-approve-dialog": "true" },
            reason: { "data-approve-reason": "true" },
            confirm: { "data-approve-confirm": "true" },
          }}
        />
      </div>
    </SectionCard>
  );
}

function PhotoFrame({
  photo,
  kind,
}: {
  readonly photo: ProposalPhoto | null;
  readonly kind: "label" | "label_crop";
}): ReactElement | null {
  if (photo === null) return null;
  return (
    <figure
      data-proposal-photo={kind}
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
    >
      <figcaption className="text-label">{photo.label}</figcaption>
      <div
        style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted p-4"
      >
        <ImageOff aria-hidden="true" className="size-6" />
        <p className="max-w-[36ch] text-center text-caption">
          {IMAGE_NOT_SERVED}
        </p>
      </div>
    </figure>
  );
}
