import { BlendError } from "./errors.ts";
import type { FileHeader } from "./header.ts";

/** One file block: a BHead plus its payload. */
export interface Block {
  /** 'DATA', 'DNA1', 'ENDB', 'REND', 'TEST', 'GLOB', 'USER', or a 2-letter ID code like 'OB'. */
  code: string;
  /** Index into SDNA structs describing the payload; 0 = raw bytes. */
  sdnaIndex: number;
  /** Memory address the payload had when saved; pointers in other blocks refer to it. */
  address: bigint;
  /** Payload size in bytes. */
  size: number;
  /** Number of structs stored in the payload. */
  count: number;
  /** Offset of the BHead in the uncompressed file. */
  headerOffset: number;
  /** Offset of the payload in the uncompressed file. */
  offset: number;
}

const BLOCK_HEADER_SIZE = { BHead4: 20, SmallBHead8: 24, LargeBHead8: 32 } as const;

/** Block codes that are not datablocks (IDs). */
const NON_DATABLOCK_CODES = new Set(["DATA", "DNA1", "ENDB", "REND", "TEST", "GLOB", "USER"]);

/** True for blocks that start a datablock (2-letter ID code such as `OB`). */
export const isDatablockBlock = (block: Block) => !NON_DATABLOCK_CODES.has(block.code);

/**
 * The ID code of a datablock block. Screens are written with block code `SN` but their ID code
 * (and name prefix) is `SR`; Blender patches the code on read the same way (readfile.cc).
 */
export const datablockIdCode = (block: Block) => (block.code === "SN" ? "SR" : block.code);

const toSafeNumber = (value: bigint, what: string, headerOffset: number) => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new BlendError("CORRUPT", `bad ${what} at ${headerOffset}`);
  return Number(value);
};

/** Reads every block header up to and including ENDB. */
export function readBlockList(fileBytes: Uint8Array, header: FileHeader): Block[] {
  const view = new DataView(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength);
  const { littleEndian, blockHeaderLayout } = header;
  const blockHeaderSize = BLOCK_HEADER_SIZE[blockHeaderLayout];
  const blocks: Block[] = [];
  let headerOffset = header.size;
  for (;;) {
    if (headerOffset + 4 > fileBytes.length) throw new BlendError("CORRUPT", "file ends before ENDB block");
    const code = String.fromCharCode(...fileBytes.subarray(headerOffset, headerOffset + 4)).replace(/\0+$/, "");
    if (headerOffset + blockHeaderSize > fileBytes.length) {
      // Blender accepts a truncated ENDB header.
      if (code === "ENDB") {
        blocks.push({ code, sdnaIndex: 0, address: 0n, size: 0, count: 0, headerOffset, offset: fileBytes.length });
        return blocks;
      }
      throw new BlendError("CORRUPT", `truncated block header at ${headerOffset}`);
    }
    let sdnaIndex: number, address: bigint, size: number, count: number;
    if (blockHeaderLayout === "LargeBHead8") {
      sdnaIndex = view.getInt32(headerOffset + 4, littleEndian);
      address = view.getBigUint64(headerOffset + 8, littleEndian);
      size = toSafeNumber(view.getBigInt64(headerOffset + 16, littleEndian), "block size", headerOffset);
      count = toSafeNumber(view.getBigInt64(headerOffset + 24, littleEndian), "block count", headerOffset);
    } else {
      const pointerSize = blockHeaderLayout === "BHead4" ? 4 : 8;
      size = view.getInt32(headerOffset + 4, littleEndian);
      address = pointerSize === 4 ? BigInt(view.getUint32(headerOffset + 8, littleEndian)) : view.getBigUint64(headerOffset + 8, littleEndian);
      sdnaIndex = view.getInt32(headerOffset + 8 + pointerSize, littleEndian);
      count = view.getInt32(headerOffset + 12 + pointerSize, littleEndian);
    }
    const offset = headerOffset + blockHeaderSize;
    if (size < 0 || offset + size > fileBytes.length) throw new BlendError("CORRUPT", `block '${code}' at ${headerOffset} overruns file`);
    blocks.push({ code, sdnaIndex, address, size, count, headerOffset, offset });
    if (code === "ENDB") return blocks;
    headerOffset = offset + size;
  }
}

/** Maps each saved address to its block; the first block wins when an address repeats. */
export function indexBlocksByAddress(blocks: Block[]): Map<bigint, Block> {
  const blocksByAddress = new Map<bigint, Block>();
  for (const block of blocks) {
    if (block.address !== 0n && !blocksByAddress.has(block.address)) blocksByAddress.set(block.address, block);
  }
  return blocksByAddress;
}

/** Finds the block at a saved address, seen from a pointer stored at `referencingOffset` in the file. */
export type AddressResolver = (address: bigint, referencingOffset?: number) => Block | undefined;

/**
 * Resolves saved addresses the way Blender's reader does. DATA blocks belong to the nearest non-DATA block
 * before them (a datablock, or GLOB, USER and the like), and a pointer stored inside that group resolves to
 * the group's own DATA blocks first; other addresses resolve to non-DATA blocks (pointers to datablocks).
 * Blender 5.x reuses DATA addresses across datablocks, so a single file-wide map picks the wrong block.
 * Without `referencingOffset`, non-DATA blocks win, then the first DATA block with the address.
 */
export function createAddressResolver(blocks: Block[]): AddressResolver {
  const ownerIndexOfBlock = new Int32Array(blocks.length);
  const dataBlocksByOwner = new Map<number, Map<bigint, Block>>();
  const ownerBlocksByAddress = new Map<bigint, Block>();
  let ownerIndex = -1;
  blocks.forEach((block, index) => {
    if (block.code !== "DATA") {
      ownerIndex = index;
      if (block.address !== 0n && !ownerBlocksByAddress.has(block.address)) ownerBlocksByAddress.set(block.address, block);
    } else if (block.address !== 0n) {
      const groupBlocks = dataBlocksByOwner.get(ownerIndex) ?? new Map<bigint, Block>();
      if (!groupBlocks.has(block.address)) groupBlocks.set(block.address, block);
      dataBlocksByOwner.set(ownerIndex, groupBlocks);
    }
    ownerIndexOfBlock[index] = ownerIndex;
  });
  const firstBlockByAddress = indexBlocksByAddress(blocks);

  /** Index of the block whose header or payload contains `fileOffset` (blocks are in file order). */
  const findBlockIndexAtOffset = (fileOffset: number) => {
    let low = 0;
    let high = blocks.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const block = blocks[middle]!;
      if (fileOffset < block.headerOffset) high = middle - 1;
      else if (fileOffset >= block.offset + block.size) low = middle + 1;
      else return middle;
    }
    return -1;
  };

  return (address, referencingOffset) => {
    if (address === 0n) return undefined;
    if (referencingOffset !== undefined) {
      const blockIndex = findBlockIndexAtOffset(referencingOffset);
      const groupBlock = blockIndex < 0 ? undefined : dataBlocksByOwner.get(ownerIndexOfBlock[blockIndex]!)?.get(address);
      if (groupBlock) return groupBlock;
    }
    return ownerBlocksByAddress.get(address) ?? firstBlockByAddress.get(address);
  };
}
