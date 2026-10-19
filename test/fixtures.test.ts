// Real files written by Blender 4.3.0 and 5.2.2 (tools/make_fixtures.py); expected values come from
// Blender's own Python API (input/*.truth.json), not from this parser.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { datablockIdCode, isDatablockBlock, parseBlendFile, readMeshVertexPositions } from "../src/index.ts";

const readFixture = (fileName: string) => new Uint8Array(readFileSync(new URL(`../input/${fileName}`, import.meta.url)));
const readTruth = (prefix: string) => JSON.parse(readFileSync(new URL(`../input/${prefix}.truth.json`, import.meta.url), "utf8"));

const FIXTURES = [
  { fileName: "v43.blend", truthPrefix: "v43", compressionMethod: "none", blockHeaderLayout: "SmallBHead8", headerSize: 12 },
  { fileName: "v43_zstd.blend", truthPrefix: "v43", compressionMethod: "zstd", blockHeaderLayout: "SmallBHead8", headerSize: 12 },
  { fileName: "v43_gzip.blend", truthPrefix: "v43", compressionMethod: "gzip", blockHeaderLayout: "SmallBHead8", headerSize: 12 },
  { fileName: "v52.blend", truthPrefix: "v52", compressionMethod: "none", blockHeaderLayout: "LargeBHead8", headerSize: 17 },
  { fileName: "v52_zstd.blend", truthPrefix: "v52", compressionMethod: "zstd", blockHeaderLayout: "LargeBHead8", headerSize: 17 },
] as const;

for (const fixture of FIXTURES) {
  describe(fixture.fileName, () => {
    const truth = readTruth(fixture.truthPrefix);
    const blendFile = parseBlendFile(readFixture(fixture.fileName).buffer);

    test("header and compression", () => {
      expect(blendFile.compressionMethod).toBe(fixture.compressionMethod);
      expect(blendFile.header).toMatchObject({
        size: fixture.headerSize, blockHeaderLayout: fixture.blockHeaderLayout, pointerSize: 8, littleEndian: true,
      });
      expect(blendFile.header.fileVersion).toBe(truth.file_version);
      expect(blendFile.blenderVersion).toBe(`${truth.blender_version[0]}.${truth.blender_version[1]}`);
    });

    test("blocks end with ENDB, carry one DNA1, payloads tile the file", () => {
      expect(blendFile.blocks.at(-1)!.code).toBe("ENDB");
      expect(blendFile.blocks.filter((block) => block.code === "DNA1")).toHaveLength(1);
      for (let index = 1; index < blendFile.blocks.length; index++) {
        const previousBlock = blendFile.blocks[index - 1]!;
        expect(blendFile.blocks[index]!.headerOffset).toBe(previousBlock.offset + previousBlock.size);
      }
    });

    test("SDNA: struct 0 is raw data, member sizes add up to struct sizes (no padding)", () => {
      expect(blendFile.sdna.structs[0]!.name).toBe("raw_data");
      expect(blendFile.sdna.pointerSize).toBe(8);
      for (const struct of blendFile.sdna.structs) {
        expect(struct.members.reduce((total, member) => total + member.size, 0)).toBe(struct.size);
      }
    });

    test("scene matches Blender", () => {
      const scene = blendFile.findDatablock("SC", truth.scene.name)!;
      expect(scene.readMember("r.sfra")).toBe(truth.scene.frame_start);
      expect(scene.readMember("r.efra")).toBe(truth.scene.frame_end);
      expect(scene.readMember("r.xsch")).toBe(truth.scene.resolution_x);
      expect(scene.readMember("r.ysch")).toBe(truth.scene.resolution_y);
      expect(blendFile.readRenderInfo()).toEqual([
        { sceneName: truth.scene.name, frameStart: truth.scene.frame_start, frameEnd: truth.scene.frame_end },
      ]);
    });

    test("objects match Blender", () => {
      const objectNames = blendFile.listDatablocks("OB").map((object) => object.datablockName);
      expect(objectNames.sort()).toEqual(Object.keys(truth.objects).sort());
      for (const [objectName, expected] of Object.entries<any>(truth.objects)) {
        const object = blendFile.findDatablock("OB", objectName)!;
        expect(object.readMember("loc")).toEqual(expected.location);
        expect(object.readMember("size")).toEqual(expected.scale); // stored name of Object.scale
        expect(object.followPointer("data")?.datablockName).toBe(expected.data ?? undefined);
      }
    });

    test("meshes and materials match Blender", () => {
      for (const [meshName, expected] of Object.entries<any>(truth.meshes)) {
        const mesh = blendFile.findDatablock("ME", meshName)!;
        expect(mesh.readMember("totvert")).toBe(expected.vertices);
        expect(mesh.readMember("totpoly")).toBe(expected.faces);
        expect(Array.from(readMeshVertexPositions(mesh))).toEqual(expected.positions.flat());
        const materialNames = blendFile.readPointerArrayAt(mesh.readPointer("mat"))
          .map((address) => blendFile.resolvePointer(address)[0]?.datablockName);
        expect(materialNames).toEqual(expected.materials);
      }
      for (const [materialName, expected] of Object.entries<any>(truth.materials)) {
        const material = blendFile.findDatablock("MA", materialName)!;
        expect(["r", "g", "b", "a"].map((channel) => material.readMember(channel))).toEqual(expected.diffuse_color);
      }
    });

    test("every datablock name starts with its ID code (screens: block SN, ID code SR)", () => {
      for (const block of blendFile.blocks.filter(isDatablockBlock)) {
        const datablock = blendFile.readStructsInBlock(block)[0]!;
        expect((datablock.readMember("id.name") as string).slice(0, 2)).toBe(datablockIdCode(block));
      }
      expect(blendFile.listDatablocks("SR").length).toBeGreaterThan(0);
    });

    test("ListBase iteration and JSON view", () => {
      const viewLayers = blendFile.findDatablock("SC", truth.scene.name)!.readListBase("view_layers");
      expect(viewLayers.length).toBeGreaterThan(0);
      expect(viewLayers[0]!.structType.name).toBe("ViewLayer");
      const objectJson = JSON.parse(JSON.stringify(blendFile.findDatablock("OB", "ProbeCube")!.toJSON()));
      expect(objectJson.id.name).toBe("OBProbeCube");
    });
  });
}

test("compressed and plain files decode to identical structs", () => {
  const datablocksAsJson = (fileName: string) =>
    parseBlendFile(readFixture(fileName)).listDatablocks().map((datablock) => JSON.stringify(datablock.toJSON(1)));
  expect(datablocksAsJson("v43_gzip.blend")).toEqual(datablocksAsJson("v43.blend"));
  expect(datablocksAsJson("v52_zstd.blend")).toEqual(datablocksAsJson("v52.blend"));
});

test("thumbnail: 5.2 writes a 128x128 TEST block, 4.3 background saves none", () => {
  const thumbnail = parseBlendFile(readFixture("v52.blend")).readThumbnail()!;
  expect([thumbnail.width, thumbnail.height, thumbnail.rgba.length]).toEqual([128, 128, 128 * 128 * 4]);
  expect(parseBlendFile(readFixture("v43.blend")).readThumbnail()).toBeUndefined();
});
