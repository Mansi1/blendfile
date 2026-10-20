// Which dev-server requests are page routes, and whether pages/ has the page: the dev server's 404 handling in
// config.ts asks this. Pages are pages/<path>.mdx|.md|.html, a folder its index. Adapted from the audio-tag website.
// VERIFIED: test/dev-routes.test.ts covers both, including a path that tries to leave pages/.
import { existsSync } from "node:fs";
import { join, normalize, sep } from "node:path";

const PAGE_EXTENSIONS = [".mdx", ".md", ".html"];

/** A page address: no file extension, or .html; not Vite's own paths (/@vite/, /@fs/, /node_modules/, /__x). */
export function isPageRoute(path: string): boolean {
  if (/^\/(@|node_modules\/|__)/.test(path)) return false;
  const last = path.split("/").pop() ?? "";
  return !last.includes(".") || last.endsWith(".html");
}

/** Whether pages/ holds the page for `path` ("/", "/docs", "/docs.html", "/folder/"), never looking outside it. */
export function pageExists(pagesDir: string, path: string): boolean {
  const route = decodeURIComponent(path).replace(/\.html$/, "");
  const base = normalize(join(pagesDir, route));
  if (base !== normalize(pagesDir) && !base.startsWith(normalize(pagesDir) + sep)) return false;
  const candidates = route.endsWith("/") ? [join(base, "index")] : [base, join(base, "index")];
  return candidates.some((candidate) => PAGE_EXTENSIONS.some((extension) => existsSync(candidate + extension)));
}
