// The 404 page (server only; pages/404.mdx only renders it). GitHub Pages serves it at any depth, so config.ts keeps
// its URLs absolute.
import { PageShell } from "../layout/page-shell.tsx";
import { DocsArticle } from "../parts/docs-article.tsx";

const LINKS = [
  { route: "/docs.html#specification", label: "The .blend file format" },
  { route: "/docs.html", label: "Docs" },
  { route: "/#playground", label: "Playground" },
];

export function NotFoundPage({ title, description }: { title: string; description: string }) {
  return (
    <PageShell title={title} description={description} route="/404.html">
      <DocsArticle title={title} lead={<>There is no page at this address. It may have moved when the site dropped <code>.html</code> from its links.</>}>
        <p><a class="btn" data-variant="default" href="/">Go to the overview</a></p>
        <ul>
          {LINKS.map((link) => <li key={link.route}><a href={link.route}>{link.label}</a></li>)}
        </ul>
      </DocsArticle>
    </PageShell>
  );
}
