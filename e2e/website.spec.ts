// Every page of the built website in a real browser, plus the inspector flows end to end.
import { expect, type Page, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const distDirectory = join(repositoryRoot, "website/dist");
const screenshotDirectory = join(repositoryRoot, "output/screenshots");

const listHtmlRoutes = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "assets" || entry.name === "components" ? [] : listHtmlRoutes(entryPath);
    return entry.name.endsWith(".html") ? [`/${relative(distDirectory, entryPath)}`.replace(/\/index\.html$/, "/").replace(/^\/index\.html$/, "/")] : [];
  });

const collectPageErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

const ROUTES = listHtmlRoutes(distDirectory);

/** Opens the inspector page and waits for hydration: the preview's shadow root exists once the handlers are attached. */
async function openInspector(page: Page) {
  await page.goto("/inspector.html");
  await page.waitForFunction(() => document.querySelector("#inspector-preview")?.shadowRoot);
}

test("the build contains the expected pages", () => {
  expect(ROUTES).toEqual(expect.arrayContaining(["/", "/usage.html", "/inspector.html", "/vscode.html", "/spec/", "/spec/05-sdna.html"]));
});

for (const route of ROUTES) {
  test(`page ${route} renders without errors and fits a phone`, async ({ page }) => {
    const errors = collectPageErrors(page);
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page).toHaveTitle(/· blendfile$/);
    const fileName = route === "/" ? "home" : route.replace(/^\//, "").replace(/\/$/, "/index").replace(/[/.]/g, "_");
    await page.screenshot({ path: join(screenshotDirectory, `${fileName}.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("the VS Code page offers the packed extension for download", async ({ page, request }) => {
  await page.goto("/vscode.html");
  const download = page.getByRole("link", { name: /Download blendfile-preview\.vsix/ });
  const response = await request.get((await download.getAttribute("href"))!);
  expect(response.status()).toBe(200);
  // A .vsix is a zip archive.
  expect(Array.from((await response.body()).subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  for (const image of await page.locator("figure.screenshot img").all()) {
    await image.scrollIntoViewIfNeeded();
    expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
});

test("navigation links reach every spec page", async ({ page }) => {
  await page.goto("/spec/");
  const specLinks = page.getByRole("navigation", { name: "Documentation" }).locator('a[href^="/spec/"]');
  expect(await specLinks.count()).toBe(ROUTES.filter((route) => route.startsWith("/spec/")).length);
  await specLinks.filter({ hasText: "04 Block headers" }).click();
  await expect(page.locator("h1")).toHaveText("04 Block headers");
});

test("mermaid diagrams render to SVG", async ({ page }) => {
  await page.goto("/spec/01-file-structure.html");
  await expect(page.locator("figure.mermaid-diagram svg").first()).toBeVisible({ timeout: 20_000 });
});

test("theme toggle switches dark mode and remembers it", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("checkbox", { name: "Dark mode" });
  const wasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await toggle.click();
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(!wasDark);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(!wasDark);
});

test("inspector: the extension's preview shows a sample scene, then a datablock and a pointer to its mesh", async ({ page }) => {
  const errors = collectPageErrors(page);
  await openInspector(page);
  await page.getByRole("button", { name: "Blender 5.2 scene (zstd)" }).click();
  await expect(page.locator("#inspector-status")).toContainText("Blender 5.2");
  // The preview sits in a shadow root; Playwright locators reach into it.
  const preview = page.locator("#inspector-preview");
  await expect(preview.getByRole("heading", { name: "scene_v52.blend" })).toBeVisible();
  await expect(preview.locator(".viewport-canvas")).toBeVisible();
  await expect(preview.getByRole("button", { name: "Box", exact: true })).toBeVisible();
  await preview.getByRole("tab", { name: "Inspector" }).click();
  await expect(preview.locator(".facts")).toContainText("zstd");
  await expect(preview.locator(".facts")).toContainText("LargeBHead8");
  // Groups with more than 12 entries start collapsed; the filter opens the matching ones.
  await preview.getByRole("searchbox", { name: "Filter datablocks" }).fill("Box");
  await preview.getByRole("button", { name: "Box", exact: true }).click();
  await expect(preview.locator("#struct-title")).toHaveText("Object");
  await preview.getByRole("button", { name: /→ Mesh/ }).first().click();
  await expect(preview.locator("#struct-title")).toHaveText("Mesh");
  await preview.getByRole("navigation", { name: "Opened structs" }).getByRole("button", { name: "Box" }).click();
  await expect(preview.locator("#struct-title")).toHaveText("Object");
  await page.screenshot({ path: join(screenshotDirectory, "inspector-loaded.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("inspector: the textured sample loads its image files and shows textures", async ({ page }) => {
  const errors = collectPageErrors(page);
  await openInspector(page);
  await page.getByRole("button", { name: "Blender 4.3 textured plane" }).click();
  const preview = page.locator("#inspector-preview");
  await preview.getByRole("button", { name: "Material" }).click();
  await expect(preview.locator("#viewer-textures")).toHaveText("Textures 3/3", { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("inspector: chosen files, including a gzip file, a .blend with its images and a non-blend file", async ({ page }) => {
  await openInspector(page);
  const preview = page.locator("#inspector-preview");
  await page.locator("#inspector-file").setInputFiles(join(repositoryRoot, "input/v43_gzip.blend"));
  await preview.getByRole("tab", { name: "Inspector" }).click();
  await expect(preview.locator(".facts")).toContainText("gzip");
  await expect(preview.locator(".facts")).toContainText("SmallBHead8");
  // Image files chosen with the .blend file are found by name; the roughness image is packed in the file.
  await page.locator("#inspector-file").setInputFiles(["input/texture_v43.blend", "input/textures/texture_base.png"].map((path) => join(repositoryRoot, path)));
  await preview.getByRole("tab", { name: "3D View" }).click();
  await preview.getByRole("button", { name: "Material" }).click();
  await expect(preview.locator("#viewer-textures")).toContainText("Textures 2/3 · 1 missing: NormalImage", { timeout: 20_000 });
  // A .blend name passes the picker's accept filter, so the library itself rejects the content.
  await page.locator("#inspector-file").setInputFiles({ name: "notes.blend", mimeType: "application/octet-stream", buffer: Buffer.from("hello, not a blend file") });
  await expect(preview.getByRole("alert")).toContainText("NOT_BLEND");
  await expect(page.locator("#inspector-status")).toContainText("NOT_BLEND");
});

test("overview graphics: file anatomy, pointer hops from the fixture, byte share chart", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("figure", { name: "Anatomy of a .blend file" })).toBeVisible();
  const pointerFigure = page.getByRole("figure", { name: "Following pointers through saved addresses" });
  await expect(pointerFigure).toContainText('Mesh "ProbeMesh"');
  await expect(pointerFigure).toContainText("0.25, 0.5, 0.75"); // ProbeMaterial's color from the 5.2 fixture
  const chart = page.getByRole("figure", { name: "Bytes per category in the two test files" });
  await expect(chart.locator(".share-segment")).toHaveCount(8);
  await chart.getByText("Table view").click();
  await expect(chart.locator("table")).toContainText("Type catalog");
  const icon = await page.request.get("/assets/icon.svg");
  expect(icon.status()).toBe(200);
  expect(await icon.text()).toContain("<svg");
});

test("code examples switch tabs and copy the visible code", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/usage.html");
  const openExample = page.getByRole("radiogroup", { name: "Open a file" }).locator("xpath=ancestor::figure");
  await expect(openExample.locator('pre[data-tab="tab-0"]')).toBeVisible();
  await openExample.getByText("Browser: fetch").click();
  await expect(openExample.locator('pre[data-tab="tab-2"]')).toBeVisible();
  await expect(openExample.locator('pre[data-tab="tab-0"]')).toBeHidden();
  await openExample.getByRole("button", { name: "Copy code" }).click();
  await expect(openExample.getByRole("status")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('fetch("/models/scene.blend")');
});
