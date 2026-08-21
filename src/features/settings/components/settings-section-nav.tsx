import { cn } from "@/lib/utils";

/**
 * The settings sub-navigation — `SITE_ARCHITECTURE.md` §2.5: a section list on
 * desktop, a segmented control on mobile.
 *
 * **Anchors, not tabs.** Every section is rendered on the page at once, so there
 * is no hidden panel, no URL state to keep and nothing for a screen reader to
 * miss. A tab set would hide content behind a control and would need `?tab=` in
 * the URL (§7.4); a settings page with four short sections does not earn that.
 *
 * Both layouts are the same links at different breakpoints, and exactly one is
 * in the accessibility tree at a time — `display: none` removes an element from
 * it, so `hidden`/`md:hidden` is the switch rather than visual hiding.
 */

export interface SettingsSectionLink {
  readonly id: string;
  readonly label: string;
}

export function SettingsSectionNav({
  sections,
  label,
}: {
  readonly sections: readonly SettingsSectionLink[];
  readonly label: string;
}) {
  return (
    <nav aria-label={label} className="w-full lg:w-56 lg:shrink-0">
      {/* Segmented control, below `lg`. Scrolls inside itself rather than
          widening the page (A8). */}
      <ul className="flex gap-1 overflow-x-auto rounded-md border border-border p-1 lg:hidden">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0">
            <SectionLink section={section} className="whitespace-nowrap" />
          </li>
        ))}
      </ul>

      {/* Section list, `lg` and up. */}
      <ul className="hidden flex-col gap-1 lg:sticky lg:top-24 lg:flex">
        {sections.map((section) => (
          <li key={section.id}>
            <SectionLink section={section} className="w-full" />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SectionLink({
  section,
  className,
}: {
  readonly section: SettingsSectionLink;
  readonly className?: string;
}) {
  return (
    <a
      href={`#${section.id}`}
      className={cn(
        // 44px minimum target, on desktop as well as on touch (§1.5).
        "inline-flex min-h-11 items-center rounded-md px-3 text-label text-muted-foreground",
        "hover:bg-muted hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        className,
      )}
    >
      {section.label}
    </a>
  );
}
