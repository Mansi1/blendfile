import type { FileHeader } from "./header.ts";

/** What every value reader needs: the uncompressed bytes and how to interpret them. */
export interface ReadContext {
  fileBytes: Uint8Array;
  view: DataView;
  littleEndian: boolean;
  pointerSize: 4 | 8;
}

export function createReadContext(fileBytes: Uint8Array, header: FileHeader): ReadContext {
  return {
    fileBytes,
    view: new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength),
    littleEndian: header.littleEndian,
    pointerSize: header.pointerSize,
  };
}
