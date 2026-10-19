# Blend File Preview

Opens Blender `.blend` and `.blend1` files in VS Code as a 3D view and an inspector instead of binary text.

### 3D View

- **The scene as Blender's viewport shows it:** meshes with their materials, lights, cameras and empties, placed with the same world matrices Blender computes (parents, all rotation modes, delta transforms). Objects hidden in the viewport start hidden.
- **Four shading modes:** Wireframe, Solid (studio light, viewport display colors), Material (Principled BSDF base color, metallic, roughness and emission under a studio environment, with image textures), Rendered (the scene's own lights, shadows and world color).
- **Navigation like Blender:** drag to orbit, Shift-drag or right-drag to pan, wheel to zoom; 1, 3, 7 for front, right and top (Ctrl for the opposite side), 0 for the scene camera with its render frame, Home to frame all, period to frame the selection.
- **Outliner:** show or hide objects, click to select (or click in the view), ⋯ opens the object in the inspector.
- **Status line:** vertex, face and triangle counts, and which objects have modifiers.

The file stores meshes before modifiers, so subdivision, mirror and other modifiers are not applied. Curves, text, metaballs and volumes only get geometry when Blender evaluates them; they are listed as not drawn. Image textures show in Material and Rendered modes when an Image Texture node feeds the Principled BSDF's Base Color, Metallic or Roughness directly (reroutes and a Mapping or UV Map node in front are fine), or its Normal through a tangent-space Normal Map node. Packed images come from the .blend file; external ones are read next to it (`//textures/…`), and when an absolute path from another machine does not exist, by file name next to the .blend file and in its `textures` folder. PNG, JPEG, WebP, BMP, GIF and OpenEXR are decoded and scaled to at most 2048 pixels; the status line names images it could not find. Other nodes between a texture and the Principled BSDF (Mix, Color Ramp, ...), displacement and procedural textures are not rendered.

### Inspector

- **Thumbnail and scenes:** the preview image Blender saved and each scene's frame range.
- **Datablocks:** objects, meshes, materials, scenes and the rest, grouped by type, with a filter.
- **Struct browser:** every member of a datablock as the file's own SDNA describes it. Click a pointer to follow it; the breadcrumb leads back. **Copy as JSON** copies the open struct.
- **File facts:** Blender version, header and block header layout, compression, byte order, block totals.

Reads files from Blender 2.5 to 5.x, plain, gzip or zstd compressed. The preview reloads when the file changes on disk, for example when Blender saves it again.

The file is parsed inside the preview with the blendfile library from this repository. Nothing is uploaded and the extension has no network access. The host reads only image files (by extension) that a material names, and only to hand them to the preview.

## Use

Open a `.blend` file: the preview is the default editor for `*.blend` and `*.blend1`. To pick it explicitly, right-click a file in the Explorer and choose **Open Blend File Preview**, or use **Reopen Editor With...** from the command palette.

## Install from this repository

```sh
make vscode-package        # builds vscode-extension/blendfile-preview.vsix
code --install-extension vscode-extension/blendfile-preview.vsix
```

## Develop

| Command | What it does |
|---------|--------------|
| `make vscode-extension` | bundles `src/host` into `dist/extension.cjs` and `src/webview` into `media/preview.js` |
| `make vscode-package` | packs the `.vsix` |
| `make vscode-e2e` | installs the `.vsix` into a throwaway VS Code profile, opens every test file and checks what the preview rendered |
| `make vscode-publish` | runs `vscode-e2e`, then publishes the `.vsix` to the VS Code Marketplace and Open VSX; needs `VSCE_PAT` and `OVSX_PAT` in the environment |

`src/host/` runs in the extension host and only reads bytes through `vscode.workspace.fs`, so it also works for remote and virtual file systems. `src/webview/` parses and renders: `preview-model.ts` (inspector) and `scene-model.ts` (3D view: triangles, normals, edges, materials) hold the logic without DOM and are unit tested in `test/vscode-preview-model.test.ts`; `viewport.ts` draws with three.js. `e2e/vscode-webview.spec.ts` runs the webview page in Chromium with the same content security policy, including every shading mode and the camera view.
