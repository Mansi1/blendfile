# blendfile

Read Blender `.blend` files in browsers and Node.js. The library handles:

- the 12-byte header of Blender up to 4.x and the 17-byte header of Blender 5.0+
- all three block header layouts
- gzip and zstd compression
- struct decoding through the SDNA type catalog stored in each file
- scenes for 3D viewers: visible objects with Blender's world matrices, mesh faces as triangles, materials, lights and cameras

The repository also contains a written specification of the format (`spec/`), a documentation website with an in-browser playground (`website/`) and a VS Code extension that previews `.blend` files (`vscode-extension/`).

Website: https://mansi1.github.io/blendfile/. The extension's `.vsix` can be downloaded from https://mansi1.github.io/blendfile/docs#vscode-extension.

## Install

The package is not on npm yet. Build and pack it, then add the tarball:

```sh
bun install && bun run build && bun pm pack
bun add ./blendfile-0.1.0.tgz
```

## Use

```ts
import { parseBlendFile, readMeshVertexPositions } from "blendfile";

const blendFile = parseBlendFile(bytes); // Uint8Array or ArrayBuffer
blendFile.blenderVersion; // "5.2"

const cube = blendFile.findDatablock("OB", "Cube");
cube?.readMember("loc"); // [x, y, z]
const mesh = cube?.followPointer("data");
if (mesh) readMeshVertexPositions(mesh); // Float32Array, xyz per vertex

blendFile.readRenderInfo(); // [{ sceneName, frameStart, frameEnd }]
blendFile.readThumbnail(); // { width, height, rgba } or undefined
```

Every failure throws `BlendError` with `code` `NOT_BLEND`, `UNSUPPORTED` or `CORRUPT`. `website/pages/usage.mdx` has the full API reference; it is also the Library page of the website.

### API

| Export | Purpose |
|--------|---------|
| `parseBlendFile(bytes)` | decompress and open a file |
| `BlendFile` | blocks, SDNA, datablock lookup, pointer resolution, raw arrays and strings, render info, thumbnail |
| `BlendStruct` | lazy typed view of one struct: `readMember`, `readPointer`, `followPointer`, `followPointerToArray`, `readListBase`, `toJSON` |
| `readMeshVertexPositions(mesh)` | vertex positions across Blender 3.x, 4.x and 5.x mesh layouts |
| `readScene(file)` | the view layer's objects with type, world matrix, visibility and material slots; scene camera, world color, resolution |
| `readMeshGeometry(mesh)`, `triangulateMeshGeometry(geometry)` | faces, material slot and smooth flag per face; triangles for drawing |
| `listMeshUvMaps(mesh)`, `readMeshUvMap(mesh, name?)` | UV map names, the render UV map, u, v per face corner |
| `readMaterialAppearance`, `readLight`, `readCamera` | viewport and Principled BSDF values, image textures behind them, light power and shape, camera lens and sensor |
| core functions | `decompressFileBytes`, `decodeFileHeader`, `readBlockList`, `decodeSdna`, `readMemberValue` and the other readers of one format layer each |

## Supported files

| File | Status |
|------|--------|
| Blender 5.x (17-byte header, `LargeBHead8`) | tested with Blender 5.2.2 files |
| 64-bit little-endian files of Blender up to 4.x (`SmallBHead8`) | tested with Blender 4.3.0 files |
| zstd and gzip compression | tested |
| 32-bit (`BHead4`) and big-endian files | decoded per the specification; tested with synthetic files only |

## Repository

| Path | Content |
|------|---------|
| `src/core/` | pure functions, one per format layer |
| `src/api/` | `BlendFile`, `BlendStruct`, `readMeshVertexPositions` |
| `spec/` | the format specification (Markdown) |
| `test/` | tests against Blender-written fixtures and synthetic files |
| `input/` | fixtures written by Blender 4.3.0 and 5.2.2, with Blender's own values in `*.truth.json` |
| `tools/make_fixtures.py` | regenerates the fixtures: `Blender -b --factory-startup --python tools/make_fixtures.py -- input v43` |
| `tools/render_social_image.ts` | renders the website's link preview image: `bun tools/render_social_image.ts` |
| `tools/make_scene_fixture.py` | regenerates the scene fixtures for the 3D view: `… --python tools/make_scene_fixture.py -- input scene_v43` |
| `website/` | defuss-ssg site: overview, specification, docs, playground, VS Code extension page |
| `vscode-extension/` | VS Code custom editor for `.blend` and `.blend1` files: a 3D view of the scene and an inspector; see its README |
| `e2e/` | packed-library consumer test, Playwright tests of the website and the extension's webview |

## Development

| Command | Does |
|---------|------|
| `make setup` | install locked dependencies and Playwright's Chromium |
| `make test` | unit and integration tests |
| `make lint` | oxlint and TypeScript checks |
| `make build` | library build into `dist/` |
| `make website` | static website into `website/dist/` |
| `make dev` | website dev server on port 3000 |
| `make start` / `make stop` | serve the built website on port 4173 |
| `make e2e` | pack, install into a clean project, run under Node ESM and CJS; Playwright over every website page and the extension webview; the `.vsix` in real VS Code |
| `make vscode-package` | VS Code extension into `vscode-extension/blendfile-preview.vsix` |
| `make vscode-e2e` | install the `.vsix` into a throwaway VS Code profile and open every fixture |
| `make vscode-publish` | run `vscode-e2e`, then publish the `.vsix` to the VS Code Marketplace (`VSCE_PAT`) and Open VSX (`OVSX_PAT`) |
| `make verify` | lint, test, coverage, e2e |

## License

MIT
