# blendfile website

Static documentation site for `blendfile`, built with defuss-ssg, defuss JSX and defuss-shadcn. It has four parts:

- an overview of the format and the library
- the specification, rendered from `../spec/*.md`
- the library guide and API reference
- an inspector that parses `.blend` files in the browser

| Command (from this folder) | Does |
|----------------------------|------|
| `bun run dev` | dev server on http://localhost:3000 |
| `bun run build` | static build into `dist/` |
| `bun run serve` | serve `dist/` on http://localhost:4173 |
| `bun run preview` | build, then serve |

The scripts change to the repository root before running defuss-ssg; `ARCH.md` explains why.
