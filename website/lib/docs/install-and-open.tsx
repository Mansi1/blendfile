// The library guide's first two sections: install the package and open a file.
import CodeExample from "../../components/code-example.tsx";
import { INSTALL_EXAMPLE, NAVIGATE_EXAMPLE, OPEN_EXAMPLE } from "../examples.ts";

export function InstallSection() {
  return (
    <>
      <h2 id="install">Install</h2>
      <p>The package is not on npm yet. Build and pack it from the repository, then add the tarball to your project:</p>
      <CodeExample name="usage-install" label="Install" tabs={INSTALL_EXAMPLE} />
      <p>It ships ESM and CommonJS builds with type declarations and depends on two pure-JS decompressors, <code>fflate</code> and <code>fzstd</code>. The package declares Node.js 18 or later; the tests run on Node.js 24 and Chromium.</p>
    </>
  );
}

export function OpenFileSection() {
  return (
    <>
      <h2 id="open-a-file">Open a file</h2>
      <p><code>parseBlendFile</code> takes a <code>Uint8Array</code> or an <code>ArrayBuffer</code>, so the same call works with Node's <code>readFile</code>, a browser <code>File</code> and a <code>fetch</code> response. CommonJS works the same way with <code>require("blendfile")</code>. The <a href="/#playground">playground</a> on this site is built this way.</p>
      <CodeExample name="usage-open" label="Open a file" tabs={OPEN_EXAMPLE} />
      <CodeExample name="usage-navigate" label="Read data" tabs={NAVIGATE_EXAMPLE} />
    </>
  );
}
