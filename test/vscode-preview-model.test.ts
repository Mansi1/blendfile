// The VS Code preview's view model on the real fixtures: grouping, filtering, totals and member rows.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type CameraDescription, parseBlendFile } from "../src/index.ts";
import { renderWebviewHtml } from "../vscode-extension/src/host/webview-html.ts";
import {
  describeFileFacts,
  describeMembers,
  filterDatablockGroups,
  groupDatablocksByIdCode,
  labelOfStruct,
  totalBlocksByCode,
} from "../vscode-extension/src/webview/preview-model.ts";
import { buildRenderScene } from "../vscode-extension/src/webview/scene-model.ts";
import { verticalFieldOfView } from "../vscode-extension/src/webview/viewport.ts";

const openFixture = (fileName: string) => parseBlendFile(readFileSync(join(import.meta.dir, "../input", fileName)));

describe.each(["v52.blend", "v43.blend"])("preview model for %s", (fileName) => {
  const blendFile = openFixture(fileName);
  const groups = groupDatablocksByIdCode(blendFile);

  test("groups datablocks by ID code, scene content before interface state", () => {
    const objects = groups.find((group) => group.idCode === "OB")!;
    expect(objects.label).toBe("Objects");
    expect(objects.entries.map((entry) => entry.name).sort()).toEqual(["ProbeCube", "ProbeEmpty"]);
    const order = groups.map((group) => group.idCode);
    expect(order.indexOf("OB")).toBeLessThan(order.indexOf("WM"));
    expect(order.slice(-3).sort()).toEqual(["SR", "WM", "WS"]);
    expect(groups.filter((group) => group.isInterfaceState).map((group) => group.idCode).sort()).toEqual(["SR", "WM", "WS"]);
  });

  test("filters by name, ID code and struct type", () => {
    expect(filterDatablockGroups(groups, "probecube").flatMap((group) => group.entries.map((entry) => entry.name))).toEqual(["ProbeCube"]);
    expect(filterDatablockGroups(groups, "ma").some((group) => group.idCode === "MA")).toBe(true);
    expect(filterDatablockGroups(groups, "Material").find((group) => group.idCode === "MA")?.entries.map((entry) => entry.name)).toContain("ProbeMaterial");
    expect(filterDatablockGroups(groups, "  ")).toBe(groups);
    expect(filterDatablockGroups(groups, "no such datablock")).toEqual([]);
  });

  test("totals blocks by code, largest payload first", () => {
    const totals = totalBlocksByCode(blendFile);
    expect(totals.reduce((sum, total) => sum + total.count, 0)).toBe(blendFile.blocks.length);
    expect(totals.map((total) => total.bytes)).toEqual(totals.map((total) => total.bytes).sort((left, right) => right - left));
    expect(totals.map((total) => total.code)).toContain("DNA1");
  });

  test("member rows show values and link pointers to their targets", () => {
    const cube = groups.find((group) => group.idCode === "OB")!.entries.find((entry) => entry.name === "ProbeCube")!.struct;
    const rows = describeMembers(cube);
    expect(rows).toHaveLength(cube.structType.members.length);
    const dataRow = rows.find((row) => row.member.name === "data")!;
    expect(dataRow.valueText).toMatch(/^0x[0-9a-f]+ → Mesh "ProbeMesh"$/);
    expect(labelOfStruct(dataRow.openTarget!)).toBe("ProbeMesh");
    expect(rows.find((row) => row.member.name === "loc")!.valueText).toBe("[1,2,3]");
    const idRow = rows.find((row) => row.member.name === "id")!;
    expect(idRow.valueText).toBe("{ ID }");
    expect(idRow.openTarget?.structType.name).toBe("ID");
    expect(rows.filter((row) => row.valueText === "null").length).toBeGreaterThan(0);
  });

  test("file facts name version, layout and compression", () => {
    const facts = Object.fromEntries(describeFileFacts(blendFile, fileName));
    expect(facts.File).toBe(fileName);
    expect(facts.Blender).toBe(blendFile.blenderVersion);
    expect(facts.Compression).toBe("none");
    expect(facts.Blocks).toBe(String(blendFile.blocks.length));
  });
});

test("webview page allows only its own origin and the nonce script", () => {
  const html = renderWebviewHtml({ cspSource: "https://webview.test", scriptUri: "https://webview.test/preview.js", styleUri: "https://webview.test/preview.css", nonce: "abc123" });
  expect(html).toStartWith("<!doctype html>");
  expect(html).toContain("default-src 'none'; img-src https://webview.test data: blob:; style-src https://webview.test; script-src 'nonce-abc123'");
  expect(html).toContain('<script nonce="abc123" src="https://webview.test/preview.js"></script>');
});

