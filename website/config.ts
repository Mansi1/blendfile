import type { SsgPlugin } from "defuss-ssg";

// defuss renders the <html> element only; without a doctype browsers fall back to quirks mode.
const doctypePlugin: SsgPlugin = {
  name: "doctype",
  phase: "page-html",
  mode: "both",
  fn: (html: string) => (/^\s*<!doctype/i.test(html) ? html : `<!doctype html>${html}`),
};

export default {
  pages: "pages",
  output: "dist",
  components: "components",
  assets: "assets",
  plugins: [doctypePlugin],
};
