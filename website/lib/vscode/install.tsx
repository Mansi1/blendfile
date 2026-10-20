// The VS Code extension section of the Docs page: the download button and the install steps.
import { CodeBlock } from "../parts/code-block.tsx";

export function DownloadButton() {
  return <p><a class="btn" data-variant="default" href="/assets/blendfile-preview.vsix" download>Download blendfile-preview.vsix</a></p>;
}

export function InstallSection() {
  return (
    <>
      <h3 id="vscode-install">Install the extension</h3>
      <p>Download the <code>.vsix</code> file above and install it from a terminal:</p>
      <CodeBlock lang="bash" code="code --install-extension blendfile-preview.vsix" />
      <p>Or, in VS Code, open the Extensions view, choose <strong>Install from VSIX...</strong> from its <strong>Views and More Actions</strong> menu and pick the file. Cursor, VSCodium and other VS Code based editors install it the same way. To build it yourself, run <code>make vscode-package</code> in the <a href="https://github.com/Mansi1/blendfile">repository</a>.</p>
      <p>Once installed, the preview is the default editor for <code>*.blend</code> and <code>*.blend1</code> files. To pick it explicitly, right-click a file in the Explorer and choose <strong>Open Blend File Preview</strong>.</p>
    </>
  );
}
