// The VS Code extension teaser on the overview.
import { Screenshot } from "../parts/screenshot.tsx";
import { HomeSection } from "../parts/section-header.tsx";

export function EditorSection() {
  return (
    <HomeSection
      id="vscode-title"
      eyebrow="In your editor"
      title="Open .blend files in VS Code"
      intro="Blend File Preview, built on this library, shows a .blend file as a 3D view with materials, image textures, lights and cameras, and as an inspector of every datablock and struct. It runs offline inside the editor."
    >
      <Screenshot src="/assets/vscode-3d-view.png" alt="Blend File Preview in VS Code: the 3D view of a scene in Rendered mode with the outliner beside it." width={1280} height={800} />
      <p><a class="btn" data-variant="outline" href="/docs.html#vscode-extension">About the extension and install →</a></p>
    </HomeSection>
  );
}
