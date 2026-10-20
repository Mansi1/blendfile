// The reading column of a docs page: title, lead paragraph and the prose below.
import type { DefussChild, Props } from "defuss";

export interface DocsArticleProps extends Props {
  title: string;
  /** The lead paragraph; may contain links. */
  lead: DefussChild;
}

export function DocsArticle({ title, lead, children }: DocsArticleProps) {
  return (
    <article class="mk-docs-content" aria-labelledby="page-title">
      <h1 class="mk-docs-content-title" id="page-title">{title}</h1>
      <p class="mk-docs-content-lead">{lead}</p>
      <div class="mk-docs-content-prose">{children}</div>
    </article>
  );
}
