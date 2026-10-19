import { BlendError } from "./errors.ts";
import type { ReadContext } from "./read-context.ts";

/** SDNA type names that hold a single number; everything else is a struct or opaque. */
const PRIMITIVE_TYPE_SIZES: Record<string, number | "pointer"> = {
  char: 1, uchar: 1, bool: 1, int8_t: 1,
  short: 2, ushort: 2,
  int: 4, uint: 4, float: 4,
  double: 8, int64_t: 8, uint64_t: 8,
  // `long` is pointer sized in DNA.
  long: "pointer", ulong: "pointer",
};

export const isPrimitiveType = (typeName: string) => typeName in PRIMITIVE_TYPE_SIZES;

export function primitiveTypeSize(context: ReadContext, typeName: string): number {
  const size = PRIMITIVE_TYPE_SIZES[typeName];
  if (size === undefined) throw new BlendError("UNSUPPORTED", `'${typeName}' is not a primitive type`);
  return size === "pointer" ? context.pointerSize : size;
}

/** Reads one primitive at `byteOffset`; 64-bit integers come back as bigint. */
export function readPrimitiveValue(context: ReadContext, typeName: string, byteOffset: number): number | bigint {
  const { view, littleEndian } = context;
  const pointerSized64 = context.pointerSize === 8;
  switch (typeName) {
    case "char": case "uchar": case "bool": return view.getUint8(byteOffset); // SDNA chars are unsigned
    case "int8_t": return view.getInt8(byteOffset);
    case "short": return view.getInt16(byteOffset, littleEndian);
    case "ushort": return view.getUint16(byteOffset, littleEndian);
    case "int": return view.getInt32(byteOffset, littleEndian);
    case "uint": return view.getUint32(byteOffset, littleEndian);
    case "float": return view.getFloat32(byteOffset, littleEndian);
    case "double": return view.getFloat64(byteOffset, littleEndian);
    case "long": return pointerSized64 ? view.getBigInt64(byteOffset, littleEndian) : view.getInt32(byteOffset, littleEndian);
    case "ulong": return pointerSized64 ? view.getBigUint64(byteOffset, littleEndian) : view.getUint32(byteOffset, littleEndian);
    case "int64_t": return view.getBigInt64(byteOffset, littleEndian);
    case "uint64_t": return view.getBigUint64(byteOffset, littleEndian);
  }
  throw new BlendError("UNSUPPORTED", `cannot read type '${typeName}'`);
}

/** Reads a saved address (pointer); `0n` is null. */
export function readPointerValue(context: ReadContext, byteOffset: number): bigint {
  return context.pointerSize === 8
    ? context.view.getBigUint64(byteOffset, context.littleEndian)
    : BigInt(context.view.getUint32(byteOffset, context.littleEndian));
}

const utf8Decoder = new TextDecoder();

/** Decodes bytes as UTF-8 up to the first NUL byte. */
export function decodeNulTerminatedString(bytes: Uint8Array): string {
  const terminator = bytes.indexOf(0);
  return utf8Decoder.decode(terminator < 0 ? bytes : bytes.subarray(0, terminator));
}
