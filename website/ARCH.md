# Architecture: website

## What it does

The website documents the `.blend` format and the `blendfile` library, and runs the VS Code extension's preview of `.blend` files in the browser as a playground. It is a static site built with defuss-ssg (Vite 8 underneath), defuss JSX and defuss-shadcn components, and has three pages: the overview with the playground (`index`), the Docs (`docs`) and `404`.

## Structure

```mermaid
flowchart LR
  mdx["pages/*.mdx<br/>front matter + one component"] --> pageComponents["lib/pages/*.tsx<br/>home, docs, not-found"]
  pageComponents --> shell["lib/layout/<br/>page shell, head, navbar, docs navigation"]
  pageComponents --> sections["lib/home/, lib/docs/, lib/vscode/<br/>sections"]
  sections --> parts["lib/parts/<br/>code block, tables, steps"]
  spec["spec/*.md"] --> specLib["lib/spec.ts<br/>marked, build time"] --> sections
  islands["components/*.tsx<br/>playground, code examples, theme toggle"] --> sections
  library["src/ (blendfile)"] --> islands
  preview["vscode-extension preview-app.tsx"] --> islands
  pageComponents --> dist["dist/index.html, docs.html, 404.html"]
```

- Each page in `pages/` holds only front matter (`title`, `description`) and renders one component from `lib/pages/` with them, as the audio-tag website does. The page components compose sections from `lib/home/`, `lib/docs/` and `lib/vscode/`, which use small parts from `lib/parts/`. Everything in `lib/` runs only at build time; defuss-ssg hydrates only `components/` (the playground, the code examples and the theme toggle).
- The Docs page holds the library guide, the API reference, the VS Code extension and the whole specification. `spec/` stays the single source of the format documentation: `lib/spec.ts` renders each `spec/*.md` as a chapter with marked, moves its headings one level down, points links between spec files at the chapters (`/docs#05-sdna`) and turns Mermaid fences into the defuss-shadcn Mermaid figure. The side navigation (`lib/layout/docs-navigation.tsx`), shown on the Docs page only, links to every section and chapter; an e2e test checks that each link lands on a heading.
- `components/playground.tsx` is the VS Code extension's preview, the `#playground` section of the overview: it imports `createPreviewApp` from `blendfile-preview`, an alias for `vscode-extension/src/webview/preview-app.tsx`, which imports the library from `src/index.ts`. The preview renders into a shadow root with its own stylesheet (`vscode-extension/media/preview.css`, copied to `assets/vendor/blend-preview.css` by the vendor plugin). The extension's CSS styles plain elements (`body`, `h1`, `table`) and class names that defuss-shadcn also uses (`.badge`, `.button`), so without the shadow root the two stylesheets would restyle each other. `site.css` maps the site theme onto the `--vscode-*` variables the preview reads, on the host element; custom properties inherit into the shadow root. Image files chosen with the .blend file answer the preview's texture requests by file name, and the textured sample fetches its images next to the sample.
- The `website/package.json` scripts run defuss-ssg in `website/` (`bun run build`, `bun run dev`; the Makefile calls them). defuss-ssg builds from a copy in `.ssg-temp/`, so relative imports out of `website/` would break. Code outside the folder is imported by name instead: `viteConfig.resolve.alias` in `config.ts` maps `blendfile` to `src/index.ts` and `blendfile-preview` to the extension's preview, and `tsconfig.json` has the same `paths`. Build-time code reads `input/` and `spec/` through `REPOSITORY_ROOT` in `lib/site.ts`.
- `config.ts` follows the audio-tag website's config:
  - `vendor` (`pre`) writes `assets/vendor/ui.css` (defuss-shadcn's core CSS plus each component in `lib/ui.ts`), `core.min.js` and one script per component that has one, and copies the theme, the preview stylesheet, three sample files with the textured sample's images, and the packed `.vsix` (all gitignored). Loading only the 13 components the pages use replaces `all.min.css` and `all.min.js` (1.3 MB) with about 165 KB. The source map comments are removed, because the maps are not copied and the dev server logged an error for each one.
  - `html-fix` (`page-html`) prepends the doctype, which defuss-ssg 0.7.5 does not write, and makes URLs page-relative. Pages write root-absolute URLs, and the plugin rewrites them per page depth (`/docs` becomes `./docs` on a page at the root and `../docs` one folder down), so one build works at any base path. `data-hydrate-src` and `data-hydrate-runtime` become `./X`, because the hydration runtime resolves them from `components/`. The `?v=Date.now()` cache-bust in the hydration scripts is removed. `404.html` keeps absolute `/blendfile/` URLs, because GitHub Pages serves it at any depth.
  - `github-pages` removes `.html` from every in-site `<a href>` (`lib/pretty-links.ts`). `make dev` skips page-html plugins, so a Vite `transformIndexHtml` plugin does the same there.
  - `not-found-dev` answers a missing page in `make dev` with the 404 page and status 404, as GitHub Pages does (`lib/dev-routes.ts`, tested in `test/dev-routes.test.ts`).
  - `drop-config` (`post`) deletes `dist/config.js`, which defuss-ssg 0.7.5 writes into the output.
  - `code-highlight` (`page-html`) colors every fenced code block with Shiki (`lib/highlight.ts`, theme `tokyo-night`) while the page is written, so the browser loads no highlighter. The hydrated code examples get their tokens from `lib/examples.ts` as props instead, because hydration re-renders them.
- `lib/layout/head.tsx` writes Open Graph and Twitter tags with absolute URLs (`lib/site.ts`), which link previews in WhatsApp, Slack or X need. The preview image `assets/social-preview.jpg` (1200 × 630, about 95 KB) is rendered from an HTML card by `tools/render_social_image.ts`.
- VERIFIED: every page sits in one centered column, `.page` in `site.css` (72rem wide with a 1rem gutter, as on the audio-tag site). The top bar pads its content to the same column, so the brand and the theme toggle line up with the content edges. The Docs page splits the column into a 15rem side navigation and the article from 60rem up; below that the top bar and the specification index carry navigation. One column for every page, instead of a side navigation on every page, gives the overview and the playground the full width.
- The brand colors (Blender orange and blue with pink and violet between them) are tokens and gradients at the end of `site.css`. They are unlayered, so they override the defuss-shadcn component styles, which sit in cascade layers.

## Why this design

- Rendering `spec/*.md` at build time, rather than copying the text into the page, keeps one source of truth. One Docs page instead of a page per chapter makes the whole reference searchable with the browser's find, as on the audio-tag website.
- Pages as typed components instead of MDX prose keep the markup in one language and let sections share parts (the code block, the reference table); MDX would also choke on the braces and angle brackets in byte-layout tables.
- The playground reuses the extension's preview instead of a second implementation, so the 3D view, textures and struct browser behave the same in VS Code and on the site, and one set of e2e tests covers both. The preview holds its state in a closure per mounted root and re-renders parts with `$(ref).update(...)`, the defuss pattern for explicit updates.

## Operations

`make website` builds into `website/dist/`. `make start` serves it at http://localhost:4173/blendfile/ with `vite preview`, the path GitHub Pages uses. `preview.config.ts` sets `appType: "mpa"`: Vite then serves `/usage` from `usage.html` and a missing page as a 404, whereas its default single-page mode, like `defuss-ssg serve`, answered any unknown path with the overview, which would hide a broken link. `make dev` runs the dev server on port 3000. `make e2e` runs Playwright over every built page under `/blendfile/`.

`.github/workflows/pages.yml` builds the site on every push to `main` and deploys it to GitHub Pages under `/blendfile/`.

Mermaid diagrams load Mermaid 12.0.0 from jsDelivr at view time; this is the defuss-shadcn Mermaid component's default. It is one of the components in `lib/ui.ts`.

## Security and privacy

Files opened in the playground stay in the browser: the .blend file and any image files chosen with it are read with `File.arrayBuffer()` and parsed locally, and the page makes no request with their content. Mermaid is the only third-party script, rendered with `securityLevel: "strict"` by the component.
