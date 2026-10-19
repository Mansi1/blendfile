# 08 Datablocks

A datablock (an "ID") is a top-level thing a user sees in Blender: an object, mesh, material, scene. Its block has a 2-letter code and holds one struct whose first member is `ID id`. The `DATA` blocks after it hold memory the datablock owns: arrays, strings, list elements.

## The ID header

Every datablock struct starts with `ID`. Its members include:

| Member | Meaning |
|--------|---------|
| `name` | char array: the 2-letter code followed by the user-visible name, e.g. `OBCube` |
| `*lib` | library the datablock is linked from, or null when local |
| `us` | user count |
| `flag`, `tag` | state flags |
| `*properties` | custom properties (`IDProperty` tree) |

Blender 5.x enlarged `ID`. VERIFIED: `Object.adt`, the member after `ID id`, sits at offset 208 in the 4.3 fixture and 408 in the 5.2 fixture.

## ID codes

From `DNA_ID_enums.h`:

| Code | Struct | | Code | Struct |
|------|--------|-|------|--------|
| `SC` | Scene | | `GR` | Collection |
| `OB` | Object | | `AR` | bArmature |
| `ME` | Mesh | | `AC` | bAction |
| `CU` | Curve (legacy) | | `NT` | bNodeTree |
| `MB` | MetaBall | | `BR` | Brush |
| `MA` | Material | | `PA` | ParticleSettings |
| `TE` | Tex | | `GD` | bGPdata (legacy Grease Pencil) |
| `IM` | Image | | `WM` | wmWindowManager |
| `LT` | Lattice | | `MC` | MovieClip |
| `LA` | Light | | `MS` | Mask |
| `CA` | Camera | | `LS` | FreestyleLineStyle |
| `KE` | Key (shape keys) | | `PL` | Palette |
| `WO` | World | | `PC` | PaintCurve |
| `SR` | bScreen (block code `SN`) | | `CF` | CacheFile |
| `VF` | VFont | | `WS` | WorkSpace |
| `TX` | Text | | `LP` | LightProbe |
| `SK` | Speaker | | `CV` | Curves |
| `SO` | Sound | | `PT` | PointCloud |
| `LI` | Library | | `VO` | Volume |
| | | | `GP` | Grease Pencil |

## Where common data lives

VERIFIED against Blender's Python API values in `input/*.truth.json`:

| Data | Path in Blender 4.3 | Path in Blender 5.2 |
|------|---------------------|---------------------|
| Object location | `Object.loc[3]` | same |
| Object scale | `Object.size[3]` (stored name of `scale`) | same |
| Object data (mesh, camera ...) | `Object.*data` | same |
| Scene frame range | `Scene.r.sfra`, `Scene.r.efra` | same |
| Render resolution | `Scene.r.xsch`, `Scene.r.ysch` | same |
| Material base color | `Material.r`, `.g`, `.b`, `.a` | same |
| Mesh vertex count | `Mesh.totvert` | same |
| Mesh face count | `Mesh.totpoly` | same |
| Mesh materials | `Mesh.**mat`, `Mesh.totcol` | same |
| Vertex positions | `Mesh.vdata.layers[]` with `name == "position"`, `data` → `vec3f[totvert]` | `Mesh.attribute_storage.dna_attributes[]` with `*name == "position"`, `data` → `AttributeArray`, its `data` → `float[totvert × 3]` |
| View layers | `Scene.view_layers` (ListBase of `ViewLayer`) | same |

The positions row shows why version-independent code needs the SDNA and also some knowledge of Blender's data model. The format stays the same, but where Blender keeps a value changes between releases. Files from before Blender 3.4 keep positions in `Mesh.mvert` (an `MVert` array with `co[3]`). UNKNOWN: no such file is in the fixtures.

## A small Blender 5.2 file

The `input/v52.blend` fixture (518 KB uncompressed, 1,163 blocks) holds:

| Block code | Count | What |
|------|------:|------|
| `WM` | 1 | window manager |
| `WS` | 11 | workspaces |
| `SN` | 11 | screens (ID code `SR`) |
| `SC` | 1 | scene |
| `OB` | 2 | objects |
| `ME` | 1 | mesh |
| `MA` | 1 | material |
| `DATA` | most | owned arrays, strings, list elements |

Most of the file is user-interface state (screens, areas, regions), not scene data.
