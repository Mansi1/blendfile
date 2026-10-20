// The specification on the Docs page: every spec/*.md file as one chapter, the README first as the introduction.
// spec/ stays the single source; lib/spec.ts renders the Markdown while the page is written.
import { listSpecChapters, renderSpecChapter } from "../spec.ts";

export function SpecificationSection() {
  return (
    <>
      {listSpecChapters().map((chapter) => {
        const { title, html } = renderSpecChapter(chapter.slug);
        return (
          <section class="docs-chapter" aria-labelledby={chapter.id} key={chapter.slug}>
            <h2 id={chapter.id}>{title}</h2>
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </section>
        );
      })}
    </>
  );
}
