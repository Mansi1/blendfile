import type { Block } from "./blocks.ts";
import { decodeNulTerminatedString, primitiveTypeSize, readPointerValue, readPrimitiveValue } from "./primitives.ts";
import type { ReadContext } from "./read-context.ts";

/** Reads a raw block of pointers, e.g. the target of `Material **mat`. */
export function readPointerArray(context: ReadContext, block: Block): bigint[] {
  const elementCount = Math.floor(block.size / context.pointerSize);
  return Array.from({ length: elementCount }, (_, index) => readPointerValue(context, block.offset + index * context.pointerSize));
}

/** Reads a raw block as consecutive primitives, e.g. `float` vertex positions. */
export function readPrimitiveArray(context: ReadContext, block: Block, typeName: string): (number | bigint)[] {
  const elementSize = primitiveTypeSize(context, typeName);
  const elementCount = Math.floor(block.size / elementSize);
  return Array.from({ length: elementCount }, (_, index) => readPrimitiveValue(context, typeName, block.offset + index * elementSize));
}

/** Reads a block holding one NUL-terminated string (the target of a `char *`). */
export function readStringPayload(context: ReadContext, block: Block): string {
  return decodeNulTerminatedString(context.fileBytes.subarray(block.offset, block.offset + block.size));
}
