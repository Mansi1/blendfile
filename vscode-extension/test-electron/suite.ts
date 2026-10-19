// Runs inside a real VS Code: opens each fixture, waits until the webview has parsed and rendered it,
// and checks what the preview reported against the truth files Blender wrote.
import * as assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import type { BlendPreviewApi } from "../src/host/extension.ts";
import type { PreviewReport } from "../src/messages.ts";

const EXTENSION_ID = "blendfile.blendfile-preview";
const REPORT_TIMEOUT_MS = 20_000;

const withTimeout = <T>(promise: Promise<T>, label: string) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out: ${label}`)), REPORT_TIMEOUT_MS))]);

export async function run(): Promise<void> {
  const repositoryRoot = process.env.BLEND_REPOSITORY_ROOT!;
  const extension = vscode.extensions.getExtension<BlendPreviewApi>(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is installed`);
  const api = await extension.activate();
  const results: Record<string, PreviewReport & { viewType?: string }> = {};

  // Blender 4.3 in background mode saved no thumbnail (no TEST block); 5.2 does.
  const fixtures = [
    { fileName: "v52.blend", truthName: "v52.truth.json", hasThumbnail: true },
    { fileName: "v52_zstd.blend", truthName: "v52.truth.json", hasThumbnail: true },
    { fileName: "v43.blend", truthName: "v43.truth.json", hasThumbnail: false },
    { fileName: "v43_gzip.blend", truthName: "v43.truth.json", hasThumbnail: false },
    { fileName: "scene_v52.blend", truthName: "scene_v52.truth.json", hasThumbnail: true },
    { fileName: "scene_v43.blend", truthName: "scene_v43.truth.json", hasThumbnail: false },
  ];
  for (const { fileName, truthName, hasThumbnail } of fixtures) {
    const uri = vscode.Uri.file(join(repositoryRoot, "input", fileName));
    // Plain "open" must pick the custom editor because it is registered with priority "default".
    await vscode.commands.executeCommand("vscode.open", uri);
    const tabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(tabInput instanceof vscode.TabInputCustom, `${fileName} opens in a custom editor`);
    assert.equal(tabInput.viewType, "blendfile.preview");
    const report = await withTimeout(api.waitForReport(uri), fileName);
    const truth = JSON.parse(readFileSync(join(repositoryRoot, "input", truthName), "utf8"));
    assert.ok(report.ok, `${fileName} parsed: ${report.ok ? "" : report.errorMessage}`);
    assert.equal(report.blenderVersion, `${truth.blender_version[0]}.${truth.blender_version[1]}`);
    assert.ok(report.datablockCount > 0 && report.blockCount > report.datablockCount);
    assert.equal(report.hasThumbnail, hasThumbnail, `${fileName} thumbnail`);
    // The 3D view drew inside VS Code's own webview (real GPU path, not headless Chromium).
    assert.ok(report.viewer, `${fileName}: the 3D view was mounted`);
    if (fileName.startsWith("scene_")) {
      const meshObjectCount = Object.values(truth.objects as Record<string, { type: string }>).filter((object) => object.type === "MESH").length;
      assert.equal(report.viewer.meshCount, meshObjectCount);
      assert.equal(report.viewer.triangleCount, 306);
    }
    results[fileName] = { ...report, viewType: tabInput.viewType };
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  }

  // Image textures: the host reads the external PNG and EXR next to the .blend file; the roughness PNG is packed.
  const textureUri = vscode.Uri.file(join(repositoryRoot, "input", "texture_v43.blend"));
  await vscode.commands.executeCommand("vscode.open", textureUri);
  const textureReport = await withTimeout(api.waitForReport(textureUri, (report) => report.ok && report.viewer?.textures !== undefined), "texture_v43.blend textures");
  assert.ok(textureReport.ok && textureReport.viewer?.textures);
  assert.deepEqual(textureReport.viewer.textures, { total: 3, loaded: 3, failed: [] });
  results["texture_v43.blend"] = textureReport;
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

  // The command from the explorer menu opens the same editor.
  const commandUri = vscode.Uri.file(join(repositoryRoot, "input", "v43.blend"));
  await vscode.commands.executeCommand("blendfile.openPreview", commandUri);
  const commandTab = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  assert.ok(commandTab instanceof vscode.TabInputCustom && commandTab.viewType === "blendfile.preview", "command opens the preview");

  writeFileSync(join(repositoryRoot, "output", "vscode-extension.json"), `${JSON.stringify(results, null, 2)}\n`);
}
