// Scene reading for 3D viewers, checked against what Blender 4.3 and 5.2 reported for the same scene
// (input/scene_*.truth.json, written by tools/make_scene_fixture.py).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Block,
  composeObjectLocalMatrix,
  createAddressResolver,
  eulerToMatrix3,
  multiplyMatrices,
  parseBlendFile,
  readCamera,
  readLight,
  readMaterialAppearance,
  readMeshAttribute,
  readMeshGeometry,
  readScene,
  triangulateMeshGeometry,
  triangulatePolygon,
} from "../src/index.ts";

const inputDirectory = join(import.meta.dir, "../input");
const FLOAT_TOLERANCE = 1e-5;

describe.each(["scene_v43", "scene_v52"])("%s", (fixtureName) => {
  const blendFile = parseBlendFile(readFileSync(join(inputDirectory, `${fixtureName}.blend`)));
  const truth = JSON.parse(readFileSync(join(inputDirectory, `${fixtureName}.truth.json`), "utf8"));
  const scene = readScene(blendFile);
  const objectByName = new Map(scene.objects.map((object) => [object.name, object]));

  test("scene settings", () => {
    expect(scene.name).toBe(truth.scene.name);
    expect(scene.cameraName).toBe(truth.scene.camera);
    expect(scene.resolution).toEqual(truth.scene.resolution);
    scene.worldColor!.forEach((channel, index) => expect(channel).toBeCloseTo(truth.scene.world_color[index], 6));
  });

  test("every object of the view layer, with type, parent and material slots", () => {
    const expectedNames = Object.entries(truth.objects).filter(([, object]) => (object as { in_view_layer: boolean }).in_view_layer).map(([name]) => name);
    expect([...objectByName.keys()].sort()).toEqual(expectedNames.sort());
    for (const object of scene.objects) {
      const expected = truth.objects[object.name];
      expect(object.type).toBe(expected.type === "LIGHT" ? "light" : expected.type.toLowerCase());
      expect(object.parentName ?? null).toBe(expected.parent);
      expect(object.data?.datablockName ?? null).toBe(expected.data);
      expect(object.materials.map((material) => material?.datablockName ?? null)).toEqual(expected.materials);
    }
  });

  test("visibility: object flag, eye icon and hidden collection", () => {
    for (const object of scene.objects) expect({ name: object.name, visible: object.visible }).toEqual({ name: object.name, visible: truth.objects[object.name].visible });
    expect(objectByName.get("HiddenByFlag")!.visible).toBe(false);
    expect(objectByName.get("HiddenByEye")!.visible).toBe(false);
    expect(objectByName.get("InHiddenCollection")!.visible).toBe(false);
  });

  test("world matrices: every rotation mode, delta transforms and parenting", () => {
    for (const object of scene.objects) {
      // Blender skips evaluating objects in hidden collections, so their saved matrix_world is stale; its location is the truth there.
      if (object.name === "InHiddenCollection") {
        expect(Array.from(object.worldMatrix.subarray(12, 15))).toEqual([0, 5, 0]);
        continue;
      }
      const expectedRows: number[][] = truth.objects[object.name].matrix_world;
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          expect(Math.abs(object.worldMatrix[column * 4 + row]! - expectedRows[row]![column]!)).toBeLessThan(FLOAT_TOLERANCE);
        }
      }
    }
    expect(new Set(scene.objects.map((object) => object.object.readMember("rotmode"))).size).toBeGreaterThanOrEqual(6);
  });

  test("mesh faces, materials per face, smooth flags and triangles", () => {
    const meshNames = new Set(scene.objects.filter((object) => object.type === "mesh").map((object) => object.data!.datablockName!));
    expect([...meshNames].sort()).toEqual(Object.keys(truth.meshes).sort());
    for (const meshName of meshNames) {
      const mesh = blendFile.findDatablock("ME", meshName)!;
      const expected = truth.meshes[meshName];
      const geometry = readMeshGeometry(mesh);
      const faces = Array.from({ length: geometry.faceOffsets.length - 1 }, (_, face) => Array.from(geometry.cornerVertices.subarray(geometry.faceOffsets[face], geometry.faceOffsets[face + 1])));
      expect(faces).toEqual(expected.faces);
      expect(Array.from(geometry.faceMaterialIndices)).toEqual(expected.material_indices);
      expect(Array.from(geometry.faceSmooth, Boolean)).toEqual(expected.smooth);
      Array.from(geometry.positions).forEach((coordinate, index) => expect(coordinate).toBeCloseTo(expected.positions[Math.floor(index / 3)][index % 3], 5));
      const triangles = triangulateMeshGeometry(geometry);
      expect(triangles.vertexIndices.length / 3).toBe(expected.triangles);
      expect(triangles.faceIndices.length).toBe(expected.triangles);
    }
  });

  test("material appearance: viewport color and unlinked Principled BSDF inputs", () => {
    for (const material of blendFile.listDatablocks("MA")) {
      const appearance = readMaterialAppearance(material);
      const expected = truth.materials[appearance.name];
      appearance.viewportColor.forEach((channel, index) => expect(channel).toBeCloseTo(expected.diffuse_color[index], 6));
      expect(appearance.metallic).toBeCloseTo(expected.metallic, 6);
      expect(appearance.roughness).toBeCloseTo(expected.roughness, 6);
      if (expected.principled === null) expect(appearance.principled).toBeUndefined();
      else {
        appearance.principled!.baseColor.forEach((channel, index) => expect(channel).toBeCloseTo(expected.principled.base_color[index], 6));
        expect(appearance.principled!.metallic).toBeCloseTo(expected.principled.metallic, 6);
        expect(appearance.principled!.roughness).toBeCloseTo(expected.principled.roughness, 6);
      }
    }
  });

  test("lights and cameras", () => {
    for (const lamp of blendFile.listDatablocks("LA")) {
      const light = readLight(lamp);
      const expected = truth.lights[light.name];
      expect(light.type).toBe(expected.type.toLowerCase());
      expect(light.power).toBeCloseTo(expected.energy, 4);
      light.color.forEach((channel, index) => expect(channel).toBeCloseTo(expected.color[index], 6));
      if (expected.spot_size !== null) expect(light.spotSize).toBeCloseTo(expected.spot_size, 6);
      if (expected.spot_blend !== null) expect(light.spotBlend).toBeCloseTo(expected.spot_blend, 6);
      if (expected.size !== null) expect(light.areaSize[0]).toBeCloseTo(expected.size, 6);
    }
    const camera = readCamera(blendFile.findDatablock("CA", "CamData")!);
    const expected = truth.cameras.CamData;
    expect(camera.projection).toBe("perspective");
    expect(camera.lens).toBeCloseTo(expected.lens, 6);
    expect(camera.sensorWidth).toBeCloseTo(expected.sensor_width, 6);
    expect(camera.sensorFit).toBe(expected.sensor_fit.toLowerCase());
    expect(camera.clipStart).toBeCloseTo(expected.clip_start, 6);
    expect(camera.clipEnd).toBeCloseTo(expected.clip_end, 6);
  });

  test("named attributes and missing ones", () => {
    const mesh = blendFile.findDatablock("ME", "BoxMesh")!;
    expect(readMeshAttribute(mesh, ".corner_vert", "int", 24)).toHaveLength(24);
    expect(readMeshAttribute(mesh, "no such attribute", "int", 24)).toBeUndefined();
  });
});

