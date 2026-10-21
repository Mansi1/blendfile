// What the footer says about the build, read once while the site is built (server only): the library version, the
// commit, the build time and the gzipped size of the library's ESM build. Like the audio-tag site's footer.
// VERIFIED: `make website` and `make dev` build dist/ first; outside them a missing build or git simply leaves that
// part out instead of failing the site build.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { REPOSITORY_ROOT } from "./site.ts";

export interface BuildInfo {
  version: string;
  /** Short commit hash: GITHUB_SHA in GitHub Actions, otherwise git. */
  commit?: string;
  builtAt: Date;
  /** Gzipped bytes of dist/index.mjs. */
  gzippedBytes?: number;
}

const readCommit = (): string | undefined => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { cwd: REPOSITORY_ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
};

const readGzippedBytes = (): number | undefined => {
  const bundle = join(REPOSITORY_ROOT, "dist/index.mjs");
  return existsSync(bundle) ? gzipSync(readFileSync(bundle), { level: 9 }).length : undefined;
};

export const BUILD_INFO: BuildInfo = {
  version: JSON.parse(readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8")).version,
  commit: readCommit(),
  builtAt: new Date(),
  gzippedBytes: readGzippedBytes(),
};
