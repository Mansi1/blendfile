# blendfile website

Static documentation site for `blendfile`, built with defuss-ssg, defuss JSX and defuss-shadcn. It has five parts:

- an overview of the format and the library
- the specification, rendered from `../spec/*.md`
- the library guide and API reference
- an inspector that runs the VS Code extension's preview (3D view and struct browser) in the browser
- a page for the VS Code extension, with its `.vsix` for download (`make website-assets` packs and copies it)

| Command (from this folder) | Does |
|----------------------------|------|
| `bun run dev` | dev server on http://localhost:3000 |
| `bun run build` | static build into `dist/` |
| `bun run serve` | serve `dist/` on http://localhost:4173 |
| `bun run preview` | build, then serve |

The scripts change to the repository root before running defuss-ssg; `ARCH.md` explains why.

Every push to `main` publishes the site to GitHub Pages at https://mansi1.github.io/blendfile/ (`.github/workflows/pages.yml`). To build for a sub-path yourself, set `SITE_BASE`, for example `SITE_BASE=/blendfile/ make website`.
