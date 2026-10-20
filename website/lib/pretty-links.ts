// Page links without .html, as GitHub Pages serves them: "/docs.html" → "/docs", "/folder/index.html" → "/folder/".
// Only <a href> on this site changes: other sites, anchors, stylesheets, scripts and files that are not pages stay.
// VERIFIED: GitHub Pages answers https://mansi1.github.io/blendfile/docs with docs.html; Vite preview
// (website/preview.config.ts) resolves the same URLs locally. Adapted from the audio-tag website
// (Mansi1/audio-tag, website/lib/pretty-links.ts).

// <a ... href="[path/]name.html[#anchor]"> with no scheme (https:, mailto:) and not protocol-relative (//)
const PAGE_LINK = /(<a\b[^>]*?\shref=")(?![a-z][a-z0-9+.-]*:|\/\/)([^"#]*?)([^"#/]+)\.html(#[^"]*)?"/gi;

export function prettyLinks(html: string): string {
  return html.replace(PAGE_LINK, (_, start: string, dir: string, page: string, anchor = "") =>
    `${start}${page === "index" ? dir || "./" : dir + page}${anchor}"`);
}
