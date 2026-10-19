// Starts VS Code with the packed extension installed into a throwaway profile and runs suite.ts inside it.
// Uses the local VS Code install when present (VSCODE_EXECUTABLE overrides), else downloads a stable build.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { runTests } from "@vscode/test-electron";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const extensionRoot = join(repositoryRoot, "vscode-extension");
const profileRoot = join(repositoryRoot, "tmp/vscode-test-profile");
const LOCAL_VSCODE = "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
const vscodeExecutablePath = process.env.VSCODE_EXECUTABLE ?? (existsSync(LOCAL_VSCODE) ? LOCAL_VSCODE : undefined);

rmSync(profileRoot, { recursive: true, force: true });
mkdirSync(join(profileRoot, "extensions"), { recursive: true });
mkdirSync(join(profileRoot, "no-development-extension"), { recursive: true });
mkdirSync(join(repositoryRoot, "output"), { recursive: true });

// Install the .vsix the way a user would, so the test covers the packaged files and not the source tree.
const vsixPath = join(extensionRoot, "blendfile-preview.vsix");
const cliPath = vscodeExecutablePath ? join(vscodeExecutablePath, "../../Resources/app/bin/code") : "code";
execFileSync(cliPath, ["--extensions-dir", join(profileRoot, "extensions"), "--install-extension", vsixPath, "--force"], { stdio: "inherit" });

await runTests({
  ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
  // Points at an empty folder: the installed extension is the one under test.
  extensionDevelopmentPath: join(profileRoot, "no-development-extension"),
  extensionTestsPath: join(extensionRoot, "dist/test-suite.cjs"),
  extensionTestsEnv: { BLEND_REPOSITORY_ROOT: repositoryRoot },
  launchArgs: [
    join(repositoryRoot, "input"),
    "--extensions-dir", join(profileRoot, "extensions"),
    "--user-data-dir", join(profileRoot, "user-data"),
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
  ],
});
console.log("VS Code integration test passed; reports in output/vscode-extension.json");
