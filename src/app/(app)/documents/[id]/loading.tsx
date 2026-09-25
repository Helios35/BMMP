import { PageHeaderSkeleton, PageShell } from "@/components/page";
import { DocumentViewerSkeleton } from "@/components/documents/document-viewer";

/**
 * `/documents/[id]` while it loads — `UX_SPEC.md` §2.8: a skeleton at the
 * page's aspect ratio and *"Preparing document"*. The header carries a
 * breadcrumb, a subtitle line and no action, as the page does.
 */
export default function DocumentLoading() {
  return (
    <PageShell>
      <PageHeaderSkeleton breadcrumb subtitle />
      <DocumentViewerSkeleton />
    </PageShell>
  );
}
