// The VS Code extension on the Docs page (#vscode-extension): download, install, what it shows, privacy.
import { Screenshot } from "../parts/screenshot.tsx";
import { InspectorSection, PrivacySection, ViewerSection } from "./features.tsx";
import { DownloadButton, InstallSection } from "./install.tsx";

export function VscodeSection() {
  return (
    <section class="docs-chapter" aria-labelledby="vscode-extension">
      <h2 id="vscode-extension">VS Code extension</h2>
      <p>Blend File Preview opens <code>.blend</code> and <code>.blend1</code> files in VS Code as a 3D view of the scene and an inspector, instead of binary text. It is built on this library and parses the file inside the editor; nothing is uploaded.</p>
      <DownloadButton />
      <Screenshot src="/assets/vscode-3d-view.png" alt="The 3D view in Rendered mode: a scene with a ground plane, boxes, a metal ball, lights and a camera, with the outliner listing the objects on the right." width={1280} height={800} caption="The 3D view in Rendered mode, with the scene's lights, shadows and world color." />
      <InstallSection />
      <ViewerSection />
      <InspectorSection />
      <PrivacySection />
    </section>
  );
}
