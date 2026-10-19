// The VS Code extension's webview page in Chromium, outside VS Code: the same HTML, CSP, script and styles,
// with acquireVsCodeApi stubbed and the host's "load" message sent by the test.
import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderWebviewHtml } from "../vscode-extension/src/host/webview-html.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const ORIGIN = "https://webview.test";
const SERVED_FILES: Record<string, { path: string; contentType: string }> = {
  "/preview.js": { path: "vscode-extension/media/preview.js", contentType: "text/javascript" },
  "/preview.css": { path: "vscode-extension/media/preview.css", contentType: "text/css" },
};

/**
 * Opens the page with acquireVsCodeApi stubbed. `imageFiles` (Image.filepath → bytes) answers the page's readImage
 * requests the way the host does; other paths get the host's "not found" error.
 */
async function openWebview(page: Page, colorScheme: "light" | "dark" = "dark", imageFiles: Record<string, number[]> = {}) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.emulateMedia({ colorScheme });
  await page.route(`${ORIGIN}/**`, (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/index.html") {
      return route.fulfill({ contentType: "text/html", body: renderWebviewHtml({ cspSource: ORIGIN, scriptUri: `${ORIGIN}/preview.js`, styleUri: `${ORIGIN}/preview.css`, nonce: "e2etestnonce" }) });
    }
    const served = SERVED_FILES[pathname];
    return served ? route.fulfill({ contentType: served.contentType, body: readFileSync(join(repositoryRoot, served.path)) }) : route.fulfill({ status: 404 });
  });
  // VS Code injects acquireVsCodeApi; the stub records what the page sends to the host.
  await page.addInitScript((files: Record<string, number[]>) => {
    const sent: unknown[] = [];
    const postMessage = (message: { type: string; requestId?: number; filepath?: string }) => {
      sent.push(message);
      if (message.type !== "readImage") return;
      const bytes = files[message.filepath!];
      const reply = bytes ? { type: "image", requestId: message.requestId, bytes: new Uint8Array(bytes) } : { type: "image", requestId: message.requestId, errorMessage: `'${message.filepath}' was not found` };
      setTimeout(() => window.postMessage(reply, "*"));
    };
    Object.assign(window, { sentToHost: sent, acquireVsCodeApi: () => ({ postMessage }) });
  }, imageFiles);
  await page.goto(`${ORIGIN}/index.html`);
  return errors;
}

/** What the host does: read the file and send its bytes in a "load" message. The page's CSP forbids fetch. */
async function sendFile(page: Page, fileName: string, bytes = Array.from(readFileSync(join(repositoryRoot, "input", fileName)))) {
  await page.evaluate(({ fileName, bytes }) => {
    window.postMessage({ type: "load", fileName, bytes: new Uint8Array(bytes) }, "*");
  }, { fileName, bytes });
}

/** The inspector is the second tab; the 3D view opens first. */
const openInspector = (page: Page) => page.getByRole("tab", { name: "Inspector" }).click();

/** Share of canvas pixels that differ from the empty viewport background, read back from the WebGL canvas. */
const paintedShare = (page: Page) =>
  page.locator(".viewport-canvas").evaluate((canvas: HTMLCanvasElement) => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext("2d")!;
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
    let painted = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (Math.abs(pixels[index]! - 0x30) + Math.abs(pixels[index + 1]! - 0x30) + Math.abs(pixels[index + 2]! - 0x30) > 24) painted += 1;
    }
    return painted / (pixels.length / 4);
  });

/** Average color of the canvas pixels inside a box given as fractions of the canvas size. */
const averageColorIn = (page: Page, box: { left: number; top: number; width: number; height: number }) =>
  page.locator(".viewport-canvas").evaluate((canvas: HTMLCanvasElement, area) => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext("2d")!;
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(Math.round(area.left * canvas.width), Math.round(area.top * canvas.height), Math.round(area.width * canvas.width), Math.round(area.height * canvas.height)).data;
    const sum = [0, 0, 0];
    for (let index = 0; index < pixels.length; index += 4) for (let channel = 0; channel < 3; channel += 1) sum[channel]! += pixels[index + channel]!;
    return sum.map((total) => Math.round(total / (pixels.length / 4)));
  }, box);

const renderNow = (page: Page) => page.evaluate(() => (window as unknown as { blendViewport: { renderFrame(): void } }).blendViewport.renderFrame());

const sentToHost = (page: Page) => page.evaluate(() => (window as unknown as { sentToHost: unknown[] }).sentToHost);