test("Blender 5.2 reuses data addresses across datablocks; pointers resolve within their own datablock", () => {
  const blendFile = parseBlendFile(readFileSync(join(inputDirectory, "scene_v52.blend")));
  const dataAddresses = blendFile.blocks.filter((block) => block.code === "DATA").map((block) => block.address);
  expect(new Set(dataAddresses).size).toBeLessThan(dataAddresses.length);
  // Without scoping, BoxMesh would read the Ball's 480 corners.
  const boxCorners = readMeshAttribute(blendFile.findDatablock("ME", "BoxMesh")!, ".corner_vert", "int", 24)!;
  const ballCorners = readMeshAttribute(blendFile.findDatablock("ME", "BallMesh")!, ".corner_vert", "int", 480)!;
  expect(boxCorners).toHaveLength(24);
  expect(ballCorners).toHaveLength(480);
});

test("address resolver prefers the referencing datablock's data, then datablocks, then the first block", () => {
  const makeBlock = (code: string, address: bigint, headerOffset: number): Block => ({ code, sdnaIndex: 0, address, size: 8, count: 1, headerOffset, offset: headerOffset + 8 });
  const firstMesh = makeBlock("ME", 0x100n, 0);
  const firstData = makeBlock("DATA", 0x200n, 16);
  const secondMesh = makeBlock("ME", 0x300n, 32);
  const secondData = makeBlock("DATA", 0x200n, 48);
  const resolve = createAddressResolver([firstMesh, firstData, secondMesh, secondData]);
  expect(resolve(0x200n, secondMesh.offset)).toBe(secondData);
  expect(resolve(0x200n, firstMesh.offset)).toBe(firstData);
  expect(resolve(0x200n, secondData.offset + 4)).toBe(secondData);
  expect(resolve(0x300n, firstData.offset)).toBe(secondMesh);
  expect(resolve(0x200n)).toBe(firstData);
  expect(resolve(0n, firstMesh.offset)).toBeUndefined();
  expect(resolve(0x999n, firstMesh.offset)).toBeUndefined();
});

