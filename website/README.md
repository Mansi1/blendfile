# blendfile website

Static documentation site for `blendfile`, built with defuss-ssg, defuss JSX and defuss-shadcn. It has three pages:

- `index`: the overview of the format and the library, with the playground, which runs the VS Code extension's preview (3D view and struct browser) in the browser
- `docs`: the library guide, the API reference, the VS Code extension with its `.vsix` for download, and the specification rendered from `../spec/*.md`
- `404`

Each `pages/*.mdx` only names its title and description and renders one component from `lib/pages/`; `ARCH.md` explains the layout.

| Command (from this folder) | Does |
|----------------------------|------|
| `bun run dev` | dev server on http://localhost:3000 |
| `bun run build` | static build into `dist/` |
| `bun run serve` | serve `dist/` on http://localhost:4173/blendfile/ (Vite preview) |
| `bun run preview` | build, then serve |

`bun run build` needs the packed VS Code extension (`make vscode-package`); `make website` runs both. The scripts need Node 22 or newer for defuss-ssg (`scripts/check-node.mjs`).

Every push to `main` publishes the site to GitHub Pages at https://mansi1.github.io/blendfile/ (`.github/workflows/pages.yml`). URLs are page-relative, so the same build works at any path; `make start` serves it at http://localhost:4173/blendfile/.
