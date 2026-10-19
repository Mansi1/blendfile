import { BlendError } from "./errors.ts";

export type BlockHeaderLayout = "BHead4" | "SmallBHead8" | "LargeBHead8";

/** The decoded file header (first 12 or 17 bytes of the uncompressed file). */
export interface FileHeader {
  /** 12 for format version 0, 17 for format version 1 (Blender 5.0+). */
  size: 12 | 17;
  /** Low level file format version: 0 = legacy header, 1 = 17-byte header with LargeBHead8. */
  formatVersion: 0 | 1;
  pointerSize: 4 | 8;
  littleEndian: boolean;
  /** BLENDER_FILE_VERSION, e.g. 403 for Blender 4.3, 502 for Blender 5.2. */
  fileVersion: number;
  blockHeaderLayout: BlockHeaderLayout;
}

const readAscii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));
const isAsciiDigits = (text: string) => /^\d+$/.test(text);

/** Decodes the file header; mirrors `BLO_readfile_blender_header_decode` in Blender. */
export function decodeFileHeader(bytes: Uint8Array): FileHeader {
  if (bytes.length < 12 || readAscii(bytes, 0, 7) !== "BLENDER") {
    throw new BlendError("NOT_BLEND", "missing 'BLENDER' magic");
  }
  const pointerSizeMarker = readAscii(bytes, 7, 8);
  if (pointerSizeMarker === "_" || pointerSizeMarker === "-") {
    const endiannessMarker = readAscii(bytes, 8, 9);
    const versionDigits = readAscii(bytes, 9, 12);
    if ((endiannessMarker !== "v" && endiannessMarker !== "V") || !isAsciiDigits(versionDigits)) {
      throw new BlendError("UNSUPPORTED", "unknown legacy header variant");
    }
    const pointerSize = pointerSizeMarker === "_" ? 4 : 8;
    return {
      size: 12,
      formatVersion: 0,
      pointerSize,
      littleEndian: endiannessMarker === "v",
      fileVersion: Number(versionDigits),
      blockHeaderLayout: pointerSize === 4 ? "BHead4" : "SmallBHead8",
    };
  }
  const headerSizeDigits = readAscii(bytes, 7, 9);
  if (!isAsciiDigits(headerSizeDigits)) throw new BlendError("UNSUPPORTED", "unknown header variant");
  if (headerSizeDigits !== "17" || bytes.length < 17) {
    throw new BlendError("UNSUPPORTED", `unsupported header size ${headerSizeDigits}`);
  }
  const formatDigits = readAscii(bytes, 10, 12);
  const versionDigits = readAscii(bytes, 13, 17);
  if (readAscii(bytes, 9, 10) !== "-" || formatDigits !== "01" || readAscii(bytes, 12, 13) !== "v" || !isAsciiDigits(versionDigits)) {
    throw new BlendError("UNSUPPORTED", `unsupported header format '${readAscii(bytes, 7, 17)}'`);
  }
  return {
    size: 17,
    formatVersion: 1,
    pointerSize: 8,
    littleEndian: true,
    fileVersion: Number(versionDigits),
    blockHeaderLayout: "LargeBHead8",
  };
}
