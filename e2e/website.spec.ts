// Every page of the built website in a real browser (index with the playground, docs, 404), plus the playground flows
// end to end.
import { expect, type Page, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const distDirectory = join(repositoryRoot, "website/dist");
const screenshotDirectory = join(repositoryRoot, "output/screenshots");

const listHtmlRoutes = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "assets" || entry.name === "components" ? [] : listHtmlRoutes(entryPath);
    // Routes are relative to the site's base URL (/blendfile/, as on GitHub Pages): "" is the overview.
    return entry.name.endsWith(".html") ? [relative(distDirectory, entryPath).replace(/(^|\/)index\.html$/, "$1")] : [];
  });

const collectPageErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

const ROUTES = listHtmlRoutes(distDirectory);
/** The path GitHub Pages serves the site under; playwright.config.ts serves the build there too. */
const BASE_PATH = "/blendfile/";

/** Opens the overview and waits for the playground to hydrate: the preview's shadow root exists once the handlers are attached. */
async function openPlayground(page: Page) {
  await page.goto("");
  await page.waitForFunction(() => document.querySelector("#playground-preview")?.shadowRoot);
}

test("the build contains the expected pages", () => {
  expect([...ROUTES].sort()).toEqual(["", "404.html", "docs.html"]);
});

for (const route of ROUTES) {
  test(`page ${route} renders without errors and fits a phone`, async ({ page }) => {
    const errors = collectPageErrors(page);
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page).toHaveTitle(/· blendfile$/);
    const fileName = route === "" ? "home" : route.replace(/\/$/, "/index").replace(/[/.]/g, "_");
    await page.screenshot({ path: join(screenshotDirectory, `${fileName}.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

// defuss-ssg's client navigation ignores a link to the current page; the brand opts out (data-no-nav) so it reloads.
for (const route of ["", "docs.html"]) {
  test(`the brand on ${route || "the overview"} loads the overview anew`, async ({ page }) => {
    await page.goto(route);
    await page.evaluate(() => { (window as Window & { beforeClick?: boolean }).beforeClick = true; });
    await Promise.all([page.waitForEvent("load"), page.locator(".navbar-brand").click()]);
    expect(new URL(page.url()).pathname).toBe(BASE_PATH);
    expect(await page.evaluate(() => (window as Window & { beforeClick?: boolean }).beforeClick)).toBeUndefined();
  });
}

test("the Docs page offers the packed VS Code extension for download", async ({ page, request }) => {
  await page.goto("docs.html");
  const download = page.getByRole("link", { name: /Download blendfile-preview\.vsix/ });
  const response = await request.get(await download.evaluate((link: HTMLAnchorElement) => link.href));
  expect(response.status()).toBe(200);
  // A .vsix is a zip archive.
  expect(Array.from((await response.body()).subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  for (const image of await page.locator("figure.screenshot img").all()) {
    await image.scrollIntoViewIfNeeded();
    // Lazy images load once scrolled into view.
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
});

test("page links have no .html and each one opens its own page", async ({ page, request }) => {
  const checked = new Map<string, string>();
  for (const route of ROUTES) {
    await page.goto(route);
    // Links are page-relative ("./docs"); the browser resolves them against the page.
    const links = await page.locator("a[href]").evaluateAll((elements) => elements.map((link) => ({ href: link.getAttribute("href")!, url: (link as HTMLAnchorElement).href })));
    const origin = new URL(page.url()).origin;
    for (const { href, url } of links.filter((link) => link.url.startsWith(origin) && !new URL(link.url).pathname.startsWith(`${BASE_PATH}assets/`))) {
      expect(href, `link on ${route}`).not.toMatch(/\.html(#|$)/);
      const path = new URL(url).pathname;
      if (checked.has(path)) continue;
      const response = await request.get(new URL(url).href);
      expect(response.status(), `${href} on ${route}`).toBe(200);
      checked.set(path, (await response.text()).match(/<title>([^<]*)/)![1]!);
    }
  }
  // A missing page is a 404 with the site's 404 page, not another page: a fallback would hide broken links.
  expect((await request.get("no-such-page")).status()).toBe(404);
  expect(checked.get(`${BASE_PATH}docs`)).toBe("Docs · blendfile");
  expect(new Set(checked.values()).size).toBe(checked.size);
});

// GitHub Pages answers a missing address with 404.html; vite preview sends only the status, so this opens it directly.
test("the 404 page counts down and returns to the overview", async ({ page }) => {
  await page.goto("404.html");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the docs" })).toHaveAttribute("href", `${BASE_PATH}docs`);
  await expect(page.locator("#countdown")).toHaveText(/in [1-4] seconds?\./, { timeout: 3000 });
  await page.waitForURL((url) => url.pathname === BASE_PATH, { timeout: 8000 });
  await expect(page.locator("#playground")).toBeVisible();
});

test("every page has a link preview with an absolute image of the right size", async ({ page, request }) => {
  for (const route of ROUTES.filter((route) => route !== "404.html")) {
    await page.goto(route);
    const meta = (property: string) => page.locator(`meta[property="${property}"]`).getAttribute("content");
    expect(await meta("og:url"), route).toMatch(/^https:\/\/mansi1\.github\.io\/blendfile\//);
    expect(await meta("og:title"), route).toMatch(/· blendfile$/);
    expect(await meta("og:image"), route).toBe("https://mansi1.github.io/blendfile/assets/social-preview.jpg");
    expect(await page.locator('meta[name="twitter:card"]').getAttribute("content")).toBe("summary_large_image");
  }
  // The same file the absolute URL names, served from this build: a JPEG of 1200 × 630, small enough for WhatsApp.
  const image = await request.get("assets/social-preview.jpg");
  expect(image.status()).toBe(200);
  const bytes = await image.body();
  expect(Array.from(bytes.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  expect(bytes.length).toBeLessThan(300_000);
  await page.goto("");
  const size = await page.evaluate(async () => {
    const img = new Image();
    img.src = "assets/social-preview.jpg";
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  expect(size).toEqual([1200, 630]);
});

test("code blocks are highlighted at build time", async ({ page }) => {
  await page.goto("docs.html");
  const block = page.locator("pre.shiki").first();
  await expect(block).toBeVisible();
  expect(await block.locator("span[style*='color']").count()).toBeGreaterThan(5);
  // The hydrated code examples keep their colors after hydration.
  const example = page.locator(".mk-code-block pre[data-tab='tab-0']").nth(1);
  expect(await example.locator("span[style*='color']").count()).toBeGreaterThan(5);
});

test("the side navigation reaches every Docs section and every spec chapter", async ({ page }) => {
  await page.goto("docs.html");
  const navigation = page.getByRole("navigation", { name: "Documentation" });
  const anchors = await navigation.locator('a[href*="docs#"]').evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).hash.slice(1)));
  const specFiles = readdirSync(join(repositoryRoot, "spec")).filter((fileName) => fileName.endsWith(".md"));
  expect(anchors.filter((id) => id === "specification" || /^\d\d-/.test(id)).length).toBe(specFiles.length);
  // Every link lands on a heading of the Docs page.
  for (const id of anchors) expect(await page.locator(`[id="${id}"]`).count(), id).toBe(1);
  await navigation.getByRole("link", { name: "04 Block headers" }).click();
  await expect(page).toHaveURL(/#04-block-headers$/);
  await expect(page.locator('[id="04-block-headers"]')).toBeInViewport();
  // The link of the section in view is marked as the reader scrolls (assets/docs-nav.js), and only that one.
  const marked = navigation.locator('[aria-current="location"]');
  await expect(marked).toHaveText("04 Block headers");
  await page.locator('[id="api-reference"]').evaluate((heading) => heading.scrollIntoView());
  await expect(marked).toHaveText("API reference");
  await expect(marked).toHaveCount(1);
});

test("the footer names the library version, the build and the gzipped size; GitHub and npm open in a new tab", async ({ page }) => {
  const { version } = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
  await page.goto("docs.html");
  const footer = page.locator("footer.site-footer");
  await expect(footer.getByRole("link", { name: `v${version}` })).toHaveAttribute("href", "https://www.npmjs.com/package/blendfile");
  await expect(footer).toContainText(/\d+\.\d KB gzipped/);
  const externalLinks = page.locator('nav[aria-label="Main"] a[href^="https:"], footer.site-footer a[href^="https:"]');
  expect(await externalLinks.count()).toBe(7);
  for (const link of await externalLinks.all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener");
  }
});

test("mermaid diagrams render to SVG", async ({ page }) => {
  await page.goto("docs.html#01-file-structure");
  await expect(page.locator("figure.mermaid-diagram svg").first()).toBeVisible({ timeout: 20_000 });
});

test("theme toggle switches dark mode and remembers it", async ({ page }) => {
  await page.goto("");
  const toggle = page.getByRole("checkbox", { name: "Dark mode" });
  const wasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await toggle.click();
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(!wasDark);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(!wasDark);
});

test("playground: the extension's preview shows a sample scene, then a datablock and a pointer to its mesh", async ({ page }) => {
  const errors = collectPageErrors(page);
  await openPlayground(page);
  await page.getByRole("button", { name: "Blender 5.2 scene (zstd)" }).click();
  await expect(page.locator("#playground-status")).toContainText("Blender 5.2");
  // The preview sits in a shadow root; Playwright locators reach into it.
  const preview = page.locator("#playground-preview");
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
  await page.screenshot({ path: join(screenshotDirectory, "playground-loaded.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("playground: the textured sample loads its image files and shows textures", async ({ page }) => {
  const errors = collectPageErrors(page);
  await openPlayground(page);
  await page.getByRole("button", { name: "Blender 4.3 textured plane" }).click();
  const preview = page.locator("#playground-preview");
  await preview.getByRole("button", { name: "Material" }).click();
  await expect(preview.locator("#viewer-textures")).toHaveText("Textures 3/3", { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("playground: chosen files, including a gzip file, a .blend with its images and a non-blend file", async ({ page }) => {
  await openPlayground(page);
  const preview = page.locator("#playground-preview");
  await page.locator("#playground-file").setInputFiles(join(repositoryRoot, "input/v43_gzip.blend"));
  await preview.getByRole("tab", { name: "Inspector" }).click();
  await expect(preview.locator(".facts")).toContainText("gzip");
  await expect(preview.locator(".facts")).toContainText("SmallBHead8");
  // Image files chosen with the .blend file are found by name; the roughness image is packed in the file.
  await page.locator("#playground-file").setInputFiles(["input/texture_v43.blend", "input/textures/texture_base.png"].map((path) => join(repositoryRoot, path)));
  await preview.getByRole("tab", { name: "3D View" }).click();
  await preview.getByRole("button", { name: "Material" }).click();
  await expect(preview.locator("#viewer-textures")).toContainText("Textures 2/3 · 1 missing: NormalImage", { timeout: 20_000 });
  // A .blend name passes the picker's accept filter, so the library itself rejects the content.
  await page.locator("#playground-file").setInputFiles({ name: "notes.blend", mimeType: "application/octet-stream", buffer: Buffer.from("hello, not a blend file") });
  await expect(preview.getByRole("alert")).toContainText("NOT_BLEND");
  await expect(page.locator("#playground-status")).toContainText("NOT_BLEND");
});

test("overview graphics: file anatomy, pointer hops from the fixture, byte share chart", async ({ page }) => {
  await page.goto("");
  await expect(page.getByRole("figure", { name: "Anatomy of a .blend file" })).toBeVisible();
  const pointerFigure = page.getByRole("figure", { name: "Following pointers through saved addresses" });
  await expect(pointerFigure).toContainText('Mesh "ProbeMesh"');
  await expect(pointerFigure).toContainText("0.25, 0.5, 0.75"); // ProbeMaterial's color from the 5.2 fixture
  const chart = page.getByRole("figure", { name: "Bytes per category in the two test files" });
  await expect(chart.locator(".share-segment")).toHaveCount(8);
  await chart.getByText("Table view").click();
  await expect(chart.locator("table")).toContainText("Type catalog");
  const icon = await page.request.get("assets/icon.svg");
  expect(icon.status()).toBe(200);
  expect(await icon.text()).toContain("<svg");
});

test("code examples switch tabs and copy the visible code", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("docs.html");
  const openExample = page.getByRole("radiogroup", { name: "Open a file" }).locator("xpath=ancestor::figure");
  await expect(openExample.locator('pre[data-tab="tab-0"]')).toBeVisible();
  await openExample.getByText("Browser: fetch").click();
  await expect(openExample.locator('pre[data-tab="tab-2"]')).toBeVisible();
  await expect(openExample.locator('pre[data-tab="tab-0"]')).toBeHidden();
  await openExample.getByRole("button", { name: "Copy code" }).click();
  await expect(openExample.getByRole("status")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('fetch("/models/scene.blend")');
});
