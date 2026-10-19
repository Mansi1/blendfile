# 07 Special blocks

These blocks carry file-level information rather than datablocks.

## REND: render info

Readable without the SDNA, so tools can list scenes and frame ranges cheaply. Blender writes one `REND` block for the current scene and for each scene marked for background rendering (`write_renderinfo` in `writefile.cc`). The payload is Blender's `RenderInfo`:

| Offset | Type | Field |
|-------:|------|-------|
| 0 | int32 | `sfra`: first frame |
| 4 | int32 | `efra`: last frame |
| 8 | char[`MAX_ID_NAME` − 2] | scene name, NUL-terminated |

The name length depends on the Blender version, so a reader takes it as the rest of the payload. VERIFIED: the payload is 72 bytes in the Blender 4.3 fixture (64-byte name) and 264 bytes in the Blender 5.2 fixture (256-byte name).

## TEST: thumbnail

A preview image, written before `GLOB` (`write_thumb`). The payload is `BlendThumbnail`:

| Offset | Type | Field |
|-------:|------|-------|
| 0 | int32 | width |
| 4 | int32 | height |
| 8 | uint8[width × height × 4] | RGBA pixels |

Rows are stored bottom-up: Blender's own thumbnail extractor flips them (`thumb_data_vertical_flip` in `blendthumb_extract.cc`). The library returns rows top-down.

VERIFIED: the Blender 5.2 fixture, saved in background mode, has a 128 × 128 thumbnail (65,544-byte payload). The Blender 4.3 fixture, saved the same way, has none. Readers must treat the block as optional.

## GLOB: file globals

A typed block (`FileGlobal`). Selected members, VERIFIED in both fixtures:

| Member | Meaning |
|--------|---------|
| `subversion` | `BLENDER_FILE_SUBVERSION`, refines the header version |
| `minversion`, `minsubversion` | oldest Blender that can open the file |
| `curscreen`, `curscene`, `cur_view_layer` | pointers to the active screen, scene and view layer |
| `fileflags`, `globalf` | global flags |
| `build_commit_timestamp`, `build_hash` | the Blender build that wrote the file |
| `filename` | file path at save time (empty in the fixtures) |

## USER: preferences

`UserDef`, present only in `userpref.blend` and `startup.blend`.

## DNA1 and ENDB

`DNA1` holds the SDNA ([05](05-sdna.md)). `ENDB` ends the block list and has no payload.
