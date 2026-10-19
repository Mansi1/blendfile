# Changelog

## 0.3.0

- Image textures in Material and Rendered modes: base color, metallic, roughness and normal maps from Image Texture nodes, packed or as files next to the .blend file (PNG, JPEG, WebP, OpenEXR, ...), with UV maps and Mapping nodes. The status line counts loaded textures and names missing ones.

## 0.2.0

- 3D View tab: the scene with Blender's world matrices, materials, lights, cameras and empties; wireframe, solid, material and rendered shading; Blender-style navigation and numpad views; camera view with the render frame; outliner with visibility and selection.
- Blender 5.x files: pointers resolve within their own datablock, as Blender reads them. Before, meshes could show another mesh's data.

## 0.1.0

- First version: thumbnail, scenes, datablocks with filter, struct browser with pointer following, file facts, reload on change.
