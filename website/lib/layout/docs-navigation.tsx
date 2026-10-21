// Side navigation of the Docs page: its sections (the library guide, then the specification chapters from spec/*.md).
// The top bar links the pages, so this lists only what is on the Docs page.
import { GUIDE_SECTIONS } from "../docs/sections.ts";
import { listSpecChapters } from "../spec.ts";

export function DocsNavigation() {
  return (
    <nav class="mk-docs-navigation" aria-label="Documentation">
      <details open>
        <summary class="mk-docs-navigation-heading">Docs</summary>
        <ul>
          {GUIDE_SECTIONS.map((section) => <li key={section.id}><a href={`/docs.html#${section.id}`}>{section.title}</a></li>)}
        </ul>
      </details>
      <details open>
        <summary class="mk-docs-navigation-heading">Specification</summary>
        <ul>
          {listSpecChapters().map((chapter) => <li key={chapter.slug}><a href={chapter.route}>{chapter.title}</a></li>)}
        </ul>
      </details>
    </nav>
  );
}
