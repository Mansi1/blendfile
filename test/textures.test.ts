// UV maps and image textures, checked against what Blender 4.3 reported for input/texture_v43.blend
// (written with input/texture_v43.truth.json by tools/make_texture_fixture.py).
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listMeshUvMaps, parseBlendFile, readMaterialAppearance, readMeshGeometry, readMeshUvMap, triangulateMeshGeometry } from "../src/index.ts";
import { imagePathCandidates } from "../vscode-extension/src/host/image-paths.ts";
import { buildRenderScene, mappingToUvTransform } from "../vscode-extension/src/webview/scene-model.ts";

const inputDirectory = join(import.meta.dir, "../input");
const blendFile = parseBlendFile(readFileSync(join(inputDirectory, "texture_v43.blend")));
const truth = JSON.parse(readFileSync(join(inputDirectory, "texture_v43.truth.json"), "utf8"));
const mesh = blendFile.findDatablock("ME", "TexturedPlaneMesh")!;
const material = readMaterialAppearance(blendFile.findDatablock("MA", "Textured")!);
const rounded = (values: ArrayLike<number>) => Array.from(values, (value) => Number(value.toFixed(5)));

test("UV maps: names, the render map, and corner values of each", () => {
  expect(listMeshUvMaps(mesh)).toEqual({ names: Object.keys(truth.uvMaps), renderName: truth.renderUvMap });
  expect(readMeshUvMap(mesh)!.name).toBe(truth.renderUvMap);
  for (const [name, values] of Object.entries(truth.uvMaps as Record<string, number[]>)) expect(rounded(readMeshUvMap(mesh, name)!.uvs)).toEqual(rounded(values));
  expect(readMeshUvMap(mesh, "NoSuchMap")!.name).toBe(truth.renderUvMap);
});

test("meshes without UV maps have none", () => {
  const sceneFile = parseBlendFile(readFileSync(join(inputDirectory, "scene_v52.blend")));
  const boxMesh = sceneFile.findDatablock("ME", "BoxMesh")!;
  expect(listMeshUvMaps(boxMesh)).toEqual({ names: [], renderName: undefined });
  expect(readMeshUvMap(boxMesh)).toBeUndefined();
});

test("triangles carry the face corner of each vertex", () => {
  const geometry = readMeshGeometry(mesh);
  const triangles = triangulateMeshGeometry(geometry);
  expect(triangles.cornerIndices).toHaveLength(triangles.vertexIndices.length);
  triangles.cornerIndices.forEach((corner, index) => expect(geometry.cornerVertices[corner]).toBe(triangles.vertexIndices[index]!));
});

test("image textures behind the Principled BSDF: external, packed, mapping, reroute and normal map", () => {
  const { baseColor, roughness, normal, metallic } = material.textures!;
  expect(metallic).toBeUndefined();
  expect(material.principled!.metallic).toBeCloseTo(0.3, 5);

  expect(baseColor).toMatchObject({ imageName: "BaseImage", filepath: truth.images.BaseImage.filepath, colorSpace: truth.images.BaseImage.colorSpace });
  expect([baseColor!.uvMap, baseColor!.packedBytes]).toEqual([undefined, undefined]);
  expect(rounded(baseColor!.mapping!.location)).toEqual(rounded(truth.mapping.location));
  expect(rounded(baseColor!.mapping!.rotation)).toEqual(rounded(truth.mapping.rotation));
  expect(rounded(baseColor!.mapping!.scale)).toEqual(rounded(truth.mapping.scale));

  // Packed through a reroute: the PNG's own bytes, signature included.
  expect(roughness).toMatchObject({ imageName: "RoughImage", filepath: truth.images.RoughImage.filepath, colorSpace: "Non-Color" });
  expect(roughness!.mapping).toBeUndefined();
  expect(roughness!.packedBytes!.length).toBe(truth.packedRoughSize);
  expect(Array.from(roughness!.packedBytes!.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);

  expect(normal).toMatchObject({ imageName: "NormalImage", filepath: truth.images.NormalImage.filepath, colorSpace: "Non-Color", uvMap: "Second" });
  expect(normal!.strength).toBeCloseTo(truth.normalStrength, 5);
});

test("materials without image textures have no textures entry", () => {
  const sceneFile = parseBlendFile(readFileSync(join(inputDirectory, "scene_v43.blend")));
  expect(readMaterialAppearance(sceneFile.findDatablock("MA", "Red")!).textures).toBeUndefined();
});

test("3D view model: UV channels per triangle corner and textures per material slot", () => {
  const [plane] = buildRenderScene(blendFile).meshes;
  expect(plane!.uvChannels.map((channel) => channel.name)).toEqual(["UVMap", "Second"]);
  const corners = triangulateMeshGeometry(readMeshGeometry(mesh)).cornerIndices;
  for (const channel of plane!.uvChannels) {
    expect(channel.uvs).toHaveLength(plane!.triangleCount * 6);
    const mapValues = truth.uvMaps[channel.name] as number[];
    // Triangles keep their order here: the plane has one material slot.
    expect(rounded(channel.uvs)).toEqual(rounded(Array.from(corners).flatMap((corner) => mapValues.slice(corner * 2, corner * 2 + 2))));
  }
  const textures = plane!.materials[0]!.textures!;
  expect(textures.baseColor).toMatchObject({ key: "file://textures/texture_base.png", isColor: true });
  expect(textures.roughness).toMatchObject({ key: "packed:RoughImage", isColor: false });
  expect(textures.normal).toMatchObject({ key: "file://textures/texture_normal.exr", uvMap: "Second", isColor: false });
});

test("Mapping node to UV matrix: scale, then rotate about Z, then translate (Blender's point mapping)", () => {
  expect(mappingToUvTransform(undefined)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const matrix = mappingToUvTransform({ location: [0.25, 0.5, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 3, 1] });
  const apply = (u: number, v: number) => [matrix[0]! * u + matrix[1]! * v + matrix[2]!, matrix[3]! * u + matrix[4]! * v + matrix[5]!].map((value) => Number(value.toFixed(6)));
  // (1, 0) scales to (2, 0), rotates a quarter turn to (0, 2), moves to (0.25, 2.5).
  expect(apply(1, 0)).toEqual([0.25, 2.5]);
  expect(apply(0, 1)).toEqual([-2.75, 0.5]);
});

test("image paths: relative to the .blend file, then the file name next to it and in textures/", () => {
  expect(imagePathCandidates("/assets/grass", "//textures/diff.jpg")).toEqual(["/assets/grass/textures/diff.jpg", "/assets/grass/diff.jpg"]);
  expect(imagePathCandidates("/assets/grass/", "//../shared/rough.EXR")).toEqual(["/assets/shared/rough.EXR", "/assets/grass/rough.EXR", "/assets/grass/textures/rough.EXR"]);
  expect(imagePathCandidates("/a", "C:\\Users\\artist\\maps\\n.png")).toEqual(["/C:/Users/artist/maps/n.png", "/a/n.png", "/a/textures/n.png"]);
  expect(imagePathCandidates("/a", "/home/artist/n.png")).toEqual(["/home/artist/n.png", "/a/n.png", "/a/textures/n.png"]);
  // Only image files are read on a .blend file's behalf.
  expect(imagePathCandidates("/a", "//../../.ssh/id_rsa")).toEqual([]);
  expect(imagePathCandidates("/a", "//notes.txt")).toEqual([]);
  expect(imagePathCandidates("/a", "")).toEqual([]);
});
