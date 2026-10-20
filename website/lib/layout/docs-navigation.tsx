// Side navigation of every page: the pages, then the sections of the Docs page (the library guide and the
// specification chapters from spec/*.md) as links into it.
import type { Props } from "defuss";
import { GUIDE_SECTIONS } from "../docs/sections.ts";
import { listSpecChapters } from "../spec.ts";

const PAGE_LINKS = [
  { route: "/", label: "Overview" },
  { route: "/#playground", label: "Playground" },
  { route: "/docs.html", label: "Docs" },
];

const currentAttribute = (linkRoute: string, route: string) => (linkRoute === route ? "page" : undefined);

export function DocsNavigation({ route }: Props & { route: string }) {
  return (
    <nav class="mk-docs-navigation" aria-label="Documentation">
      <p class="mk-docs-navigation-heading">Pages</p>
      <ul>
        {PAGE_LINKS.map((link) => (
          <li key={link.route}><a href={link.route} aria-current={currentAttribute(link.route, route)}>{link.label}</a></li>
        ))}
      </ul>
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
