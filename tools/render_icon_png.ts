// Renders website/assets/icon.svg to the 256 px PNG the VS Code marketplace requires (it rejects SVG icons).
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const svg = readFileSync(join(repositoryRoot, "website/assets/icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:256px;height:256px;display:block}</style>${svg}`);
await page.locator("svg").screenshot({ path: join(repositoryRoot, "vscode-extension/media/icon.png"), omitBackground: true });
await browser.close();
