# blendfile website

Static documentation site for `blendfile`, built with defuss-ssg, defuss JSX and defuss-shadcn. It has five parts:

- an overview of the format and the library
- the specification, rendered from `../spec/*.md`
- the library guide and API reference
- an inspector that runs the VS Code extension's preview (3D view and struct browser) in the browser
- a page for the VS Code extension, with its `.vsix` for download (`make website` packs it, and the vendor plugin in `config.ts` copies it)

| Command (from this folder) | Does |
|----------------------------|------|
| `bun run dev` | dev server on http://localhost:3000 |
| `bun run build` | static build into `dist/` |
| `bun run serve` | serve `dist/` on http://localhost:4173/blendfile/ (Vite preview) |
| `bun run preview` | build, then serve |

`bun run build` needs the packed VS Code extension (`make vscode-package`); `make website` runs both. The scripts need Node 22 or newer for defuss-ssg (`scripts/check-node.mjs`).

Every push to `main` publishes the site to GitHub Pages at https://mansi1.github.io/blendfile/ (`.github/workflows/pages.yml`). URLs are page-relative, so the same build works at any path; `make start` serves it at http://localhost:4173/blendfile/.
