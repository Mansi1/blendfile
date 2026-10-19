// e2e for the published artifact: pack the library, install the tarball into a clean project, and run it
// with plain Node.js as ESM and as CommonJS on every input/*.blend. Results go to output/consumer/.
import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const consumerDirectory = join(repositoryRoot, "tmp/e2e-consumer");
const outputDirectory = join(repositoryRoot, "output/consumer");

rmSync(consumerDirectory, { recursive: true, force: true });
rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(consumerDirectory, { recursive: true });
mkdirSync(outputDirectory, { recursive: true });

const tarballName = (await $`bun pm pack --destination ${consumerDirectory} --quiet`.cwd(repositoryRoot).text()).trim().split("\n").at(-1)!;
const tarballPath = tarballName.startsWith("/") ? tarballName : join(consumerDirectory, tarballName);
writeFileSync(join(consumerDirectory, "package.json"), JSON.stringify({ name: "blendfile-consumer", private: true }, null, 2));
await $`bun add ${tarballPath}`.cwd(consumerDirectory).quiet();

// The consumer scripts only use what a user would: the package name and node:fs.
const summarize = `
  const blendFile = parseBlendFile(readFileSync(filePath));
  const truth = JSON.parse(readFileSync(truthPath, "utf8"));
  const objects = Object.fromEntries(blendFile.listDatablocks("OB").map((object) => [object.datablockName, object.readMember("loc")]));
  for (const [name, expected] of Object.entries(truth.objects)) {
    if (expected.location && JSON.stringify(objects[name]) !== JSON.stringify(expected.location)) throw new Error(filePath + ": " + name + " location mismatch");
  }
  // Scene fixtures: world matrices and triangle counts through the packed scene API.
  const scene = readScene(blendFile);
  const worldTranslations = Object.fromEntries(scene.objects.map((object) => [object.name, Array.from(object.worldMatrix.subarray(12, 15))]));
  for (const [name, expected] of Object.entries(truth.objects)) {
    if (!expected.matrix_world || !expected.visible) continue; // Blender leaves matrix_world stale for hidden objects
    const translation = expected.matrix_world.slice(0, 3).map((row) => row[3]);
    if (translation.some((value, axis) => Math.abs(value - worldTranslations[name][axis]) > 1e-4)) throw new Error(filePath + ": " + name + " world matrix mismatch");
  }
  const triangleCounts = Object.fromEntries(blendFile.listDatablocks("ME").map((mesh) => [mesh.datablockName, triangulateMeshGeometry(readMeshGeometry(mesh)).faceIndices.length]));
  for (const [name, count] of Object.entries(triangleCounts)) {
    if (truth.meshes[name].triangles !== undefined && truth.meshes[name].triangles !== count) throw new Error(filePath + ": " + name + " triangle count mismatch");
  }
  const mesh = blendFile.listDatablocks("ME")[0];
  const summary = {
    blenderVersion: blendFile.blenderVersion,
    compressionMethod: blendFile.compressionMethod,
    blockHeaderLayout: blendFile.header.blockHeaderLayout,
    blockCount: blendFile.blocks.length,
    datablocks: blendFile.listDatablocks().map((datablock) => datablock.readMember("id.name")),
    objects,
    vertexPositions: Array.from(readMeshVertexPositions(mesh)),
    renderInfo: blendFile.readRenderInfo(),
    worldTranslations,
    triangleCounts,
  };
  const expectedVertexCount = truth.meshes[mesh.datablockName].vertices ?? truth.meshes[mesh.datablockName].positions.length;
  if (summary.vertexPositions.length !== expectedVertexCount * 3) throw new Error(filePath + ": vertex count mismatch");
  writeFileSync(outputPath, JSON.stringify(summary, null, 2));
`;
writeFileSync(join(consumerDirectory, "summarize.mjs"), `import { readFileSync, writeFileSync } from "node:fs";
import { parseBlendFile, readMeshGeometry, readMeshVertexPositions, readScene, triangulateMeshGeometry } from "blendfile";
const [filePath, truthPath, outputPath] = process.argv.slice(2);
${summarize}`);
writeFileSync(join(consumerDirectory, "summarize.cjs"), `const { readFileSync, writeFileSync } = require("node:fs");
const { parseBlendFile, readMeshGeometry, readMeshVertexPositions, readScene, triangulateMeshGeometry } = require("blendfile");
const [filePath, truthPath, outputPath] = process.argv.slice(2);
${summarize}`);

const fixtures = readdirSync(join(repositoryRoot, "input")).filter((fileName) => fileName.endsWith(".blend"));
for (const fixture of fixtures) {
  const filePath = join(repositoryRoot, "input", fixture);
  // v52_zstd.blend → v52.truth.json, scene_v43.blend → scene_v43.truth.json
  const truthPath = join(repositoryRoot, "input", fixture.replace(/(_zstd|_gzip)?\.blend$/, ".truth.json"));
  // VERIFIED: a local .blend without Blender's truth JSON (one dropped in by hand, not a fixture) has nothing to compare against.
  if (!existsSync(truthPath)) {
    console.log(`${new Date().toISOString()} INFO consumer skip fixture=${fixture} reason=no-truth-json`);
    continue;
  }
  const baseName = fixture.replace(/\.blend$/, "");
  await $`node summarize.mjs ${filePath} ${truthPath} ${join(outputDirectory, `${baseName}.esm.json`)}`.cwd(consumerDirectory);
  await $`node summarize.cjs ${filePath} ${truthPath} ${join(outputDirectory, `${baseName}.cjs.json`)}`.cwd(consumerDirectory);
  const esm = await Bun.file(join(outputDirectory, `${baseName}.esm.json`)).text();
  const cjs = await Bun.file(join(outputDirectory, `${baseName}.cjs.json`)).text();
  if (esm !== cjs) throw new Error(`${fixture}: ESM and CJS builds disagree`);
  console.log(`${new Date().toISOString()} INFO consumer ok fixture=${fixture}`);
}
