// The defuss-shadcn components the site uses: the one list config.ts copies from node_modules and lib/layout.tsx loads.
// VERIFIED: each one defines a class the built pages or components use (checked against every component's CSS); the
// whole library (all.min.css + all.min.js) is 1.3 MB, these are about 165 KB with core.
export const UI_COMPONENTS = [
  "badge", "button", "card", "code-block", "docs-content", "docs-navigation", "file-input", "hero", "mermaid", "navbar",
  "process-step", "stats", "swap",
];

/** Components that ship a script; they run after core.min.js, in this order. */
export const UI_SCRIPTS = ["file-input", "mermaid"];
