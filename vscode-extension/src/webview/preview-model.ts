// What the preview shows, computed from a parsed file. No DOM here, so the unit tests run it on the fixtures.
import { type BlendFile, BlendStruct, type SdnaMember, datablockIdCode, isDatablockBlock } from "../../../src/index.ts";

/** ID codes Blender writes, as the names Blender's interface uses. Unknown codes are shown as the bare code. */
export const ID_CODE_LABELS: Record<string, string> = {
  AC: "Actions", AR: "Armatures", BR: "Brushes", CA: "Cameras", CF: "Cache files", CU: "Curves (legacy)",
  CV: "Curves", GD: "Grease pencil (legacy)", GP: "Grease pencil", GR: "Collections", IM: "Images", KE: "Shape keys",
  LA: "Lights", LI: "Libraries", LP: "Light probes", LS: "Line styles", LT: "Lattices", MA: "Materials", MB: "Metaballs",
  MC: "Movie clips", ME: "Meshes", MS: "Masks", NT: "Node trees", OB: "Objects", PA: "Palettes", PC: "Paint curves",
  PT: "Point clouds", SC: "Scenes", SO: "Sounds", SP: "Speakers", SR: "Screens", TE: "Textures", TX: "Texts",
  VF: "Fonts", VO: "Volumes", WM: "Window managers", WO: "Worlds", WS: "Workspaces",
};

/** Scene content first, interface state last: the order a person looking at a file usually wants. */
const INTERFACE_ID_CODES = new Set(["WM", "WS", "SR"]);

export interface DatablockEntry {
  idCode: string;
  name: string;
  struct: BlendStruct;
}

export interface DatablockGroup {
  idCode: string;
  label: string;
  /** Window manager, workspaces and screens: the saved interface, not scene content. */
  isInterfaceState: boolean;
  entries: DatablockEntry[];
}

export interface BlockCodeTotal {
  code: string;
  count: number;
  bytes: number;
}

export interface MemberRow {
  member: SdnaMember;
  valueText: string;
  /** Set for pointers into the file and for inline structs: what clicking the value opens. */
  openTarget?: BlendStruct;
}

export const formatBytes = (byteCount: number) =>
  new Intl.NumberFormat("en", { notation: "compact", style: "unit", unit: "byte", unitDisplay: "narrow" }).format(byteCount);
export const formatHex = (address: bigint) => `0x${address.toString(16)}`;
const truncate = (text: string, maxLength = 120) => (text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text);

export function describeFileFacts(blendFile: BlendFile, fileName: string): [title: string, value: string][] {
  const { header, sdna, blocks } = blendFile;
  return [
    ["File", fileName],
    ["Blender", blendFile.blenderVersion],
    ["Header", `${header.size} bytes, format ${header.formatVersion}`],
    ["Block header", header.blockHeaderLayout],
    ["Compression", blendFile.compressionMethod],
    ["Byte order", `${header.littleEndian ? "little" : "big"} endian`],
    ["Pointers", `${header.pointerSize} bytes`],
    ["Blocks", String(blocks.length)],
    ["SDNA structs", String(sdna.structs.length)],
    ["Uncompressed", formatBytes(blendFile.fileBytes.length)],
  ];
}

export function groupDatablocksByIdCode(blendFile: BlendFile): DatablockGroup[] {
  const groups = new Map<string, DatablockEntry[]>();
  for (const block of blendFile.blocks.filter(isDatablockBlock)) {
    const struct = blendFile.readStructsInBlock(block)[0];
    if (!struct) continue;
    const idCode = datablockIdCode(block);
    groups.set(idCode, [...(groups.get(idCode) ?? []), { idCode, name: struct.datablockName ?? "", struct }]);
  }
  const sortKey = (idCode: string) => `${INTERFACE_ID_CODES.has(idCode) ? 1 : 0}${ID_CODE_LABELS[idCode] ?? idCode}`;
  return [...groups]
    .map(([idCode, entries]) => ({ idCode, label: ID_CODE_LABELS[idCode] ?? idCode, isInterfaceState: INTERFACE_ID_CODES.has(idCode), entries }))
    .sort((left, right) => sortKey(left.idCode).localeCompare(sortKey(right.idCode)));
}

/** Groups with only the entries whose name, ID code or struct type contains the query (case-insensitive). */
export function filterDatablockGroups(groups: DatablockGroup[], query: string): DatablockGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) =>
        [entry.name, entry.idCode, group.label, entry.struct.structType.name].some((text) => text.toLowerCase().includes(needle)),
      ),
    }))
    .filter((group) => group.entries.length > 0);
}

export function totalBlocksByCode(blendFile: BlendFile): BlockCodeTotal[] {
  const totals = new Map<string, BlockCodeTotal>();
  for (const block of blendFile.blocks) {
    const total = totals.get(block.code) ?? { code: block.code, count: 0, bytes: 0 };
    total.count += 1;
    total.bytes += block.size;
    totals.set(block.code, total);
  }
  return [...totals.values()].sort((left, right) => right.bytes - left.bytes);
}

/** One row of the member table: the value as text and, for pointers and inline structs, what can be opened. */
export function describeMember(struct: BlendStruct, member: SdnaMember): MemberRow {
  const file = struct.file;
  try {
    const value = struct.readMember(member.name);
    if (member.pointerDepth > 0 && typeof value === "bigint") {
      if (value === 0n) return { member, valueText: "null" };
      if (member.type === "char" && member.pointerDepth === 1) return { member, valueText: JSON.stringify(file.readStringAt(value, struct.offset) ?? formatHex(value)) };
      const target = file.resolvePointer(value, undefined, struct.offset)[0];
      if (target) {
        const targetName = target.datablockName ? ` "${target.datablockName}"` : "";
        return { member, valueText: `${formatHex(value)} → ${target.structType.name}${targetName}`, openTarget: target };
      }
      const block = file.findBlockByAddress(value, struct.offset);
      return { member, valueText: block ? `${formatHex(value)} → raw data, ${formatBytes(block.size)}` : `${formatHex(value)} (not in file)` };
    }
    if (value instanceof BlendStruct) return { member, valueText: `{ ${value.structType.name} }`, openTarget: value };
    if (typeof value === "string") return { member, valueText: JSON.stringify(value) };
    const replacer = (_key: string, element: unknown) =>
      typeof element === "bigint" ? element.toString() : element instanceof BlendStruct ? `{${element.structType.name}}` : element;
    return { member, valueText: truncate(JSON.stringify(value, replacer)) };
  } catch (error) {
    return { member, valueText: `— (${(error as Error).message})` };
  }
}

export const describeMembers = (struct: BlendStruct) => struct.structType.members.map((member) => describeMember(struct, member));

/** Label of an opened struct in the breadcrumb: the datablock name, else the struct type. */
export const labelOfStruct = (struct: BlendStruct) => struct.datablockName ?? struct.structType.name;
