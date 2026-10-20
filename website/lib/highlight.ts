// Build-time syntax highlighting with Shiki: code blocks get their colors as inline styles while the pages are
// written. VERIFIED: the built pages load no highlighter; Shiki runs only in the build (config.ts, lib/examples.ts).
// One dark theme for every block, in light and dark mode alike.
import { type BundledLanguage, createHighlighter } from "shiki";

export const CODE_THEME = "tokyo-night";
const LANGUAGES: BundledLanguage[] = ["ts", "tsx", "js", "json", "bash", "python", "c"];

const highlighter = await createHighlighter({ themes: [CODE_THEME], langs: LANGUAGES });

/** One token of a highlighted line: its text and its color. */
export interface CodeToken {
  text: string;
  color?: string;
}

const knownLanguage = (lang: string) => (LANGUAGES as string[]).includes(lang) ? (lang as BundledLanguage) : "text";

/** Lines of colored tokens, for components that render the code themselves (the hydrated code examples). */
export function highlightLines(code: string, lang: string): CodeToken[][] {
  return highlighter.codeToTokensBase(code, { lang: knownLanguage(lang), theme: CODE_THEME })
    .map((line) => line.map((token) => ({ text: token.content, color: token.color })));
}

const decodeEntities = (html: string) =>
  html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

// <pre ...><code class="language-x">...</code></pre> as MDX and marked write fenced code blocks.
const CODE_BLOCK = /<pre\b[^>]*>\s*<code class="language-([\w-]+)">([\s\S]*?)<\/code>\s*<\/pre>/g;

/** One code block as Shiki's highlighted markup (a <pre class="shiki">), for the CodeBlock part. */
export function highlightToHtml(code: string, lang: string): string {
  return highlighter.codeToHtml(code, { lang: knownLanguage(lang), theme: CODE_THEME });
}

/** Replaces every fenced code block in a page with Shiki's highlighted markup. */
export function highlightCodeBlocks(html: string): string {
  return html.replace(CODE_BLOCK, (_, lang: string, code: string) =>
    highlighter.codeToHtml(decodeEntities(code).replace(/\n$/, ""), { lang: knownLanguage(lang), theme: CODE_THEME }));
}
