import type { SsgPlugin } from "defuss-ssg";

// defuss renders the <html> element only; without a doctype browsers fall back to quirks mode.
const doctypePlugin: SsgPlugin = {
  name: "doctype",
  phase: "page-html",
  mode: "both",
  fn: (html: string) => (/^\s*<!doctype/i.test(html) ? html : `<!doctype html>${html}`),
};

// VERIFIED: pages use root-absolute URLs (/usage.html, /assets/...). A site served under a sub-path, like GitHub Pages at
// /blendfile/, sets SITE_BASE=/blendfile/ at build time, and every root-absolute href, src and defuss-ssg hydration
// URL (data-hydrate-src, data-hydrate-runtime) gets that prefix.
const siteBase = process.env.SITE_BASE || "/";
const basePlugin: SsgPlugin = {
  name: "site-base",
  phase: "page-html",
  mode: "both",
  fn: (html: string) =>
    siteBase === "/"
      ? html
      : html
          .replace(/\b(href|src|data-hydrate-src|data-hydrate-runtime)="\/(?!\/)/g, `$1="${siteBase}`)
          // The inline hydration scripts import "/components/runtime.js" as a string literal.
          .replaceAll('"/components/', `"${siteBase}components/`),
};

export default {
  pages: "pages",
  output: "dist",
  components: "components",
  assets: "assets",
  plugins: [doctypePlugin, basePlugin],
};
