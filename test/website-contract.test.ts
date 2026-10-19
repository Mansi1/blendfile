// The website renders spec/ and documents the public API; these checks keep both in step with the code.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as blendfile from "../src/index.ts";

const readRepositoryFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every spec page has a website page and vice versa", () => {
  const specSlugs = readdirSync(new URL("../spec", import.meta.url))
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => (fileName === "README.md" ? "index" : fileName.replace(/\.md$/, "")))
    .sort();
  const pageSlugs = readdirSync(new URL("../website/pages/spec", import.meta.url))
    .filter((fileName) => fileName.endsWith(".mdx"))
    .map((fileName) => fileName.replace(/\.mdx$/, ""))
    .sort();
  expect(pageSlugs).toEqual(specSlugs);
  for (const slug of pageSlugs) expect(readRepositoryFile(`website/pages/spec/${slug}.mdx`)).toContain(`<SpecPage slug="${slug}" />`);
});

test("the usage page's API reference names every runtime export", () => {
  const usagePage = readRepositoryFile("website/pages/usage.mdx");
  const undocumented = Object.keys(blendfile).filter((exportName) => !usagePage.includes(`\`${exportName}`) && !usagePage.includes(`${exportName}\``) && !usagePage.includes(`${exportName}(`));
  expect(undocumented).toEqual([]);
});
