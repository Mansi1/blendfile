// The website dev server's 404 handling (website/config.ts) decides with these which requests are missing pages.
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { isPageRoute, pageExists } from "../website/lib/dev-routes.ts";

const pagesDir = fileURLToPath(new URL("../website/pages", import.meta.url));

test("page routes are paths without an extension or with .html, not Vite's own paths", () => {
  for (const path of ["/", "/docs", "/docs.html", "/folder/", "/folder/page"]) expect(isPageRoute(path)).toBe(true);
  for (const path of ["/assets/ui.css", "/components/runtime.js", "/@vite/client", "/node_modules/x/y", "/__inspect"]) expect(isPageRoute(path)).toBe(false);
});

test("pageExists finds pages and folder indexes and never looks outside pages/", () => {
  for (const path of ["/", "/docs", "/docs.html", "/index.html", "/404.html"]) expect(pageExists(pagesDir, path)).toBe(true);
  for (const path of ["/missing", "/playground", "/spec/05-sdna", "/../package", "/%2E%2E/package"]) expect(pageExists(pagesDir, path)).toBe(false);
});
