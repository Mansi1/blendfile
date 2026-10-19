# 04 Block headers

After the file header come blocks, each a block header (`BHead`) followed by its payload. The next block header starts right after the payload: there is no padding. Reading stops at the block with code `ENDB`.

## The three layouts

All integers use the file's byte order. Sizes in bytes.

**`BHead4`**: 20 bytes, format 0 with 4-byte pointers.

| Offset | Type | Field |
|-------:|------|-------|
| 0 | char[4] | `code` |
| 4 | int32 | `len`: payload size |
| 8 | uint32 | `old`: saved address |
| 12 | int32 | `SDNAnr`: struct index |
| 16 | int32 | `nr`: struct count |

**`SmallBHead8`**: 24 bytes, format 0 with 8-byte pointers.

| Offset | Type | Field |
|-------:|------|-------|
| 0 | char[4] | `code` |
| 4 | int32 | `len` |
| 8 | uint64 | `old` |
| 16 | int32 | `SDNAnr` |
| 20 | int32 | `nr` |

**`LargeBHead8`**: 32 bytes, format 1 (Blender 5.0+).

| Offset | Type | Field |
|-------:|------|-------|
| 0 | char[4] | `code` |
| 4 | int32 | `SDNAnr` |
| 8 | uint64 | `old` |
| 16 | int64 | `len` |
| 24 | int64 | `nr` |

`LargeBHead8` moves `SDNAnr` forward so that the 64-bit fields stay 8-byte aligned. Blender changed the layout in 5.0 so that one block can hold more than 2 GiB, for meshes with hundreds of millions of vertices.

## Fields

- **`code`**: 4 bytes that name the block. Block codes spell 4 ASCII letters. ID codes use 2 letters followed by two zero bytes (`O B \0 \0`). The bytes are stored in reading order in both byte orders, so a reader takes them as characters without swapping.
- **`len`**: payload size in bytes.
- **`old`**: the memory address the payload had in the writing Blender. Pointers inside other payloads hold these values (see [06](06-struct-data-and-pointers.md)). It is unique across the file, except for `DATA` blocks, which only need to be unique within the datablock they belong to.
- **`SDNAnr`**: index into the SDNA struct table describing the payload. 0 means raw bytes.
- **`nr`**: number of structs in the payload. `len` = `nr` × struct size for typed blocks.

## Block codes

| Code | Meaning |
|------|---------|
| `DATA` | memory owned by the preceding datablock |
| `DNA1` | the SDNA type catalog ([05](05-sdna.md)) |
| `REND` | scene name and frame range ([07](07-special-blocks.md)) |
| `TEST` | thumbnail image ([07](07-special-blocks.md)) |
| `GLOB` | `FileGlobal`: version details, current scene and screen ([07](07-special-blocks.md)) |
| `USER` | `UserDef`: preferences, only in startup and preference files |
| `ENDB` | end of file, no payload |
| 2 letters | start of a datablock with that ID code ([08](08-datablocks.md)) |
| `SN` | start of a screen datablock; its ID code is `SR` (see below) |

## Edge cases

- Screens (`bScreen`) are written with block code `SN`, but their ID code and name prefix are `SR`. Blender rewrites `SN` to `SR` when reading (`readfile.cc`: "in 2.50+ files, the file identifier for screens is patched"). VERIFIED: the fixtures contain 11 `SN` blocks whose names start with `SR`.

- Blender accepts an `ENDB` block header cut short by the end of the file (`BLO_readfile_read_bhead` returns the header if its code is `ENDB` even when the read was short). The library does the same.
- A payload that extends past the end of the file means the file is corrupt.
- Blender converts 64-bit `old` values to 32 bits when a 32-bit build reads a 64-bit file (`uint32_from_uint64_ptr`: shift right by 3, keep the low 32 bits). A JavaScript reader keeps the full 64-bit values as `bigint` and never needs this.
