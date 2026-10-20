import { resolve } from "node:path";

// The published address. VERIFIED: GitHub Pages serves 404.html for a missing page at any depth, so the 404 page
// links and loads its assets through absolute URLs below this path.
export const SITE = "https://mansi1.github.io/blendfile/";
export const SITE_PATH = new URL(SITE).pathname;

// VERIFIED: the website scripts (website/package.json) run defuss-ssg in website/, so the repository is one level up.
// import.meta.url does not help: defuss-ssg runs copies of these files from .ssg-temp/.
export const REPOSITORY_ROOT = resolve(process.cwd(), "..");
