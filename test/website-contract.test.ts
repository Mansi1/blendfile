// The website renders spec/ and documents the public API; these checks keep both in step with the code.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as blendfile from "../src/index.ts";

const readRepositoryFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every spec file starts with the title its chapter on the Docs page shows", () => {
  const specFiles = readdirSync(new URL("../spec", import.meta.url)).filter((fileName) => fileName.endsWith(".md"));
  expect(specFiles.length).toBeGreaterThan(5);
  for (const fileName of specFiles) expect(readRepositoryFile(`spec/${fileName}`), fileName).toMatch(/^# \S/);
});

test("the Docs page's API reference names every runtime export", () => {
  const usagePage = readRepositoryFile("website/lib/docs/api-reference.tsx");
  const undocumented = Object.keys(blendfile).filter((exportName) => !usagePage.includes(`\`${exportName}`) && !usagePage.includes(`${exportName}\``) && !usagePage.includes(`${exportName}(`));
  expect(undocumented).toEqual([]);
});
