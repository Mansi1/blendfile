# The .blend file format

This folder is a written specification of the Blender `.blend` file format, as read by the `blendfile` library.

Blender publishes no standalone specification. The format is defined by the C++ code that reads and writes it. These pages describe that code's behavior in prose and tables. They also record what was observed in files written by Blender 4.3.0 and Blender 5.2.2.

| Page | Content |
|------|---------|
| [01 File structure](01-file-structure.md) | The layers of a file, from bytes to datablocks |
| [02 File header](02-file-header.md) | The 12-byte legacy header and the 17-byte header of Blender 5.0+ |
| [03 Compression](03-compression.md) | gzip and zstd wrapping of the whole file |
| [04 Block headers](04-block-headers.md) | `BHead4`, `SmallBHead8`, `LargeBHead8` and block codes |
| [05 SDNA](05-sdna.md) | The `DNA1` block: the type catalog every file carries |
| [06 Struct data and pointers](06-struct-data-and-pointers.md) | Reading members, arrays, pointers, `ListBase`, strings |
| [07 Special blocks](07-special-blocks.md) | `REND`, `TEST`, `GLOB`, `USER`, `ENDB` |
| [08 Datablocks](08-datablocks.md) | ID codes, the `ID` struct and where common data lives |
| [09 Scenes and geometry](09-scenes-and-geometry.md) | Visibility, object transforms, mesh faces, materials, lights, cameras: what a 3D viewer needs |

## Evidence levels

Claims carry one of three marks:

- **VERIFIED**: read in Blender source at the revision below, or observed in the test fixtures under `input/`.
- **HYPOTHESIS**: inferred and testable, with the test that would settle it.
- **UNKNOWN**: not established; the page says what is missing.

## Sources

Blender source, branch `main` at commit `3fe0f2ab2a29` (2026-10-17):

| File | Defines |
|------|---------|
| `source/blender/blenloader_core/BLO_core_blend_header.hh` | file header layouts |
| `source/blender/blenloader_core/intern/blo_core_blend_header.cc` | header decoding |
| `source/blender/blenloader_core/BLO_core_bhead.hh` | block header layouts and block codes |
| `source/blender/blenloader_core/intern/blo_core_bhead.cc` | block header decoding |
| `source/blender/blenloader_core/intern/blo_core_file_reader.cc` | compression detection |
| `source/blender/blenlib/intern/fileops_c.cc` | gzip and zstd magic numbers |
| `source/blender/makesdna/intern/dna_genfile.cc` | SDNA encoding and decoding |
| `source/blender/makesdna/DNA_sdna_types.h` | `SDNA_Struct`, raw data index |
| `source/blender/makesdna/intern/dna_rename_defs.h` | stored names versus runtime names |
| `source/blender/blenloader/intern/readfile.cc` | per-datablock address resolution (`read_data_into_datamap`) |
| `source/blender/blenkernel/intern/object.cc` | object matrices (`BKE_object_to_mat4`, `solve_parenting`) |
| `source/blender/blenlib/intern/math_rotation_c.cc` | Euler orders (`eulO_to_mat3`) |
| `source/blender/makesdna/DNA_object_types.h`, `DNA_layer_types.h`, `DNA_collection_types.h`, `DNA_light_types.h`, `DNA_camera_types.h`, `DNA_action_types.h` | type codes and visibility flags |
| `source/blender/makesdna/DNA_ID_enums.h` | 2-letter ID codes |
| `source/blender/blenloader/intern/readfile.cc` | endianness handling, file reading |
| `source/blender/blenloader/intern/writefile.cc` | `RenderInfo` and thumbnail writing |
| `source/blender/blenkernel/BKE_main.hh` | `BlendThumbnail` |
| `source/blender/blendthumb/src/blendthumb_extract.cc` | thumbnail row order |

Browse them at `https://projects.blender.org/blender/blender/src/commit/3fe0f2ab2a29/<file>`. The Blender 5.0 release notes (`https://developer.blender.org/docs/release_notes/5.0/core/`) announce the header change.

Fixtures: `tools/make_fixtures.py` builds `input/v43*.blend` with Blender 4.3.0 and `input/v52*.blend` with Blender 5.2.2. The same script writes each file's expected values to `input/*.truth.json` through Blender's Python API.
