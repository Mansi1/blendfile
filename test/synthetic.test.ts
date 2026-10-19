// No 32-bit or big-endian Blender runs on this machine, so these files are assembled byte by byte from the
// layouts in spec/ (Blender source: BLO_core_bhead.hh, dna_genfile.cc). They cover the variants the real
// fixtures cannot: BHead4, big endian, and malformed input.
import { expect, test } from "bun:test";
import { gzipSync } from "fflate";
import { BlendError, type BlendErrorCode, type BlockHeaderLayout, parseBlendFile, parseMemberDeclarator } from "../src/index.ts";

class ByteWriter {
  bytes: number[] = [];
  constructor(readonly littleEndian: boolean) {}
  writeAscii(text: string) {
    for (const character of text) this.bytes.push(character.charCodeAt(0));
  }
  writeInteger(value: number, byteCount: 2 | 4 | 8) {
    const view = new DataView(new ArrayBuffer(8));
    if (byteCount === 2) view.setInt16(0, value, this.littleEndian);
    else if (byteCount === 4) view.setInt32(0, value, this.littleEndian);
    else view.setBigInt64(0, BigInt(value), this.littleEndian);
    this.bytes.push(...new Uint8Array(view.buffer, 0, byteCount));
  }
  alignTo4() {
    while (this.bytes.length % 4) this.bytes.push(0);
  }
}

/** SDNA with `ListBase` and `Thing { Thing *next, *prev; char name[8]; int value; int64_t big; void (*callback)(); short grid[2][3]; }`. */
function encodeSdna(littleEndian: boolean, pointerSize: 4 | 8) {
  const writer = new ByteWriter(littleEndian);
  const declarators = ["*first", "*last", "*next", "*prev", "name[8]", "value", "big", "(*callback)()", "grid[2][3]"];
  const thingSize = 2 * pointerSize + 8 + 4 + 8 + pointerSize + 12;
  const types: [string, number][] = [["char", 1], ["short", 2], ["int", 4], ["int64_t", 8], ["void", 0], ["ListBase", 2 * pointerSize], ["Thing", thingSize]];
  writer.writeAscii("SDNANAME");
  writer.writeInteger(declarators.length, 4);
  for (const declarator of declarators) writer.writeAscii(`${declarator}\0`);
  writer.alignTo4();
  writer.writeAscii("TYPE");
  writer.writeInteger(types.length, 4);
  for (const [typeName] of types) writer.writeAscii(`${typeName}\0`);
  writer.alignTo4();
  writer.writeAscii("TLEN");
  for (const [, typeSize] of types) writer.writeInteger(typeSize, 2);
  writer.alignTo4();
  writer.writeAscii("STRC");
  writer.writeInteger(2, 4);
  const structs: [number, [number, number][]][] = [
    [5, [[4, 0], [4, 1]]], // ListBase { void *first, *last }
    [6, [[6, 2], [6, 3], [0, 4], [2, 5], [3, 6], [4, 7], [1, 8]]], // Thing
  ];
  for (const [typeIndex, members] of structs) {
    writer.writeInteger(typeIndex, 2);
    writer.writeInteger(members.length, 2);
    for (const [memberTypeIndex, declaratorIndex] of members) {
      writer.writeInteger(memberTypeIndex, 2);
      writer.writeInteger(declaratorIndex, 2);
    }
  }
  return writer.bytes;
}

function buildSyntheticFile(blockHeaderLayout: BlockHeaderLayout, littleEndian: boolean) {
  const pointerSize = blockHeaderLayout === "BHead4" ? 4 : 8;
  const writer = new ByteWriter(littleEndian);
  writer.writeAscii(blockHeaderLayout === "LargeBHead8"
    ? "BLENDER17-01v0500"
    : `BLENDER${pointerSize === 4 ? "_" : "-"}${littleEndian ? "v" : "V"}279`);
  const writeBlock = (code: string, sdnaIndex: number, address: number, payload: number[], count = 1) => {
    writer.writeAscii(code.padEnd(4, "\0"));
    if (blockHeaderLayout === "LargeBHead8") {
      writer.writeInteger(sdnaIndex, 4);
      writer.writeInteger(address, 8);
      writer.writeInteger(payload.length, 8);
      writer.writeInteger(count, 8);
    } else {
      writer.writeInteger(payload.length, 4);
      writer.writeInteger(address, pointerSize);
      writer.writeInteger(sdnaIndex, 4);
      writer.writeInteger(count, 4);
    }
    writer.bytes.push(...payload);
  };
  const encodeThing = (nextAddress: number, name: string, value: number) => {
    const thingWriter = new ByteWriter(littleEndian);
    thingWriter.writeInteger(nextAddress, pointerSize);
    thingWriter.writeInteger(0, pointerSize);
    thingWriter.writeAscii(name.padEnd(8, "\0"));
    thingWriter.writeInteger(value, 4);
    thingWriter.writeInteger(2 ** 40 + 7, 8);
    thingWriter.writeInteger(0, pointerSize);
    for (let gridIndex = 0; gridIndex < 6; gridIndex++) thingWriter.writeInteger(gridIndex * 10, 2);
    return thingWriter.bytes;
  };
  writeBlock("DATA", 1, 0x1000, encodeThing(0x2000, "first", -5));
  writeBlock("DATA", 1, 0x2000, [...encodeThing(0, "second", 123456), ...encodeThing(0, "third", 9)], 2);
  writeBlock("DNA1", 0, 0x3000, encodeSdna(littleEndian, pointerSize));
  writeBlock("ENDB", 0, 0, []);
  return new Uint8Array(writer.bytes);
}

