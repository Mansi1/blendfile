# 03 Compression

A file is compressed as a whole: the compressed stream decompresses to exactly the uncompressed file, header included. Detection uses the first 4 bytes (`BLI_file_magic_is_gzip`, `BLI_file_magic_is_zstd`).

| Method | Magic | Written by |
|--------|-------|------------|
| gzip | `1f 8b 08` | Blender before 3.0 when "Compress" is enabled |
| zstd | `28 b5 2f fd` (zstd frame) or `5? 2a 4d 18` (skippable frame) | Blender 3.0+ when "Compress" is enabled |
| none | `42 4c 45 4e` (`BLEN`) | default |

The zstd frame magic is the little-endian integer `0xFD2FB528`; skippable frames use `0x184D2A50` to `0x184D2A5F`.

## zstd files contain many frames

VERIFIED (`input/v43_zstd.blend`): Blender writes a seekable zstd stream. The data is split into many independent zstd frames, and a final skippable frame holds a seek table, so Blender can decompress any region without reading the file from the start.

A decoder must therefore decode every frame and skip skippable frames. VERIFIED: Node.js 24 `zlib.zstdDecompressSync` and `zlib.createZstdDecompress` stop after the first frame: they returned 1,236 of 458,736 bytes for a Blender 4.3 file. The `fzstd` package decodes all frames, so the library uses it on every platform.

## gzip

The library decodes gzip files with `fflate`. VERIFIED: `input/v43_gzip.blend` is `input/v43.blend` passed through `gzip -n`. Blender 4.3 no longer writes gzip, and Blender's gzip reader decompresses the whole stream the same way, so the fixture has the layout of an old compressed file.

UNKNOWN: no gzip file written by Blender 2.x is in the fixtures.
