import type { ReactElement } from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ReviewImage } from "./types";

/**
 * Two photos side by side, each under its own caption — `UX_SPEC.md` §3.8a;
 * Rules 2.36, 2.37.
 *
 * The label look check shows **This label** beside **Catalog reference**; the
 * copy check shows the photo beside the one on the other record. A pair of
 * frames and their captions, nothing else: **no score, no similarity, no
 * colour grading how alike they are** (Rules 1.25, 2.36, 2.37). The person
 * looks and decides.
 *
 * Where the bytes are not served (the mock's `mock://` store) each frame
 * keeps the photo's own proportions and says the image is not available, as
 * the Photos tab does — the same frame renders the image once the object store
 * signs a real URL.
 */

export const IMAGE_NOT_AVAILABLE = "Image not available on the mock adapter.";

export interface PhotoPairItem {
  readonly caption: string;
  readonly image: ReviewImage | null;
}

function Frame({ item }: { readonly item: PhotoPairItem }): ReactElement {
  const image = item.image;
  return (
    <figure
      data-photo-pair-item={item.caption}
      className="flex min-w-0 flex-1 flex-col gap-2"
    >
      {image === null || image.src === null ? (
        <div
          data-photo-frame="placeholder"
          role="img"
          aria-label={`${item.caption}. ${IMAGE_NOT_AVAILABLE}`}
          style={
            image === null
              ? undefined
              : { aspectRatio: `${image.width} / ${image.height}` }
          }
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-md border bg-muted p-4 text-center text-caption text-muted-foreground",
            image === null ? "aspect-[4/3]" : undefined,
          )}
        >
          <ImageOff aria-hidden="true" className="size-4" />
          <span>{IMAGE_NOT_AVAILABLE}</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a stored object behind a signed URL; never a remote asset to optimise.
        <img
          data-photo-frame="image"
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          className="w-full rounded-md border object-contain"
        />
      )}
      <figcaption className="text-label text-foreground">
        {item.caption}
      </figcaption>
    </figure>
  );
}

export function PhotoPair({
  first,
  second,
  className,
}: {
  readonly first: PhotoPairItem;
  readonly second: PhotoPairItem;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      data-photo-pair="true"
      className={cn("flex max-w-[72ch] flex-col gap-4 sm:flex-row", className)}
    >
      <Frame item={first} />
      <Frame item={second} />
    </div>
  );
}