describe("triangulatePolygon", () => {
  const flatPositions = (points: [number, number][]) => points.flatMap(([x, y]) => [x, y, 0]);
  const triangleArea = (positions: number[], [a, b, c]: number[]) =>
    ((positions[b! * 3]! - positions[a! * 3]!) * (positions[c! * 3 + 1]! - positions[a! * 3 + 1]!) - (positions[c! * 3]! - positions[a! * 3]!) * (positions[b! * 3 + 1]! - positions[a! * 3 + 1]!)) / 2;

  test("concave L-shape: triangles cover exactly the polygon and keep its winding", () => {
    const positions = flatPositions([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]);
    const triangles = triangulatePolygon(positions, [0, 1, 2, 3, 4, 5]);
    expect(triangles).toHaveLength(12);
    const areas = Array.from({ length: 4 }, (_, index) => triangleArea(positions, triangles.slice(index * 3, index * 3 + 3)));
    expect(areas.every((area) => area > 0)).toBe(true);
    expect(areas.reduce((sum, area) => sum + area, 0)).toBeCloseTo(3, 10);
  });

  test("clockwise faces and faces in other planes", () => {
    const clockwise = flatPositions([[0, 0], [0, 1], [1, 1], [1, 0]]);
    const triangles = triangulatePolygon(clockwise, [0, 1, 2, 3]);
    expect(triangles).toHaveLength(6);
    const verticalFace = [0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1];
    expect(triangulatePolygon(verticalFace, [0, 1, 2, 3])).toHaveLength(6);
  });

  test("degenerate input still gives n − 2 triangles; fewer than 3 corners give none", () => {
    const collinear = flatPositions([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(triangulatePolygon(collinear, [0, 1, 2, 3])).toHaveLength(6);
    expect(triangulatePolygon(collinear, [0, 1])).toEqual([]);
    expect(triangulatePolygon(collinear, [2, 1, 0])).toEqual([2, 1, 0]);
  });
});

test("transform math: Euler order XYZ applies X first, and local matrices compose loc · rot · scale", () => {
  const [columnX, columnY] = eulerToMatrix3([Math.PI / 2, 0, Math.PI / 2], 1);
  // Rotating +X by 90° about X leaves it; then 90° about Z turns it into +Y.
  expect(columnX.map((value) => Math.round(value) + 0)).toEqual([0, 1, 0]);
  expect(columnY.map((value) => Math.round(value) + 0)).toEqual([0, 0, 1]);
  const local = composeObjectLocalMatrix({
    loc: [1, 2, 3], dloc: [0, 0, 1], size: [2, 2, 2], dscale: [1, 1, 0.5], rotmode: 1, rot: [0, 0, 0], drot: [0, 0, 0],
    quat: [1, 0, 0, 0], dquat: [1, 0, 0, 0], rotAxis: [0, 1, 0], rotAngle: 0, drotAxis: [0, 1, 0], drotAngle: 0,
  });
  expect(Array.from(local)).toEqual([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 1, 2, 4, 1]);
  expect(Array.from(multiplyMatrices(local, local).subarray(12, 15))).toEqual([3, 6, 8]);
});
