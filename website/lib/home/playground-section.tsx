// The playground on the overview (#playground): the VS Code extension's preview, running in the page. The playground
// itself is the hydrated island from components/.
import Playground from "../../components/playground.tsx";
import { HomeSection } from "../parts/section-header.tsx";

export function PlaygroundSection() {
  return (
    <HomeSection
      id="playground"
      eyebrow="Try it"
      title="Playground"
      intro={<>Open a .blend file and see what is inside: a 3D view of the scene, the header, every block, the datablocks, and each struct member as the file's own SDNA describes it. This is the preview of the <a href="/docs.html#vscode-extension">VS Code extension</a>, running in this page with the blendfile library; nothing is uploaded.</>}
    >
      <Playground />
    </HomeSection>
  );
}
