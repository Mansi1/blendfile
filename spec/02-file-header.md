# 02 File header

The uncompressed stream starts with one of two headers. Both begin with the 7 ASCII bytes `BLENDER`. The byte after them tells the two apart: `_` or `-` means format 0, an ASCII digit means format 1.

## Format 0: 12 bytes (Blender up to 4.x)

| Offset | Size | Content |
|-------:|-----:|---------|
| 0 | 7 | `BLENDER` |
| 7 | 1 | `_` = 4-byte pointers, `-` = 8-byte pointers |
| 8 | 1 | `v` = little endian, `V` = big endian |
| 9 | 3 | file version as 3 ASCII digits, e.g. `403` for Blender 4.3 |

Example (VERIFIED, `input/v43.blend`): `BLENDER-v403`, which means 8-byte pointers, little endian, version 4.3.

The block header layout follows from the pointer size: `BHead4` for 4-byte pointers and `SmallBHead8` for 8-byte pointers.

## Format 1: 17 bytes (Blender 5.0+)

| Offset | Size | Content |
|-------:|-----:|---------|
| 0 | 7 | `BLENDER` |
| 7 | 2 | header size as ASCII digits, always `17` |
| 9 | 1 | `-` |
| 10 | 2 | format version as ASCII digits, always `01` |
| 12 | 1 | `v` (little endian) |
| 13 | 4 | file version as 4 ASCII digits, e.g. `0502` for Blender 5.2 |

Example (VERIFIED, `input/v52.blend`): `BLENDER17-01v0502`.

Format 1 always means 8-byte pointers, little endian and the `LargeBHead8` block header. The header size field exists so that future formats can grow the header; a reader that sees a size other than `17` cannot decode the file.

## Decoding rules

The rules mirror `BLO_readfile_blender_header_decode`:

1. Fewer than 12 bytes, or no `BLENDER` prefix: not a Blender file.
2. Byte 7 is `_` or `-`: format 0. Byte 8 must be `v` or `V` and bytes 9–11 must be digits, else the file is a Blender file of an unknown variant.
3. Otherwise bytes 7–8 must be digits equal to `17`, byte 9 `-`, bytes 10–11 `01`, byte 12 `v`, bytes 13–16 digits; anything else is a Blender file of an unknown variant.

Blender distinguishes "not a Blender file" from "a Blender file this version cannot read". The library reports the first as `BlendError` code `NOT_BLEND` and the second as `UNSUPPORTED`.

## File version and subversion

The header version is `BLENDER_FILE_VERSION` (major × 100 + minor). The finer subversion and the minimum version needed to open the file are stored in the `GLOB` block (see [07](07-special-blocks.md)).
