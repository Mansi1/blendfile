// "Three steps from bytes to values": the steps and the code examples (the hydrated code-example component).
import CodeExample from "../../components/code-example.tsx";
import { INSTALL_EXAMPLE, NAVIGATE_EXAMPLE, OPEN_EXAMPLE } from "../examples.ts";
import { ProcessSteps } from "../parts/process-steps.tsx";
import { HomeSection } from "../parts/section-header.tsx";

export const GET_STARTED_STEPS = [
  { title: "Install", description: "Build and pack the library, then add the tarball to your project." },
  { title: "Open bytes", description: "Pass a Uint8Array or ArrayBuffer from disk, a file input or fetch." },
  { title: "Navigate", description: "Find datablocks, read members by name, follow pointers." },
];

export function GetStarted() {
  return (
    <HomeSection id="usage-title" eyebrow="How to use it" title="Three steps from bytes to values">
      <ProcessSteps steps={GET_STARTED_STEPS} />
      <CodeExample name="home-install" label="Install" tabs={INSTALL_EXAMPLE} />
      <CodeExample name="home-open" label="Open a file" tabs={OPEN_EXAMPLE} />
      <CodeExample name="home-navigate" label="Read data" tabs={NAVIGATE_EXAMPLE} />
      <p><a class="btn" data-variant="outline" href="/docs.html">Docs and API reference →</a></p>
    </HomeSection>
  );
}
