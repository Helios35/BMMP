"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactElement } from "react";

import { FilingPacketSummary } from "@/components/documents/filing-packet-summary";
import {
  InlineActionError,
  ReviewButton,
  useActionCall,
} from "@/components/extraction-review/review-controls";
import { ACTION_BUTTON_CLASS } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NOT_THE_FILING, sendToWords } from "@/domain/producer/filing-words";

import { issuePacket, previewPacket } from "../actions";
import {
  ISSUE_PACKET,
  ISSUING,
  MAKE_PACKET,
  OPEN_PACKET,
  PACKET_ISSUED,
  PACKET_NO_DRAFT,
  PACKET_YEAR,
  PACKET_YEAR_PLACEHOLDER,
  PREPARING,
} from "../obligation-copy";
import type { PacketPreview } from "../server/packets";

/** One answer from the server, and the year it was for. */
interface Loaded {
  readonly year: number | null;
  readonly preview: PacketPreview | null;
  readonly error: string | null;
}

/**
 * **Make packet** — Rules 8.19–8.21; `UX_SPEC.md` §3.21.
 *
 * Opening it shows the filing's title, where it goes, the period — or, where
 * the law names none, a year picker with nothing picked (Rule 8.21) — and
 * **each item as filled or a gap**, exactly as Issue would issue it: both
 * come from the same server path. **Issue packet** is one deliberate act; it
 * never marks the deadline done, and a later packet replaces this one.
 */
export function MakePacketDialog({
  deadlineId,
  duty,
}: {
  readonly deadlineId: string;
  readonly duty: string;
}): ReactElement {
  const router = useRouter();
  const issue = useActionCall();
  const yearId = useId();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [issuedId, setIssuedId] = useState<string | null>(null);

  // The preview loads when the dialog opens and again for each year picked;
  // state moves only when the Server Action answers, never inside the effect.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void previewPacket({ deadlineId, year }).then((result) => {
      if (cancelled) return;
      setLoaded(
        result.ok
          ? { year, preview: result.data, error: null }
          : { year, preview: null, error: result.error.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, year, deadlineId]);

  function close(next: boolean): void {
    setOpen(next);
    if (!next) {
      setLoaded(null);
      setYear(null);
      setIssuedId(null);
      issue.clearError();
    }
  }

  // A preview for another year is not this one's — it reads as loading.
  const current = loaded !== null && loaded.year === year ? loaded : null;
  const preview = current?.preview ?? null;
  const loadError = current?.error ?? null;

  async function confirm(): Promise<void> {
    if (preview?.kind !== "ready") return;
    let id: string | null = null;
    const result = await issue.run(async () => {
      const issued = await issuePacket({ deadlineId, year });
      if (issued.ok) id = issued.data.id;
      return issued;
    });
    if (result?.ok === true) {
      setIssuedId(id);
      router.refresh();
    }
  }

  const heading =
    preview !== null && preview.kind !== "refused" ? preview.heading : null;
  const years =
    preview?.kind === "needs_year"
      ? preview.years
      : preview?.kind === "ready"
        ? preview.years
        : null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className={ACTION_BUTTON_CLASS}
        onClick={() => setOpen(true)}
        data-make-packet={deadlineId}
      >
        {MAKE_PACKET}
      </Button>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg sm:max-w-2xl"
        data-make-packet-dialog={deadlineId}
      >
        <DialogHeader>
          <DialogTitle className="text-h2">
            {heading?.title ?? MAKE_PACKET}
          </DialogTitle>
          <DialogDescription className="text-body">
            {heading === null ? duty : `${heading.documentTypeLabel} · ${duty}`}
          </DialogDescription>
        </DialogHeader>

        {preview === null ? (
          loadError === null ? (
            <p
              className="text-body"
              role="status"
              data-make-packet-loading="true"
            >
              {PREPARING}
            </p>
          ) : null
        ) : preview.kind === "refused" ? (
          <p className="text-body" data-make-packet-refused="true">
            {preview.words}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div
              className="flex flex-col gap-1 rounded-md border border-border p-3"
              role="note"
              data-filing-not-the-filing="true"
            >
              <p className="text-body-strong">{NOT_THE_FILING}</p>
              <p className="text-body" data-filing-send-to="true">
                {sendToWords(preview.heading.sendTo)}
              </p>
            </div>
            {years === null ? null : (
              <div className="flex flex-col gap-2">
                <Label htmlFor={yearId} className="text-label text-foreground">
                  {PACKET_YEAR}
                </Label>
                <Select
                  value={year === null ? "" : String(year)}
                  onValueChange={(value) => setYear(Number(value))}
                >
                  <SelectTrigger
                    id={yearId}
                    className="min-h-11 w-full rounded-md text-body sm:w-60"
                    data-make-packet-year="true"
                  >
                    <SelectValue placeholder={PACKET_YEAR_PLACEHOLDER} />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((option) => (
                      <SelectItem
                        key={option}
                        value={String(option)}
                        className="min-h-11 text-body"
                      >
                        {String(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {preview.kind === "needs_year" ? (
              <p className="text-body" data-make-packet-needs-year="true">
                {preview.words}
              </p>
            ) : (
              <FilingPacketSummary
                content={preview.content}
                showNotice={false}
              />
            )}
            <p className="text-caption text-muted-foreground">
              {PACKET_NO_DRAFT}
            </p>
          </div>
        )}

        {issuedId === null ? null : (
          <p
            className="flex flex-wrap items-center gap-2 text-body-strong"
            role="status"
            data-make-packet-issued={issuedId}
          >
            {PACKET_ISSUED}
            <Link
              href={`/documents/${issuedId}`}
              className="inline-flex min-h-11 items-center underline underline-offset-4"
              data-open-packet={issuedId}
            >
              {OPEN_PACKET}
            </Link>
          </p>
        )}
        {loadError === null ? null : (
          <InlineActionError
            dataAttribute="data-dialog-error"
            message={loadError}
          />
        )}
        {issue.error === null ? null : (
          <InlineActionError
            dataAttribute="data-dialog-error"
            message={issue.error}
          />
        )}
        <DialogFooter className="rounded-b-lg">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => close(false)}
            className={ACTION_BUTTON_CLASS}
          >
            Close
          </Button>
          {issuedId === null ? (
            <ReviewButton
              variant="default"
              pending={issue.pending}
              pendingLabel={ISSUING}
              gatedReason={
                preview?.kind === "ready"
                  ? null
                  : preview?.kind === "needs_year"
                    ? preview.words
                    : preview?.kind === "refused"
                      ? preview.words
                      : PREPARING
              }
              onPress={() => void confirm()}
              data-issue-packet="true"
            >
              {ISSUE_PACKET}
            </ReviewButton>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
