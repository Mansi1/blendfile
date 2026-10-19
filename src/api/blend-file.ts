// VERIFIED: entry point of the library. It decompresses the bytes and decodes header, block list and SDNA once when the file is
// opened; struct members are read on demand, and pointers resolve through an address map built from the block list.
import { readPointerArray, readPrimitiveArray, readStringPayload } from "../core/block-payloads.ts";
import { type AddressResolver, type Block, createAddressResolver, datablockIdCode, isDatablockBlock, readBlockList } from "../core/blocks.ts";
import { type CompressionMethod, decompressFileBytes } from "../core/compression.ts";
import { BlendError } from "../core/errors.ts";
import { type FileHeader, decodeFileHeader } from "../core/header.ts";
import { type ReadContext, createReadContext } from "../core/read-context.ts";
import { type Sdna, type SdnaStruct, decodeSdna } from "../core/sdna.ts";
import { type RenderInfo, type Thumbnail, readRenderInfo, readThumbnail } from "../core/special-blocks.ts";
import { BlendStruct } from "./blend-struct.ts";

/** Parses a whole .blend file (plain, gzip or zstd) held in memory. Works in browsers and Node. */
export function parseBlendFile(input: Uint8Array | ArrayBuffer): BlendFile {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const { uncompressedBytes, compressionMethod } = decompressFileBytes(bytes);
  return new BlendFile(uncompressedBytes, compressionMethod);
}

/** An opened .blend file: header, blocks, SDNA, and navigation from datablocks to their data. */
export class BlendFile {
  readonly header: FileHeader;
  readonly blocks: Block[];
  readonly sdna: Sdna;
  readonly readContext: ReadContext;
  private readonly resolveAddress: AddressResolver;

  constructor(
    /** The uncompressed file. */
    readonly fileBytes: Uint8Array,
    readonly compressionMethod: CompressionMethod = "none",
  ) {
    this.header = decodeFileHeader(fileBytes);
    this.blocks = readBlockList(fileBytes, this.header);
    this.readContext = createReadContext(fileBytes, this.header);
    const sdnaBlock = this.blocks.find((block) => block.code === "DNA1");
    if (!sdnaBlock) throw new BlendError("CORRUPT", "no DNA1 block");
    this.sdna = decodeSdna(fileBytes.subarray(sdnaBlock.offset, sdnaBlock.offset + sdnaBlock.size), this.header.littleEndian);
    this.resolveAddress = createAddressResolver(this.blocks);
  }

  /** Blender version that wrote the file, e.g. "5.2". */
  get blenderVersion(): string {
    return `${Math.floor(this.header.fileVersion / 100)}.${this.header.fileVersion % 100}`;
  }

  /**
   * The block whose saved address is `address` (pointers in structs hold these addresses).
   * Pass the file offset the pointer was read from: Blender 5.x reuses data addresses across datablocks,
   * and the pointer's own datablock decides which block is meant. BlendStruct does this for you.
   */
  findBlockByAddress(address: bigint, referencingOffset?: number): Block | undefined {
    return this.resolveAddress(address, referencingOffset);
  }

  /** The SDNA struct describing a block's payload, or undefined for raw data (SDNA index 0). */
  structTypeOfBlock(block: Block): SdnaStruct | undefined {
    return block.sdnaIndex === 0 ? undefined : this.sdna.structs[block.sdnaIndex];
  }

  /** Every struct stored in a block (a block holds `count` structs), typed by its SDNA index or `structType`. */
  readStructsInBlock(block: Block, structType = this.structTypeOfBlock(block)): BlendStruct[] {
    if (!structType) throw new BlendError("CORRUPT", `block '${block.code}' at ${block.headerOffset} has no struct type`);
    const structCount = structType.size === 0 ? 0 : Math.min(block.count, Math.floor(block.size / structType.size));
    return Array.from({ length: structCount }, (_, index) => new BlendStruct(this, structType, block.offset + index * structType.size));
  }

  /** Datablocks (objects, meshes, scenes …), optionally only those with a 2-letter code like "OB". */
  listDatablocks(idCode?: string): BlendStruct[] {
    return this.blocks
      .filter((block) => isDatablockBlock(block) && (idCode === undefined || datablockIdCode(block) === idCode))
      .map((block) => this.readStructsInBlock(block)[0]!);
  }

  /** The datablock with this code and name (without the 2-letter prefix), e.g. `findDatablock("OB", "Cube")`. */
  findDatablock(idCode: string, name: string): BlendStruct | undefined {
    return this.listDatablocks(idCode).find((datablock) => datablock.datablockName === name);
  }

  /**
   * Follows a pointer to the struct(s) at `address`, typed by the target block's SDNA index or by
   * `structTypeName` for raw blocks. Null pointers and unknown addresses give [].
   */
  resolvePointer(address: bigint, structTypeName?: string, referencingOffset?: number): BlendStruct[] {
    const block = this.findBlockByAddress(address, referencingOffset);
    if (!block) return [];
    const structType = structTypeName === undefined ? this.structTypeOfBlock(block) : this.sdna.findStruct(structTypeName);
    return structType ? this.readStructsInBlock(block, structType) : [];
  }

  /** Reads the pointer array at `address`, e.g. the target of `Material **mat`. */
  readPointerArrayAt(address: bigint, referencingOffset?: number): bigint[] {
    const block = this.findBlockByAddress(address, referencingOffset);
    return block ? readPointerArray(this.readContext, block) : [];
  }

  /** Reads the primitive array at `address`, e.g. `readPrimitiveArrayAt(pointer, "float")`. */
  readPrimitiveArrayAt(address: bigint, typeName: string, referencingOffset?: number): (number | bigint)[] {
    const block = this.findBlockByAddress(address, referencingOffset);
    return block ? readPrimitiveArray(this.readContext, block, typeName) : [];
  }

  /** Reads the string a `char *` member points to. */
  readStringAt(address: bigint, referencingOffset?: number): string | undefined {
    const block = this.findBlockByAddress(address, referencingOffset);
    return block ? readStringPayload(this.readContext, block) : undefined;
  }

  /** Scene name and frame range from REND blocks. */
  readRenderInfo(): RenderInfo[] {
    return readRenderInfo(this.readContext, this.blocks);
  }

  /** The preview image (TEST block) as top-down RGBA, if the file has one. */
  readThumbnail(): Thumbnail | undefined {
    return readThumbnail(this.readContext, this.blocks);
  }
}
