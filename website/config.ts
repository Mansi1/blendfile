// defuss-ssg configuration, following the audio-tag website (Mansi1/audio-tag, website/config.ts): vendored UI,
// page-relative URLs, links without .html, a 404 page, and fixes for what defuss-ssg 0.7.5 writes.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SsgPlugin } from "defuss-ssg";
import type { Plugin } from "vite";
import { isPageRoute, pageExists } from "./lib/dev-routes.ts";
import { highlightCodeBlocks } from "./lib/highlight.ts";
import { prettyLinks } from "./lib/pretty-links.ts";
import { SITE, SITE_PATH } from "./lib/site.ts";
import { UI_COMPONENTS, UI_SCRIPTS } from "./lib/ui.ts";

// The website scripts run defuss-ssg in website/ (website/package.json), so paths start there.
const UI = "../node_modules/defuss-shadcn/dist/components";
const VENDOR = "assets/vendor";
const SAMPLES = "assets/samples";
const VSIX = "../vscode-extension/blendfile-preview.vsix";

// VERIFIED: the dev server logged "ENOENT ... mermaid.min.js.map" for each vendored file: their maps stay behind, so the
// comments that point to them go too.
const withoutSourceMap = (code: string) => code.replace(/\n?\/[/*][#@] sourceMappingURL=\S+(?: \*\/)?\s*$/, "\n");

// VERIFIED: copies what the site needs from outside website/ into assets/ before the build copies assets, so the site
// works offline (no CDN for the UI): one ui.css (core first, then each component) and one script per module, since the
// component scripts are separate modules that must not be concatenated. Also the inspector's samples and the VS Code
// extension's preview stylesheet, and the packed extension for the download link.
const vendor: SsgPlugin = {
  name: "vendor",
  phase: "pre",
  mode: "both",
  fn: () => {
    if (!existsSync(VSIX)) throw new Error(`${VSIX} is missing: pack the extension first (make vscode-package)`);
    mkdirSync(VENDOR, { recursive: true });
    mkdirSync(`${SAMPLES}/textures`, { recursive: true });
    const css = [`${UI}/core.min.css`, ...UI_COMPONENTS.map((component) => `${UI}/${component}/${component}.min.css`)];
    writeFileSync(`${VENDOR}/ui.css`, css.map((file) => withoutSourceMap(readFileSync(file, "utf8"))).join("\n"));
    writeFileSync(`${VENDOR}/core.min.js`, withoutSourceMap(readFileSync(`${UI}/core.min.js`, "utf8")));
    copyFileSync("../node_modules/defuss-shadcn/dist/theme/tangerine.css", `${VENDOR}/tangerine.css`);
    for (const component of UI_SCRIPTS) writeFileSync(`${VENDOR}/${component}.min.js`, withoutSourceMap(readFileSync(`${UI}/${component}/${component}.min.js`, "utf8")));
    copyFileSync("../vscode-extension/media/preview.css", `${VENDOR}/blend-preview.css`);
    for (const sample of ["v43.blend", "scene_v52.blend", "texture_v43.blend"]) copyFileSync(`../input/${sample}`, `${SAMPLES}/${sample}`);
    for (const image of ["texture_base.png", "texture_normal.exr"]) copyFileSync(`../input/textures/${image}`, `${SAMPLES}/textures/${image}`);
    copyFileSync(VSIX, "assets/blendfile-preview.vsix");
  },
};

// VERIFIED: defuss-ssg 0.7.5 writes no doctype (quirks mode), and absolute /components/ URLs with a ?v=Date.now()
// cache-bust into its hydration scripts. Page-relative URLs make one build work at / (make start, e2e) and under
// /blendfile/ (GitHub Pages): pages write root-absolute URLs, and this rewrites them per page depth ("/usage" on
// spec/05-sdna.html becomes "../usage"). The hydration runtime resolves data-hydrate-src|runtime from components/
// itself, so those become "./X". 404.html is served by GitHub Pages at any depth, so its URLs are absolute.
const htmlFix: SsgPlugin = {
  name: "html-fix",
  phase: "page-html",
  mode: "both",
  fn: (html: string, outputPath: string) => {
    const depth = outputPath.split(/[\\/]/).length - 1;
    const up = outputPath.endsWith("404.html") ? SITE_PATH : depth === 0 ? "./" : "../".repeat(depth);
    return "<!doctype html>\n" + html
      .replace(/(data-hydrate-(?:src|runtime)=")\/components\//g, "$1./")
      .replace(/\b(href|src)="\/(?!\/)/g, `$1="${up}`)
      .replaceAll('"/components/', `"${up}components/`)
      .replace(/"\?v=" \+ Date\.now\(\)/g, '""');
  },
};

// Fenced code blocks (MDX pages, spec Markdown) are colored with Shiki while the page is written (lib/highlight.ts).
// VERIFIED: a dynamic import() does not work here, because defuss-ssg bundles the config into a temporary folder
// without the split chunk (ERR_MODULE_NOT_FOUND).
const codeHighlight: SsgPlugin = {
  name: "code-highlight",
  phase: "page-html",
  mode: "both",
  fn: (html: string) => highlightCodeBlocks(html),
};

// Page links without .html ("usage.html" → "usage"), as GitHub Pages serves them; Vite preview (preview.config.ts)
// does the same locally. The rewrite is lib/pretty-links.ts.
const githubPages: SsgPlugin = {
  name: "github-pages",
  phase: "page-html",
  mode: "both",
  fn: (html: string) => prettyLinks(html),
};
// The audio-tag website found that `dev` renders pages without running the page-html plugins but passes the HTML
// through Vite's transformIndexHtml, so this Vite plugin rewrites the links there (the dev server serves /usage too).
const githubPagesDev: Plugin = { name: "github-pages-dev", transformIndexHtml: (html: string) => prettyLinks(html) };

// The dev server answers a missing page with the site's 404 page and status 404, as GitHub Pages does. Only page
// routes (lib/dev-routes.ts): a missing file stays a plain 404. The 404 page points its links and assets at
// /blendfile/ only in the build, so here they point to the dev server.
const PAGES = resolve(process.cwd(), "pages");
const notFoundDev: Plugin = {
  name: "not-found-dev",
  configureServer(server) {
    const log = server.config.logger;
    server.middlewares.use(async (request, response, next) => {
      const path = new URL(request.url ?? "/", "http://dev").pathname;
      if ((request.method !== "GET" && request.method !== "HEAD") || path === "/404.html" || !isPageRoute(path) || pageExists(PAGES, path)) return next();
      const origin = `http://${request.headers.host}`;
      try {
        const page = await fetch(`${origin}/404.html`);
        const html = (await page.text()).replaceAll(SITE, `${origin}/`);
        log.warn(`page not found, serving the 404 page path=${path} status=404`, { timestamp: true });
        response.statusCode = 404;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(request.method === "HEAD" ? undefined : html);
      } catch (error) {
        log.error(`could not render the 404 page path=${path} error=${JSON.stringify(String(error))}`, { timestamp: true });
        next();
      }
    });
  },
};

// VERIFIED: defuss-ssg also writes the compiled config into the output as dist/config.js; it must not ship
// (kyr0/defuss#60, found on the audio-tag website).
const dropConfig: SsgPlugin = {
  name: "drop-config",
  phase: "post",
  mode: "build",
  fn: () => {
    if (existsSync(join("dist", "config.js"))) rmSync(join("dist", "config.js"));
  },
};

export default {
  pages: "pages",
  output: "dist",
  components: "components",
  assets: "assets",
  plugins: [vendor, codeHighlight, htmlFix, githubPages, dropConfig],
  viteConfig: {
    // The library and the VS Code extension's preview live outside website/; components import them by these names,
    // which resolve from the source and the build alike (relative paths would not: defuss-ssg builds from .ssg-temp/).
    resolve: {
      alias: {
        blendfile: resolve(process.cwd(), "../src/index.ts"),
        "blendfile-preview": resolve(process.cwd(), "../vscode-extension/src/webview/preview-app.tsx"),
      },
    },
    plugins: [githubPagesDev, notFoundDev],
  },
};
