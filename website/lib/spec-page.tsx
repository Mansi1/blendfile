// VERIFIED: build-time wrapper that renders one spec/*.md file inside the site layout, so the Markdown stays the only source.
import type { Props } from "defuss";
import Layout from "./layout.tsx";
import { renderSpecPage } from "./spec.ts";

export interface SpecPageProps extends Props {
  slug: string;
}

/** One page of spec/ inside the site layout. */
export default function SpecPage({ slug }: SpecPageProps) {
  const { title, html } = renderSpecPage(slug);
  const route = `/spec/${slug}.html`;
  return (
    <Layout title={title} description={`blendfile specification: ${title}`} currentRoute={route}>
      <article class="mk-docs-content" aria-labelledby="page-title">
        <h1 class="mk-docs-content-title" id="page-title">{title}</h1>
        <div class="mk-docs-content-prose" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </Layout>
  );
}
