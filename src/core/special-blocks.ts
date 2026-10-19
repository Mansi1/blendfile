// VERIFIED: blocks that are not SDNA structs: REND (render info) and TEST (thumbnail) have fixed layouts of their own.
import type { Block } from "./blocks.ts";
import { BlendError } from "./errors.ts";
import { decodeNulTerminatedString } from "./primitives.ts";
import type { ReadContext } from "./read-context.ts";

export interface RenderInfo {
  sceneName: string;
  frameStart: number;
  frameEnd: number;
}

export interface Thumbnail {
  width: number;
  height: number;
  /** Top-down RGBA, 4 bytes per pixel. */
  rgba: Uint8Array;
}

/** Decodes REND blocks (Blender's `RenderInfo`: int sfra, int efra, char scene_name[]). */
export function readRenderInfo(context: ReadContext, blocks: Block[]): RenderInfo[] {
  const { view, littleEndian, fileBytes } = context;
  return blocks
    .filter((block) => block.code === "REND" && block.size >= 8)
    .map((block) => ({
      sceneName: decodeNulTerminatedString(fileBytes.subarray(block.offset + 8, block.offset + block.size)),
      frameStart: view.getInt32(block.offset, littleEndian),
      frameEnd: view.getInt32(block.offset + 4, littleEndian),
    }));
}

/** Decodes the TEST block (int width, int height, RGBA rows bottom-up) into top-down RGBA. */
export function readThumbnail(context: ReadContext, blocks: Block[]): Thumbnail | undefined {
  const block = blocks.find((candidate) => candidate.code === "TEST");
  if (!block || block.size < 8) return undefined;
  const { view, littleEndian, fileBytes } = context;
  const width = view.getInt32(block.offset, littleEndian);
  const height = view.getInt32(block.offset + 4, littleEndian);
  const rowSize = width * 4;
  if (width <= 0 || height <= 0 || 8 + rowSize * height > block.size) throw new BlendError("CORRUPT", "bad thumbnail size");
  const rgba = new Uint8Array(rowSize * height);
  for (let outputRow = 0; outputRow < height; outputRow++) {
    const storedRowStart = block.offset + 8 + (height - 1 - outputRow) * rowSize;
    rgba.set(fileBytes.subarray(storedRowStart, storedRowStart + rowSize), outputRow * rowSize);
  }
  return { width, height, rgba };
}
