// Code examples shown on several pages; one copy so they cannot drift apart.

export const INSTALL_EXAMPLE = [
  { title: "bun", code: "bun install && bun run build && bun pm pack\nbun add ./blendfile-0.1.0.tgz" },
  { title: "npm", code: "bun install && bun run build && bun pm pack\nnpm install ./blendfile-0.1.0.tgz" },
];

export const OPEN_EXAMPLE = [
  {
    title: "Node.js",
    code: `import { readFile } from "node:fs/promises";
import { parseBlendFile } from "blendfile";

const blendFile = parseBlendFile(await readFile("scene.blend"));
console.log(blendFile.blenderVersion); // "5.2"`,
  },
  {
    title: "Browser: file input",
    code: `import { parseBlendFile } from "blendfile";

input.addEventListener("change", async () => {
  const chosenFile = input.files?.[0];
  if (!chosenFile) return;
  const blendFile = parseBlendFile(await chosenFile.arrayBuffer());
  console.log(blendFile.listDatablocks().length);
});`,
  },
  {
    title: "Browser: fetch",
    code: `import { parseBlendFile } from "blendfile";

const response = await fetch("/models/scene.blend");
const blendFile = parseBlendFile(await response.arrayBuffer());`,
  },
];

export const NAVIGATE_EXAMPLE = [
  {
    title: "Objects",
    code: `const cube = blendFile.findDatablock("OB", "Cube");
cube?.readMember("loc");      // [1, 2, 3]
cube?.readMember("size");     // scale, stored as "size"
cube?.readMember("id.name");  // "OBCube"`,
  },
  {
    title: "Pointers",
    code: `import { readMeshVertexPositions } from "blendfile";

const mesh = cube?.followPointer("data");       // Object → Mesh
const positions = readMeshVertexPositions(mesh!); // Float32Array xyz
const layers = scene?.readListBase("view_layers"); // ListBase → ViewLayer[]`,
  },
  {
    title: "File info",
    code: `blendFile.readRenderInfo(); // [{ sceneName, frameStart, frameEnd }]
blendFile.readThumbnail();  // { width, height, rgba } or undefined
blendFile.header;           // pointer size, byte order, version, layout`,
  },
];
