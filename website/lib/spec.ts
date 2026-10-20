// Build-time only: reads spec/*.md (the single source of the format docs) and renders it to HTML.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Marked } from "marked";
import { REPOSITORY_ROOT } from "./site.ts";

// defuss-ssg runs from the repository root (see Makefile), where spec/ lives.
const SPEC_DIRECTORY = join(REPOSITORY_ROOT, "spec");

export interface SpecPageInfo {
  /** File name without `.md`, e.g. `02-file-header`; the README is `index`. */
  slug: string;
  title: string;
  route: string;
}

const slugOfFile = (fileName: string) => (fileName === "README.md" ? "index" : fileName.replace(/\.md$/, ""));
const routeOfSlug = (slug: string) => `/spec/${slug}.html`;

export function listSpecPages(): SpecPageInfo[] {
  return readdirSync(SPEC_DIRECTORY)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort((left, right) => (left === "README.md" ? -1 : right === "README.md" ? 1 : left.localeCompare(right)))
    .map((fileName) => {
      const firstHeading = /^# (.+)$/m.exec(readFileSync(join(SPEC_DIRECTORY, fileName), "utf8"));
      const slug = slugOfFile(fileName);
      return { slug, title: firstHeading?.[1] ?? slug, route: routeOfSlug(slug) };
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
    // Links between spec pages point at their website routes.
    if (token.type === "link") {
      token.href = token.href.replace(/^(?:\.\/)?README\.md/, routeOfSlug("index")).replace(/^(?:\.\/)?([\w-]+)\.md/, (_match: string, slug: string) => routeOfSlug(slug));
    }
  },
});

/** The spec page as HTML without its first heading (the layout shows the title), plus the title. */
export function renderSpecPage(slug: string): { title: string; html: string } {
  const fileName = slug === "index" ? "README.md" : `${slug}.md`;
  const markdown = readFileSync(join(SPEC_DIRECTORY, fileName), "utf8");
  const title = /^# (.+)$/m.exec(markdown)?.[1] ?? slug;
  return { title, html: specMarkdown.parse(markdown.replace(/^# .+\n/, "")) as string };
}
