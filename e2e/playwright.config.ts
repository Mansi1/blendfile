// VERIFIED: Playwright runs every e2e/*.spec.ts in Chromium against the built site, served by defuss-ssg as in production.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4174;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../output/playwright-results",
  reporter: [["list"], ["html", { outputFolder: "../output/playwright-report", open: "never" }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The built site (make website) served the way production serves it.
  webServer: {
    command: `bunx defuss-ssg serve website --port ${PORT} --skip-setup`,
    cwd: "..",
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