test("webview asks for the file, renders it and reports back", async ({ page }) => {
  const errors = await openWebview(page);
  expect(await sentToHost(page)).toEqual([{ type: "ready" }]);
  await sendFile(page, "v52_zstd.blend");

  await expect(page.getByRole("heading", { level: 1, name: "v52_zstd.blend" })).toBeVisible();
  await openInspector(page);
  await expect(page.getByText("Blender 5.2", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "File thumbnail" })).toBeVisible();
  await expect(page.getByText("Scene ProbeScene, frames 7–42")).toBeVisible();
  await expect.poll(() => sentToHost(page)).toContainEqual(expect.objectContaining({ type: "rendered", fileName: "v52_zstd.blend", report: expect.objectContaining({ ok: true, blenderVersion: "5.2", hasThumbnail: true }) }));

  // The thumbnail canvas has real pixels, not a blank image.
  const paintedPixels = await page.locator("#thumbnail").evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index]! > 0) count += 1;
    return count;
  });
  expect(paintedPixels).toBeGreaterThan(1000);
  await page.screenshot({ path: join(repositoryRoot, "output/screenshots/vscode-preview.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("datablocks open in the struct browser and pointers can be followed", async ({ page }) => {
  const errors = await openWebview(page);
  await sendFile(page, "v52_zstd.blend");
  await openInspector(page);
  await page.getByRole("button", { name: "ProbeCube" }).click();
  await expect(page.getByRole("heading", { name: "Object", exact: true })).toBeVisible();
  const membersTable = page.getByRole("table", { name: "Object" });
  await expect(membersTable.getByRole("row").filter({ has: page.getByRole("cell", { name: "loc[3]", exact: true }) })).toContainText("[1,2,3]");

  await membersTable.getByRole("button", { name: /→ Mesh "ProbeMesh"/ }).click();
  await expect(page.getByRole("heading", { name: "Mesh", exact: true })).toBeVisible();
  const breadcrumb = page.getByRole("navigation", { name: "Opened structs" });
  await expect(breadcrumb).toContainText("ProbeCube");
  await expect(breadcrumb.locator("[aria-current=page]")).toHaveText("ProbeMesh");

  await breadcrumb.getByRole("button", { name: "ProbeCube" }).click();
  await expect(page.getByRole("heading", { name: "Object", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("filter narrows the datablock list and keeps focus while typing", async ({ page }) => {
  await openWebview(page, "light");
  await sendFile(page, "v43.blend");
  await openInspector(page);
  const filter = page.getByRole("searchbox", { name: "Filter datablocks" });
  await filter.pressSequentially("probe");
  await expect(filter).toBeFocused();
  await expect(page.getByRole("button", { name: "ProbeMaterial" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ProbeScene" })).toBeVisible();
  await expect(page.locator(".group summary").filter({ hasText: "Screens" })).toHaveCount(0);
  await filter.fill("zzz-nothing");
  await expect(page.getByText("No datablock matches")).toBeVisible();
});

test("a file that is not a .blend file shows the error and reports it", async ({ page }) => {
  await openWebview(page);
  await sendFile(page, "broken.blend", Array.from(new TextEncoder().encode("this is not a blend file")));
  await expect(page.getByRole("alert")).toContainText("NOT_BLEND");
  await expect.poll(() => sentToHost(page)).toContainEqual(expect.objectContaining({ type: "rendered", report: expect.objectContaining({ ok: false }) }));
});

test("a reload of the same file keeps the opened datablock", async ({ page }) => {
  await openWebview(page);
  await sendFile(page, "v52_zstd.blend");
  await openInspector(page);
  await page.getByRole("button", { name: "ProbeMaterial" }).click();
  await expect(page.getByRole("heading", { name: "Material", exact: true })).toBeVisible();
  await sendFile(page, "v52_zstd.blend");
  await expect(page.getByRole("heading", { name: "Material", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Opened structs" }).locator("[aria-current=page]")).toHaveText("ProbeMaterial");
});

test.describe("3D view", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("draws the scene in every shading mode and reports what it drew", async ({ page }) => {
    const errors = await openWebview(page);
    await sendFile(page, "scene_v52.blend");
    await expect(page.getByRole("tab", { name: "3D View" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#viewer-statistics")).toContainText("Objects 15 · Vertices");
    await expect(page.locator("#viewer-statistics")).toContainText("Triangles 306");
    await expect(page.getByText("Modifiers not applied: Ball (Subdivision)")).toBeVisible();
    await expect.poll(() => sentToHost(page)).toContainEqual(expect.objectContaining({
      type: "rendered",
      report: expect.objectContaining({ viewer: { objectCount: 15, meshCount: 9, triangleCount: 306, skippedCount: 0 } }),
    }));

    const shares: Record<string, number> = {};
    for (const mode of ["Wireframe", "Solid", "Material", "Rendered"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      await expect(page.getByRole("button", { name: mode, exact: true })).toHaveAttribute("aria-pressed", "true");
      await renderNow(page);
      shares[mode] = await paintedShare(page);
      await page.screenshot({ path: join(repositoryRoot, `output/screenshots/vscode-3d-${mode.toLowerCase()}.png`) });
    }
    // Wireframe draws lines only; filled modes cover much more of the canvas. Rendered fills the background with the world color.
    expect(shares.Wireframe).toBeGreaterThan(0.01);
    expect(shares.Solid).toBeGreaterThan(shares.Wireframe!);
    expect(shares.Material).toBeGreaterThan(0.1);
    expect(shares.Rendered).toBeGreaterThan(0.9);
    expect(errors).toEqual([]);
  });

  test("camera view frames the scene camera at the render's aspect ratio", async ({ page }) => {
    await openWebview(page);
    await sendFile(page, "scene_v52.blend");
    await page.getByRole("button", { name: "Solid", exact: true }).click();
    await page.getByRole("button", { name: "Camera view" }).click();
    await expect(page.getByRole("button", { name: "Camera view" })).toHaveAttribute("aria-pressed", "true");
    await renderNow(page);
    await page.screenshot({ path: join(repositoryRoot, "output/screenshots/vscode-3d-camera.png") });
    // Corners lie outside the 4:3 frame in a wider canvas: passepartout color, not the viewport background.
    const corner = await averageColorIn(page, { left: 0, top: 0.4, width: 0.02, height: 0.2 });
    expect(corner).toEqual([0x1a, 0x1a, 0x1a]);
  });

  test("material preview shows Principled base colors: the gold ball and the red box", async ({ page }) => {
    await openWebview(page);
    await sendFile(page, "scene_v52.blend");
    await page.getByRole("button", { name: "Material", exact: true }).click();
    await page.getByRole("button", { name: "Camera view" }).click();
    await renderNow(page);
    const pixels = await page.locator(".viewport-canvas").evaluate((canvas: HTMLCanvasElement) => {
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext("2d")!;
      context.drawImage(canvas, 0, 0);
      const data = context.getImageData(0, 0, copy.width, copy.height).data;
      let reddish = 0;
      let golden = 0;
      for (let index = 0; index < data.length; index += 4) {
        const [red, green, blue] = [data[index]!, data[index + 1]!, data[index + 2]!];
        // AgX tone mapping (as in Blender) desaturates bright colors, so classify by channel ratios.
        if (red > 100 && red > green * 1.6 && red > blue * 1.6) reddish += 1;
        if (red > 100 && green > blue * 1.25 && red > blue * 1.6 && green > red * 0.55) golden += 1;
      }
      return { reddish, golden };
    });
    expect(pixels.reddish).toBeGreaterThan(200);
    expect(pixels.golden).toBeGreaterThan(200);
  });

  test("material preview shows image textures: external PNG and EXR from the host, packed PNG from the file", async ({ page }) => {
    const imageFile = (name: string) => Array.from(readFileSync(join(repositoryRoot, "input/textures", name)));
    const errors = await openWebview(page, "dark", { "//textures/texture_base.png": imageFile("texture_base.png"), "//textures/texture_normal.exr": imageFile("texture_normal.exr") });
    await sendFile(page, "texture_v43.blend");
    await expect(page.locator("#viewer-textures")).toHaveText("Textures 3/3");
    // The packed roughness image never goes through the host.
    const requested = (await sentToHost(page)).filter((message) => (message as { type: string }).type === "readImage").map((message) => (message as { filepath: string }).filepath);
    expect(requested.sort()).toEqual(["//textures/texture_base.png", "//textures/texture_normal.exr"]);
    await expect.poll(() => sentToHost(page)).toContainEqual(expect.objectContaining({
      type: "rendered",
      report: expect.objectContaining({ viewer: expect.objectContaining({ textures: { total: 3, loaded: 3, failed: [] } }) }),
    }));

    await page.getByRole("button", { name: "Material", exact: true }).click();
    await page.getByRole("button", { name: "Camera view" }).click();
    await renderNow(page);
    await page.screenshot({ path: join(repositoryRoot, "output/screenshots/vscode-3d-textures.png") });
    // The base color image has a red and a blue row; without it the plane would be the grey constant.
    const pixels = await page.locator(".viewport-canvas").evaluate((canvas: HTMLCanvasElement) => {
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext("2d")!;
      context.drawImage(canvas, 0, 0);
      const data = context.getImageData(0, 0, copy.width, copy.height).data;
      let reddish = 0;
      let bluish = 0;
      for (let index = 0; index < data.length; index += 4) {
        const [red, green, blue] = [data[index]!, data[index + 1]!, data[index + 2]!];
        if (red > 80 && red > green * 1.6 && red > blue * 1.6) reddish += 1;
        if (blue > 80 && blue > red * 1.6 && blue > green * 1.6) bluish += 1;
      }
      return { reddish, bluish };
    });
    expect(pixels.reddish).toBeGreaterThan(1000);
    expect(pixels.bluish).toBeGreaterThan(1000);
    expect(errors).toEqual([]);
  });

  test("a missing image file is named in the status line; the other textures still load", async ({ page }) => {
    await openWebview(page, "dark", { "//textures/texture_base.png": Array.from(readFileSync(join(repositoryRoot, "input/textures/texture_base.png"))) });
    await sendFile(page, "texture_v43.blend");
    const status = page.locator("#viewer-textures");
    await expect(status).toHaveText("Textures 2/3 · 1 missing: NormalImage");
    await expect(status.locator("[title]")).toHaveAttribute("title", "NormalImage: '//textures/texture_normal.exr' was not found");
  });

  test("outliner selects, hides and inspects objects", async ({ page }) => {
    const errors = await openWebview(page);
    await sendFile(page, "scene_v52.blend");
    const outliner = page.getByRole("list", { name: "Scene objects" });
    await expect(outliner.getByRole("checkbox", { name: "Show HiddenByEye" })).not.toBeChecked();
    await expect(outliner.getByRole("checkbox", { name: "Show HiddenByFlag" })).not.toBeChecked();
    await expect(outliner.getByRole("checkbox", { name: "Show InHiddenCollection" })).not.toBeChecked();
    await expect(outliner.getByRole("checkbox", { name: "Show Box" })).toBeChecked();

    await outliner.getByRole("button", { name: "Ball", exact: true }).click();
    await expect(outliner.locator("li.selected")).toContainText("Ball");

    await renderNow(page);
    const before = await paintedShare(page);
    await page.getByRole("button", { name: "Solid", exact: true }).click();
    await outliner.getByRole("checkbox", { name: "Show Ground" }).uncheck();
    await renderNow(page);
    expect(await paintedShare(page)).toBeLessThan(before);

    await outliner.getByRole("button", { name: "Inspect Box" }).click();
    await expect(page.getByRole("tab", { name: "Inspector" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Object", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Opened structs" }).locator("[aria-current=page]")).toHaveText("Box");
    expect(errors).toEqual([]);
  });

  test("clicking in the viewport selects the object under the pointer; keys switch views", async ({ page }) => {
    await openWebview(page);
    await sendFile(page, "scene_v43.blend");
    const canvas = page.locator(".viewport-canvas");
    await canvas.focus();
    await page.keyboard.press("Numpad7");
    await renderNow(page);
    await page.screenshot({ path: join(repositoryRoot, "output/screenshots/vscode-3d-top.png") });
    // From the top, the ground plane covers the middle of the view.
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole("list", { name: "Scene objects" }).locator("li.selected")).toHaveCount(1);
    await page.mouse.click(box.x + 4, box.y + 4);
    await expect(page.getByRole("list", { name: "Scene objects" }).locator("li.selected")).toHaveCount(0);
  });

  test("a reload keeps shading mode and selection", async ({ page }) => {
    await openWebview(page);
    await sendFile(page, "scene_v52.blend");
    await page.getByRole("button", { name: "Wireframe", exact: true }).click();
    await page.getByRole("list", { name: "Scene objects" }).getByRole("button", { name: "Star", exact: true }).click();
    await sendFile(page, "scene_v52.blend");
    await expect(page.getByRole("button", { name: "Wireframe", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("list", { name: "Scene objects" }).locator("li.selected")).toContainText("Star");
  });
});
