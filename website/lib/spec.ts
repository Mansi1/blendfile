// Build-time only: reads spec/*.md (the single source of the format docs) and renders each file as a chapter of the
// Docs page (lib/docs/specification.tsx).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Marked } from "marked";
import { REPOSITORY_ROOT } from "./site.ts";

const SPEC_DIRECTORY = join(REPOSITORY_ROOT, "spec");

export interface SpecChapterInfo {
  /** File name without `.md`, e.g. `02-file-header`; the README is `index`. */
  slug: string;
  title: string;
  /** Id of the chapter's section on the Docs page: the slug, `specification` for the README. */
  id: string;
  /** Link to the chapter, e.g. `/docs.html#02-file-header`. */
  route: string;
}

const slugOfFile = (fileName: string) => (fileName === "README.md" ? "index" : fileName.replace(/\.md$/, ""));
const idOfSlug = (slug: string) => (slug === "index" ? "specification" : slug);
const routeOfSlug = (slug: string) => `/docs.html#${idOfSlug(slug)}`;

export function listSpecChapters(): SpecChapterInfo[] {
  return readdirSync(SPEC_DIRECTORY)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort((left, right) => (left === "README.md" ? -1 : right === "README.md" ? 1 : left.localeCompare(right)))
    .map((fileName) => {
      const firstHeading = /^# (.+)$/m.exec(readFileSync(join(SPEC_DIRECTORY, fileName), "utf8"));
      const slug = slugOfFile(fileName);
      return { slug, title: firstHeading?.[1] ?? slug, id: idOfSlug(slug), route: routeOfSlug(slug) };
    });
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const specMarkdown = new Marked({
  renderer: {
    // Mermaid fences become the defuss-shadcn Mermaid figure; the component renders them in the browser.
    code({ text, lang }) {
      if (lang === "mermaid") return `<figure class="mermaid-diagram"><pre class="mermaid">${escapeHtml(text)}</pre></figure>`;
      return `<pre><code>${escapeHtml(text)}</code></pre>`;
    },
  },
  walkTokens(token) {
    // Links between spec files point at their chapters on the Docs page (an anchor inside a file, at the chapter).
    if (token.type === "link") {
      token.href = token.href.replace(/^(?:\.\/)?README\.md(?:#[\w-]*)?/, routeOfSlug("index")).replace(/^(?:\.\/)?([\w-]+)\.md(?:#[\w-]*)?/, (_match: string, slug: string) => routeOfSlug(slug));
    }
  },
});

/**
 * A spec file as HTML without its first heading (the chapter shows the title), plus the title. VERIFIED: headings move
 * one level down (## becomes <h3>), because each chapter sits under an <h2> on the Docs page.
 */
export function renderSpecChapter(slug: string): { title: string; html: string } {
  const fileName = slug === "index" ? "README.md" : `${slug}.md`;
  const markdown = readFileSync(join(SPEC_DIRECTORY, fileName), "utf8");
  const title = /^# (.+)$/m.exec(markdown)?.[1] ?? slug;
  const html = specMarkdown.parse(markdown.replace(/^# .+\n/, "")) as string;
  return { title, html: html.replace(/<(\/?)h([2-5])\b/g, (_match, slash: string, level: string) => `<${slash}h${Number(level) + 1}`) };
}
