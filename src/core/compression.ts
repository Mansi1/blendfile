// VERIFIED: whole-file decompression. Blender compresses the entire file (gzip before 3.0, zstd since), so it happens once
// before any block is read.
import { gunzipSync } from "fflate";
import { decompress as decompressZstd } from "fzstd";
import { BlendError } from "./errors.ts";

export type CompressionMethod = "none" | "gzip" | "zstd";

/** Detects compression the way Blender's `BLI_file_magic_is_gzip|zstd` do. */
export function detectCompressionMethod(bytes: Uint8Array): CompressionMethod {
  const [byte0 = 0, byte1, byte2, byte3] = bytes;
  if (byte0 === 0x1f && byte1 === 0x8b && byte2 === 0x08) return "gzip";
  // zstd frame 0xFD2FB528 or skippable frame 0x184D2A5? (both little endian).
  if (byte0 === 0x28 && byte1 === 0xb5 && byte2 === 0x2f && byte3 === 0xfd) return "zstd";
  if ((byte0 & 0xf0) === 0x50 && byte1 === 0x2a && byte2 === 0x4d && byte3 === 0x18) return "zstd";
  return "none";
}

/**
 * Returns the uncompressed file. fzstd is used instead of node:zlib because Blender writes
 * multi-frame zstd and Node's decoder stops after the first frame.
 */
export function decompressFileBytes(bytes: Uint8Array): { uncompressedBytes: Uint8Array; compressionMethod: CompressionMethod } {
  const compressionMethod = detectCompressionMethod(bytes);
  try {
    if (compressionMethod === "gzip") return { uncompressedBytes: gunzipSync(bytes), compressionMethod };
    if (compressionMethod === "zstd") return { uncompressedBytes: decompressZstd(bytes), compressionMethod };
  } catch (error) {
    throw new BlendError("CORRUPT", `${compressionMethod} decompression failed: ${(error as Error).message}`);
  }
  return { uncompressedBytes: bytes, compressionMethod };
}
