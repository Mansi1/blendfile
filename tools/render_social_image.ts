// Renders the link preview image (Open Graph, 1200 × 630) that WhatsApp, Slack, X and others show for a shared URL:
// website/assets/social-preview.jpg. JPEG keeps it well under WhatsApp's ~600 KB limit for previews.
// Run after changing the icon or the 3D view screenshot: bun tools/render_social_image.ts
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const assets = join(repositoryRoot, "website/assets");
const icon = readFileSync(join(assets, "icon.svg"), "utf8");
const screenshot = `data:image/png;base64,${readFileSync(join(assets, "vscode-3d-view.png")).toString("base64")}`;

const html = `<!doctype html>
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: -apple-system, "Segoe UI", Inter, system-ui, sans-serif;
    color: #fff;
    background:
      radial-gradient(520px 420px at 8% 12%, rgba(245, 121, 42, 0.55), transparent 70%),
      radial-gradient(560px 460px at 92% 8%, rgba(61, 122, 224, 0.55), transparent 70%),
      radial-gradient(620px 420px at 55% 115%, rgba(139, 92, 246, 0.6), transparent 70%),
      #120f1f;
    position: relative;
  }
  .copy { position: absolute; left: 72px; top: 76px; width: 560px; }
  .brand { display: flex; align-items: center; gap: 18px; font-size: 40px; font-weight: 800; letter-spacing: -0.02em; }
  .brand svg { width: 72px; height: 72px; filter: drop-shadow(0 12px 28px rgba(245, 121, 42, 0.5)); }
  h1 { margin: 44px 0 0; font-size: 66px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 800;
       background: linear-gradient(110deg, #ffb27a, #ff7ab8 45%, #b9a4ff 80%); -webkit-background-clip: text; color: transparent; }
  p { margin: 24px 0 0; font-size: 26px; line-height: 1.4; color: #d7d3ea; }
  .chips { position: absolute; left: 72px; bottom: 64px; display: flex; gap: 12px; }
  .chips span { padding: 10px 18px; border-radius: 999px; font-size: 20px; font-weight: 600; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.18); }
  .shot { position: absolute; right: -150px; top: 120px; width: 700px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.25);
          box-shadow: 0 40px 90px rgba(0, 0, 0, 0.55); transform: perspective(1400px) rotateY(-16deg) rotateX(4deg); }
</style>
<div class="copy">
  <div class="brand">${icon}<span>blendfile</span></div>
  <h1>Read Blender .blend files anywhere</h1>
  <p>TypeScript library, format spec, in-browser inspector and a VS Code extension.</p>
</div>
<img class="shot" src="${screenshot}" alt="">
<div class="chips"><span>Blender 2.5 – 5.x</span><span>gzip &amp; zstd</span><span>3D view</span></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "load" });
await page.screenshot({ path: join(assets, "social-preview.jpg"), type: "jpeg", quality: 88 });
await browser.close();
