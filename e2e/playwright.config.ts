// VERIFIED: Playwright runs every e2e/*.spec.ts in Chromium against the built site, served by Vite preview under
// /blendfile/ the way GitHub Pages serves it (page-relative URLs, links without .html, the 404 page's absolute URLs).
import { defineConfig, devices } from "@playwright/test";

const PORT = 4174;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../output/playwright-results",
  reporter: [["list"], ["html", { outputFolder: "../output/playwright-report", open: "never" }]],
  use: { baseURL: `http://localhost:${PORT}/blendfile/`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The built site (make website) served the way production serves it.
  webServer: {
    command: `bunx vite preview --config preview.config.ts --outDir dist --base /blendfile/ --port ${PORT} --strictPort`,
    cwd: "../website",
    url: `http://localhost:${PORT}/blendfile/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
