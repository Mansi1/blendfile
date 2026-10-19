import { BlendError } from "../core/errors.ts";
import { type MemberValue, readMemberValue } from "../core/members.ts";
import type { SdnaMember, SdnaStruct } from "../core/sdna.ts";
import type { BlendFile } from "./blend-file.ts";

/** A value read from a struct member. Pointers are addresses (`0n` = null), 64-bit ints are bigint. */
export type BlendValue = MemberValue<BlendStruct>;

/** A typed, lazy view of one struct inside the file. Nothing is copied until a member is read. */
export class BlendStruct {
  constructor(
    readonly file: BlendFile,
    readonly structType: SdnaStruct,
    /** Absolute offset in the uncompressed file. */
    readonly offset: number,
  ) {}

  /** Member names in declaration order. */
  get memberNames(): string[] {
    return this.structType.members.map((member) => member.name);
  }

  /** The datablock name without its 2-letter code, for structs that start with an `ID` member. */
  get datablockName(): string | undefined {
    const firstMember = this.structType.members[0];
    if (firstMember?.name !== "id" || firstMember.type !== "ID") return undefined;
    return (this.readMember("id.name") as string).slice(2);
  }

  /**
   * Reads a member by dotted path, e.g. `readMember("loc")`, `readMember("id.name")`, `readMember("r.xsch")`.
   * char arrays come back as strings, pointers as bigint addresses, inline structs as BlendStruct.
   */
  readMember(path: string): BlendValue {
    const lastDot = path.lastIndexOf(".");
    const owner = lastDot < 0 ? this : this.readMember(path.slice(0, lastDot));
    if (!(owner instanceof BlendStruct)) throw new BlendError("UNSUPPORTED", `'${path.slice(0, lastDot)}' is not an inline struct`);
    const memberName = path.slice(lastDot + 1);
    const member = owner.structType.findMember(memberName);
    if (!member) throw new BlendError("UNSUPPORTED", `struct '${owner.structType.name}' has no member '${memberName}'`);
    return owner.readDeclaredMember(member);
  }

  /** Reads a pointer member's address. */
  readPointer(path: string): bigint {
    const address = this.readMember(path);
    if (typeof address !== "bigint") throw new BlendError("UNSUPPORTED", `'${path}' is not a pointer`);
    return address;
  }

  /** Follows a pointer member, e.g. `object.followPointer("data")` gives the Mesh. Null gives undefined. */
  followPointer(path: string, structTypeName?: string): BlendStruct | undefined {
    return this.followPointerToArray(path, structTypeName)[0];
  }

  /** Follows a pointer member to every struct in the target block (pointers to arrays). */
  followPointerToArray(path: string, structTypeName?: string): BlendStruct[] {
    return this.file.resolvePointer(this.readPointer(path), structTypeName, this.offset);
  }

  /** Follows a pointer member to a raw array of pointers, e.g. `mesh.readPointerArray("mat")`. */
  readPointerArray(path: string): bigint[] {
    return this.file.readPointerArrayAt(this.readPointer(path), this.offset);
  }

  /** Follows a pointer member to a raw array of primitives, e.g. `mesh.readPrimitiveArray("poly_offset_indices", "int")`. */
  readPrimitiveArray(path: string, typeName: string): (number | bigint)[] {
    return this.file.readPrimitiveArrayAt(this.readPointer(path), typeName, this.offset);
  }

  /** Follows a `char *` member to its string; undefined for null or unknown addresses. */
  readString(path: string): string | undefined {
    return this.file.readStringAt(this.readPointer(path), this.offset);
  }

  /** Walks a ListBase member (`first`, then each `next`), e.g. `scene.readListBase("view_layers")`. */
  readListBase(path: string): BlendStruct[] {
    const listBase = this.readMember(path);
    if (!(listBase instanceof BlendStruct) || listBase.structType.name !== "ListBase") {
      throw new BlendError("UNSUPPORTED", `'${path}' is not a ListBase`);
    }
    const items: BlendStruct[] = [];
    const visitedAddresses = new Set<bigint>();
    let address = listBase.readPointer("first");
    while (address !== 0n && !visitedAddresses.has(address)) {
      visitedAddresses.add(address);
      const item = this.file.resolvePointer(address, undefined, this.offset)[0];
      if (!item) break;
      items.push(item);
      address = item.structType.findMember("next") ? item.readPointer("next") : 0n;
    }
    return items;
  }

  /** Plain object of every member, inline structs nested up to `depth`. Pointers become hex strings. */
  toJSON(depth = 2): Record<string, unknown> {
    const plainObject: Record<string, unknown> = {};
    for (const member of this.structType.members) {
      plainObject[member.name] = toPlainValue(this.readDeclaredMember(member), depth - 1, member.pointerDepth > 0);
    }
    return plainObject;
  }

  private readDeclaredMember(member: SdnaMember): BlendValue {
    return readMemberValue(this.file.readContext, this.file.sdna, member, this.offset,
      (structType, byteOffset) => new BlendStruct(this.file, structType, byteOffset));
  }
}

function toPlainValue(value: BlendValue, remainingDepth: number, isPointer: boolean): unknown {
  if (value instanceof BlendStruct) return remainingDepth > 0 ? value.toJSON(remainingDepth) : `<${value.structType.name}>`;
  if (typeof value === "bigint") return isPointer ? `0x${value.toString(16)}` : value.toString();
  if (Array.isArray(value)) return value.map((element) => toPlainValue(element, remainingDepth, isPointer));
  return value;
}