const VARIANTS = [["BHead4", true], ["BHead4", false], ["SmallBHead8", true], ["SmallBHead8", false], ["LargeBHead8", true]] as const;

for (const [blockHeaderLayout, littleEndian] of VARIANTS) {
  test(`${blockHeaderLayout} ${littleEndian ? "little" : "big"} endian`, () => {
    const blendFile = parseBlendFile(buildSyntheticFile(blockHeaderLayout, littleEndian));
    const expectedPointerSize = blockHeaderLayout === "BHead4" ? 4 : 8;
    expect(blendFile.header).toMatchObject({ blockHeaderLayout, littleEndian, pointerSize: expectedPointerSize });
    expect(blendFile.blocks.map((block) => block.code)).toEqual(["DATA", "DATA", "DNA1", "ENDB"]);
    expect(blendFile.sdna.pointerSize).toBe(expectedPointerSize);
    const thingType = blendFile.sdna.findStruct("Thing")!;
    expect(thingType.members.map((member) => [member.name, member.pointerDepth, member.arrayDimensions])).toEqual([
      ["next", 1, []], ["prev", 1, []], ["name", 0, [8]], ["value", 0, []], ["big", 0, []], ["callback", 1, []], ["grid", 0, [2, 3]],
    ]);
    expect(thingType.findMember("callback")!.isFunctionPointer).toBe(true);
    const [firstThing] = blendFile.readStructsInBlock(blendFile.blocks[0]!);
    expect(firstThing!.readMember("name")).toBe("first");
    expect(firstThing!.readMember("value")).toBe(-5);
    expect(firstThing!.readMember("big")).toBe(2n ** 40n + 7n);
    expect(firstThing!.readMember("grid")).toEqual([[0, 10, 20], [30, 40, 50]]);
    const nextThings = firstThing!.followPointerToArray("next");
    expect(nextThings.map((thing) => [thing.readMember("name"), thing.readMember("value")])).toEqual([["second", 123456], ["third", 9]]);
    expect(firstThing!.readPointer("prev")).toBe(0n);
  });
}

test("declarator parsing", () => {
  expect(parseMemberDeclarator("**mat")).toMatchObject({ name: "mat", pointerDepth: 2, arrayLength: 1 });
  expect(parseMemberDeclarator("*mtex[18]")).toMatchObject({ name: "mtex", pointerDepth: 1, arrayDimensions: [18] });
  expect(parseMemberDeclarator("obmat[4][4]")).toMatchObject({ name: "obmat", arrayLength: 16 });
  expect(parseMemberDeclarator("(*poll)(void *, int)")).toMatchObject({ name: "poll", isFunctionPointer: true });
  expect(() => parseMemberDeclarator("bad name")).toThrow(BlendError);
});

const expectBlendError = (bytes: Uint8Array, expectedCode: BlendErrorCode) => {
  try {
    parseBlendFile(bytes);
  } catch (error) {
    expect(error).toBeInstanceOf(BlendError);
    expect((error as BlendError).code).toBe(expectedCode);
    return;
  }
  throw new Error("expected BlendError");
};
const encodeText = (text: string) => new TextEncoder().encode(text);

test("gzip-wrapped synthetic file", () => {
  expect(parseBlendFile(gzipSync(buildSyntheticFile("SmallBHead8", true))).compressionMethod).toBe("gzip");
});
test("rejects non-blend input", () => expectBlendError(encodeText("hello, world!"), "NOT_BLEND"));
test("rejects unknown header variants", () => {
  expectBlendError(encodeText("BLENDER-x279"), "UNSUPPORTED");
  expectBlendError(encodeText("BLENDER21-01v0500xxxx"), "UNSUPPORTED");
  expectBlendError(encodeText("BLENDER17-02v0500"), "UNSUPPORTED");
});
test("rejects truncated files and overrunning blocks", () => {
  const completeFile = buildSyntheticFile("SmallBHead8", true);
  expectBlendError(completeFile.subarray(0, 100), "CORRUPT");
  const overrunningFile = completeFile.slice();
  new DataView(overrunningFile.buffer).setInt32(12 + 4, 1 << 30, true); // first block's length
  expectBlendError(overrunningFile, "CORRUPT");
});
test("rejects corrupt zstd", () => expectBlendError(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd, 1, 2, 3]), "CORRUPT"));
test("truncated ENDB header is accepted like Blender does", () => {
  const completeFile = buildSyntheticFile("SmallBHead8", true);
  expect(parseBlendFile(completeFile.subarray(0, completeFile.length - 20)).blocks.at(-1)!.code).toBe("ENDB");
});
