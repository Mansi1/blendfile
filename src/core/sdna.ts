import { BlendError } from "./errors.ts";

/** One member of an SDNA struct, with its decoded C declarator. */
export interface SdnaMember {
  /** Bare identifier, e.g. `next` for `*next`, `mat` for `mat[4][4]`. */
  name: string;
  /** Declarator exactly as stored in the file, e.g. `*next`, `(*func)()`, `mat[4][4]`. */
  declarator: string;
  /** Type name, e.g. `float`, `ListBase`, `Object`. */
  type: string;
  /** Number of `*` in the declarator (0 = stored inline). */
  pointerDepth: number;
  isFunctionPointer: boolean;
  /** Array dimensions, e.g. [4, 4]; empty for scalars. */
  arrayDimensions: number[];
  /** Product of the array dimensions (1 for scalars). */
  arrayLength: number;
  /** Bytes taken by this member inside the struct. */
  size: number;
  /** Byte offset inside the struct. */
  offset: number;
}

export interface SdnaStruct {
  index: number;
  name: string;
  size: number;
  members: SdnaMember[];
  findMember(name: string): SdnaMember | undefined;
}

/** The decoded DNA1 block: every type the file knows about. */
export interface Sdna {
  pointerSize: 4 | 8;
  /** All member declarators (the NAME table). */
  memberDeclarators: string[];
  /** All type names (the TYPE table). */
  typeNames: string[];
  /** Size in bytes of each type (the TLEN table), parallel to `typeNames`. */
  typeSizes: number[];
  /** Struct definitions (the STRC table); index = block SDNA index. */
  structs: SdnaStruct[];
  findStruct(name: string): SdnaStruct | undefined;
}

const DECLARATOR_PATTERN = /^(\(?)(\**)([A-Za-z_]\w*)\)?(\([^)]*\))?((?:\[\d+\])*)$/;

/** Splits a C declarator like `*next`, `(*func)()` or `mat[4][4]` into its parts. */
export function parseMemberDeclarator(declarator: string) {
  const match = DECLARATOR_PATTERN.exec(declarator);
  if (!match) throw new BlendError("CORRUPT", `unparsable SDNA member '${declarator}'`);
  const [, openParenthesis, stars = "", name = "", parameterList, arraySuffix = ""] = match;
  const arrayDimensions = [...arraySuffix.matchAll(/\[(\d+)\]/g)].map((dimension) => Number(dimension[1]));
  return {
    name,
    pointerDepth: stars.length,
    isFunctionPointer: openParenthesis === "(" && parameterList !== undefined,
    arrayDimensions,
    arrayLength: arrayDimensions.reduce((product, dimension) => product * dimension, 1),
  };
}

/** Decodes a DNA1 payload; mirrors `init_structDNA` in Blender's dna_genfile.cc. */
export function decodeSdna(payload: Uint8Array, littleEndian: boolean): Sdna {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const textDecoder = new TextDecoder();
  let cursor = 0;

  const ensureAvailable = (byteCount: number) => {
    if (cursor + byteCount > payload.length) throw new BlendError("CORRUPT", "SDNA block truncated");
  };
  const expectTag = (expectedTag: string) => {
    ensureAvailable(4);
    const actualTag = String.fromCharCode(...payload.subarray(cursor, cursor + 4));
    if (actualTag !== expectedTag) throw new BlendError("CORRUPT", `SDNA: expected '${expectedTag}', got '${actualTag}'`);
    cursor += 4;
  };
  const readInt32 = () => {
    ensureAvailable(4);
    cursor += 4;
    return view.getInt32(cursor - 4, littleEndian);
  };
  const readInt16 = () => {
    ensureAvailable(2);
    cursor += 2;
    return view.getInt16(cursor - 2, littleEndian);
  };
  // Alignment is relative to the payload start: Blender aligns inside its own read buffer.
  const alignCursorTo4 = () => {
    cursor = (cursor + 3) & ~3;
  };
  const readStrings = (stringCount: number) => {
    const strings: string[] = [];
    for (let index = 0; index < stringCount; index++) {
      const terminator = payload.indexOf(0, cursor);
      if (terminator < 0) throw new BlendError("CORRUPT", "SDNA string not terminated");
      strings.push(textDecoder.decode(payload.subarray(cursor, terminator)));
      cursor = terminator + 1;
    }
    return strings;
  };

  expectTag("SDNA");
  expectTag("NAME");
  const memberDeclarators = readStrings(readInt32());
  alignCursorTo4();
  expectTag("TYPE");
  const typeNames = readStrings(readInt32());
  alignCursorTo4();
  expectTag("TLEN");
  const typeSizes = typeNames.map(() => readInt16());
  alignCursorTo4();
  expectTag("STRC");
  const structCount = readInt32();
  const encodedStructs: { typeIndex: number; members: { typeIndex: number; declaratorIndex: number }[] }[] = [];
  for (let structIndex = 0; structIndex < structCount; structIndex++) {
    const typeIndex = readInt16();
    const memberCount = readInt16();
    const members = Array.from({ length: memberCount }, () => ({ typeIndex: readInt16(), declaratorIndex: readInt16() }));
    if (typeIndex < 0 || typeIndex >= typeNames.length) throw new BlendError("CORRUPT", `SDNA struct ${structIndex} has bad type index`);
    encodedStructs.push({ typeIndex, members });
  }

  const typeNameAt = (typeIndex: number) => {
    const typeName = typeNames[typeIndex];
    if (typeName === undefined) throw new BlendError("CORRUPT", `SDNA type index ${typeIndex} out of range`);
    return typeName;
  };
  // Blender derives the pointer size from ListBase, which holds exactly two pointers.
  const listBaseStruct = encodedStructs.find((encoded) => typeNames[encoded.typeIndex] === "ListBase");
  const pointerSize = listBaseStruct ? typeSizes[listBaseStruct.typeIndex]! / 2 : 0;
  if (pointerSize !== 4 && pointerSize !== 8) throw new BlendError("CORRUPT", "SDNA: cannot derive pointer size from ListBase");

  const structs = encodedStructs.map(({ typeIndex, members: encodedMembers }, index): SdnaStruct => {
    let memberOffset = 0;
    const members = encodedMembers.map(({ typeIndex: memberTypeIndex, declaratorIndex }): SdnaMember => {
      const declarator = memberDeclarators[declaratorIndex];
      if (declarator === undefined) throw new BlendError("CORRUPT", `SDNA name index ${declaratorIndex} out of range`);
      const parsedDeclarator = parseMemberDeclarator(declarator);
      const elementSize = parsedDeclarator.pointerDepth > 0 ? pointerSize : typeSizes[memberTypeIndex]!;
      const member = {
        ...parsedDeclarator,
        declarator,
        type: typeNameAt(memberTypeIndex),
        size: elementSize * parsedDeclarator.arrayLength,
        offset: memberOffset,
      };
      memberOffset += member.size;
      return member;
    });
    const membersByName = new Map(members.map((member) => [member.name, member]));
    return { index, name: typeNameAt(typeIndex), size: typeSizes[typeIndex]!, members, findMember: (name) => membersByName.get(name) };
  });
  const structsByName = new Map(structs.map((struct) => [struct.name, struct]));
  return { pointerSize, memberDeclarators, typeNames, typeSizes, structs, findStruct: (name) => structsByName.get(name) };
}
