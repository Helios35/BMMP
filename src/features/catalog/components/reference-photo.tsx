import type { ReactElement } from "react";
import { ImageOff } from "lucide-react";

import { Field, FieldList, SectionCard } from "@/components/page";

/**
 * **Reference label photo** — `UX_SPEC.md` §3.16, §3.19; Rule 2.36; D-75 #1,
 * #2.
 *
 * The catalog entry's current reference: a platform photo — the maker's image,
 * a spec sheet, or one the platform took — never a customer's. Read-only on
 * `/catalog/[id]` for every role; P6 sets or replaces it on
 * `/settings/catalog?entry=`. **"None on file"** where there is none: the label
 * look check then records "no reference" and compares nothing.
 *
 * The bytes are not served on the mock adapter, so the frame keeps the
 * photo's proportions and says so, as the Photos tab does.
 */

export const REFERENCE_PHOTO_TITLE = "Reference label photo";
export const REFERENCE_PHOTO_NONE = "None on file";
export const REFERENCE_PHOTO_DESCRIPTION =
  "A platform photo of this product's label — the maker's image, a spec sheet, or one the platform took. A label photo that looks different from it is sent to review (AI suggested).";
const IMAGE_UNAVAILABLE = "Image not available on the mock adapter.";

export interface ReferencePhotoView {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly fileName: string | null;
  readonly setByName: string | null;
  readonly setAtText: string;
  /** Earlier references kept on the entry's history (Rule 2.36). */
  readonly replacedCount: number;
}

export function ReferencePhotoFigure({
  photo,
}: {
  readonly photo: ReferencePhotoView | null;
}): ReactElement {
  if (photo === null) {
    return (
      <p
        role="status"
        data-reference-photo="none"
        className="max-w-[72ch] text-body"
      >
        {REFERENCE_PHOTO_NONE}
      </p>
    );
  }
  return (
    <div data-reference-photo="current" className="flex flex-col gap-4">
      <div
        role="img"
        aria-label={`${REFERENCE_PHOTO_TITLE}. ${IMAGE_UNAVAILABLE}`}
        style={{ aspectRatio: `${photo.widthPx} / ${photo.heightPx}` }}
        className="flex w-full max-w-md flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted p-4 text-center text-caption text-muted-foreground"
      >
        <ImageOff aria-hidden="true" className="size-4" />
        <span>{IMAGE_UNAVAILABLE}</span>
      </div>
      <FieldList>
        <Field label="File">
          {photo.fileName === null ? null : (
            <span className="text-mono break-all">{photo.fileName}</span>
          )}
        </Field>
        <Field label="Set">
          {photo.setByName === null
            ? photo.setAtText
            : `${photo.setAtText} by ${photo.setByName}`}
        </Field>
        {photo.replacedCount === 0 ? null : (
          <Field label="Replaced earlier">
            <span className="tabular">{photo.replacedCount}</span>
          </Field>
        )}
      </FieldList>
    </div>
  );
}

/** The read-only section on `/catalog/[id]`. */
export function ReferencePhotoSection({
  photo,
}: {
  readonly photo: ReferencePhotoView | null;
}): ReactElement {
  return (
    <SectionCard
      title={REFERENCE_PHOTO_TITLE}
      description={REFERENCE_PHOTO_DESCRIPTION}
      headingLevel={2}
    >
      <ReferencePhotoFigure photo={photo} />
    </SectionCard>
  );
}