describe.each(["scene_v43.blend", "scene_v52.blend"])("3D view model for %s", (fileName) => {
  const renderScene = buildRenderScene(openFixture(fileName));
  const meshByObject = new Map(renderScene.meshes.map((mesh) => [mesh.objectName, mesh]));

  test("sorts objects into meshes, lights, cameras and empties", () => {
    expect(renderScene.sceneName).toBe("ViewerScene");
    expect(renderScene.meshes).toHaveLength(9);
    expect(renderScene.lights.map((light) => light.light.type).sort()).toEqual(["area", "point", "spot", "sun"]);
    expect(renderScene.cameras.map((camera) => [camera.objectName, camera.isSceneCamera])).toEqual([["Cam", true]]);
    expect(renderScene.empties.map((empty) => empty.objectName)).toEqual(["Marker"]);
    expect(renderScene.skippedObjects).toEqual([]);
    expect(meshByObject.get("Ball")!.modifierNames).toEqual(["Subdivision"]);
    expect(meshByObject.get("Box")!.modifierNames).toEqual([]);
  });

  test("triangles cover every face, grouped by material slot, with unit normals", () => {
    for (const mesh of renderScene.meshes) {
      expect(mesh.positions.length).toBe(mesh.triangleCount * 9);
      expect(mesh.normals.length).toBe(mesh.positions.length);
      expect(mesh.groups.reduce((sum, group) => sum + group.count, 0)).toBe(mesh.triangleCount * 3);
      expect(mesh.groups.map((group) => group.materialSlot)).toEqual([...new Set(mesh.groups.map((group) => group.materialSlot))].sort());
      for (let index = 0; index < mesh.normals.length; index += 3) expect(Math.hypot(mesh.normals[index]!, mesh.normals[index + 1]!, mesh.normals[index + 2]!)).toBeCloseTo(1, 5);
    }
    // The box's top and bottom faces (4 triangles) use slot 1, the sides (8 triangles) slot 0.
    expect(meshByObject.get("Box")!.groups.map(({ count, materialSlot }) => [materialSlot, count / 3])).toEqual([[0, 8], [1, 4]]);
  });

  test("flat faces get face normals, smooth faces averaged vertex normals", () => {
    const box = meshByObject.get("Box")!;
    const firstNormal = Array.from(box.normals.subarray(0, 3));
    expect(Array.from(box.normals.subarray(3, 6))).toEqual(firstNormal);
    expect(firstNormal.filter((component) => Math.abs(component) > 0.99)).toHaveLength(1);
    const ball = meshByObject.get("Ball")!;
    const firstCornerNormal = Array.from(ball.normals.subarray(0, 3));
    expect(Array.from(ball.normals.subarray(3, 6))).not.toEqual(firstCornerNormal);
  });

  test("wire edges are face boundaries without triangulation diagonals", () => {
    expect(meshByObject.get("Box")!.edgePositions.length).toBe(12 * 6);
    expect(meshByObject.get("Star")!.edgePositions.length).toBe(10 * 6);
    expect(meshByObject.get("Ground")!.edgePositions.length).toBe(4 * 6);
  });

  test("materials: viewport colors for solid mode, Principled values for material preview", () => {
    const [red, viewportOnly] = meshByObject.get("Box")!.materials;
    expect(red!.name).toBe("Red");
    expect(red!.viewportColor[0]).toBeCloseTo(0.9, 5);
    expect(red!.baseColor.map((channel) => Number(channel.toFixed(3)))).toEqual([0.8, 0.05, 0.05]);
    expect(viewportOnly!.viewportColor.map((channel) => Number(channel.toFixed(3)))).toEqual([0.1, 0.6, 0.2]);
    const gold = meshByObject.get("Ball")!.materials[0]!;
    expect([gold.metallic, Number(gold.roughness.toFixed(3))]).toEqual([1, 0.2]);
    expect(meshByObject.get("Star")!.materials).toEqual([]);
  });

  test("bounds enclose visible objects, world color and resolution come from the scene", () => {
    const { min, max } = renderScene.bounds!;
    expect(min[0]).toBeLessThanOrEqual(-8);
    expect(max[0]).toBeGreaterThanOrEqual(12); // the camera at x = 12
    expect(max[2]).toBe(10); // the sun at z = 10
    expect(renderScene.worldColor.map((channel) => Number(channel.toFixed(3)))).toEqual([0.05, 0.1, 0.2]);
    expect(renderScene.resolution).toEqual([800, 600]);
  });
});

test("camera field of view follows Blender's sensor fit", () => {
  const camera: CameraDescription = { name: "c", projection: "perspective", lens: 35, sensorWidth: 36, sensorHeight: 24, sensorFit: "auto", orthoScale: 6, clipStart: 0.1, clipEnd: 100, shift: [0, 0] };
  const degrees = (radians: number) => Number(((radians * 180) / Math.PI).toFixed(2));
  // Landscape, auto: sensor width spans the image width (horizontal FOV 54.43°).
  expect(degrees(verticalFieldOfView(camera, 4 / 3))).toBe(42.18);
  // Portrait, auto: sensor width spans the image height.
  expect(degrees(verticalFieldOfView(camera, 3 / 4))).toBe(54.43);
  expect(degrees(verticalFieldOfView({ ...camera, sensorFit: "vertical" }, 4 / 3))).toBe(37.85);
  expect(degrees(verticalFieldOfView({ ...camera, sensorFit: "horizontal" }, 3 / 4))).toBe(68.88);
});
