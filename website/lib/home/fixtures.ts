// The test files the overview graphics read with the library while the site is built.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBlendFile } from "blendfile";
import { REPOSITORY_ROOT } from "../site.ts";

export const openFixture = (fileName: string) => parseBlendFile(readFileSync(join(REPOSITORY_ROOT, "input", fileName)));
export const formatHex = (address: bigint) => `0x${address.toString(16)}`;
export const formatKilobytes = (byteCount: number) => `${(byteCount / 1024).toFixed(0)} KB`;
