// The Docs page: the library guide, the API reference, the VS Code extension and the whole specification on one page (server only;
// pages/docs.mdx only renders it). The code examples are the hydrated islands.
import { PageShell } from "../layout/page-shell.tsx";
import { DocsArticle } from "../parts/docs-article.tsx";
import { ProcessSteps } from "../parts/process-steps.tsx";
import { ApiReference } from "../docs/api-reference.tsx";
import { ErrorsSection, SupportedFilesSection } from "../docs/errors-and-support.tsx";
import { InstallSection, OpenFileSection } from "../docs/install-and-open.tsx";
import { ReadingDataSection } from "../docs/reading-data.tsx";
import { SpecificationSection } from "../docs/specification.tsx";
import { VscodeSection } from "../vscode/section.tsx";

const STEPS = [
  { title: "Install", description: "Build and pack the library, then add the tarball." },
  { title: "Open bytes", description: "From disk in Node.js, from a file input or fetch in the browser." },
  { title: "Navigate", description: "Datablocks, members, pointers and file info." },
];

export function DocsPage({ title, description }: { title: string; description: string }) {
  return (
    <PageShell title={title} description={description} route="/docs.html">
      <DocsArticle title={title} lead="How to use the library, every export, and the .blend format byte by byte. Open a file from bytes, find datablocks, read members by name and follow pointers; the same code runs in Node.js and in the browser.">
        <ProcessSteps steps={STEPS} />
        <InstallSection />
        <OpenFileSection />
        <ReadingDataSection />
        <ErrorsSection />
        <ApiReference />
        <SupportedFilesSection />
        <VscodeSection />
        <SpecificationSection />
      </DocsArticle>
    </PageShell>
  );
}
