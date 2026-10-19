import { BlendError } from "./errors.ts";
import { decodeNulTerminatedString, isPrimitiveType, readPointerValue, readPrimitiveValue } from "./primitives.ts";
import type { ReadContext } from "./read-context.ts";
import type { Sdna, SdnaMember, SdnaStruct } from "./sdna.ts";

/** A decoded member value; `TStruct` is what the caller builds for inline structs. */
export type MemberValue<TStruct> = number | bigint | string | TStruct | MemberValue<TStruct>[];

/** Splits a flat array into nested arrays following C array dimensions (row-major). */
export function nestByArrayDimensions<T>(flatValues: T[], arrayDimensions: number[]): T[] | T[][] {
  if (arrayDimensions.length <= 1) return flatValues;
  const [outerLength = 0, ...innerDimensions] = arrayDimensions;
  const innerLength = innerDimensions.reduce((product, dimension) => product * dimension, 1);
  return Array.from({ length: outerLength }, (_, outerIndex) =>
    nestByArrayDimensions(flatValues.slice(outerIndex * innerLength, (outerIndex + 1) * innerLength), innerDimensions),
  ) as T[][];
}

const isCharArray = (member: SdnaMember) =>
  member.pointerDepth === 0 && (member.type === "char" || member.type === "uchar") && member.arrayDimensions.length > 0;

/**
 * Reads one struct member at `structOffset`. char arrays become strings, pointers bigint addresses,
 * arrays nested JS arrays, inline structs whatever `createStructView` returns.
 */
export function readMemberValue<TStruct>(
  context: ReadContext,
  sdna: Sdna,
  member: SdnaMember,
  structOffset: number,
  createStructView: (structType: SdnaStruct, byteOffset: number) => TStruct,
): MemberValue<TStruct> {
  const memberOffset = structOffset + member.offset;
  if (isCharArray(member)) {
    const stringLength = member.arrayDimensions.at(-1)!;
    const strings = Array.from({ length: member.arrayLength / stringLength }, (_, stringIndex) => {
      const stringStart = memberOffset + stringIndex * stringLength;
      return decodeNulTerminatedString(context.fileBytes.subarray(stringStart, stringStart + stringLength));
    });
    return member.arrayDimensions.length === 1 ? strings[0]! : nestByArrayDimensions(strings, member.arrayDimensions.slice(0, -1));
  }
  const elementSize = member.size / member.arrayLength;
  const readElement = (elementIndex: number): MemberValue<TStruct> => {
    const elementOffset = memberOffset + elementIndex * elementSize;
    if (member.pointerDepth > 0) return readPointerValue(context, elementOffset);
    if (isPrimitiveType(member.type)) return readPrimitiveValue(context, member.type, elementOffset);
    const structType = sdna.findStruct(member.type);
    if (!structType) throw new BlendError("UNSUPPORTED", `opaque type '${member.type}' stored inline`);
    return createStructView(structType, elementOffset);
  };
  if (member.arrayDimensions.length === 0) return readElement(0);
  return nestByArrayDimensions(Array.from({ length: member.arrayLength }, (_, elementIndex) => readElement(elementIndex)), member.arrayDimensions);
}
