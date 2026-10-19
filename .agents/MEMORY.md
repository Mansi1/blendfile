# Agent memory

- VERIFIED[website build] defuss-ssg copies the site to `<cwd>/.ssg-temp`; `website/components|lib` import the lib as `../../src/index.ts`, which resolves only when run from repo root BC `make website` works, `file:..` dep made a symlink loop.
- VERIFIED[website SSR] defuss runs `onMount` during SSR and escapes `&<>` inside `<script>` BC build error "document is not defined", `&amp;&amp;` in output.
- VERIFIED[defuss-shadcn 0.9.9 code-block] CSS shows tabs only for values npm|pnpm|bun; site.css adds tab-0..tab-5 BC all.min.css rule.
- VERIFIED[zstd] node:zlib zstd (Node 24) decodes only frame 1 of Blender's seekable zstd; use fzstd BC 1236 of 458736 bytes.
- VERIFIED[gate] no git repo: `vae.py gate` sees no changes; run `vae.py verify --repo . --changed tmp/changed.txt` BC gate output.
- VERIFIED[three EXRLoader 0.186] a Y-only (luminance) EXR decodes to 1 float per pixel, RGB(A) files to 4 BC Poly Haven roughness maps are Y-only; texture-loader handles both.
- VERIFIED[textures orientation] createImageBitmap(imageOrientation "flipY") + texture.flipY=false matches Blender UVs BC Workbench/Cycles renders of texture_v43 agree with the webview.
