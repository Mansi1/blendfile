// The overview page with the playground (server only; pages/index.mdx only renders it). The playground and the code
// examples are the hydrated islands.
import { Features } from "../home/features.tsx";
import { AnatomySection, InsideSection, PointersSection } from "../home/format-sections.tsx";
import { EditorSection } from "../home/editor-section.tsx";
import { GetStarted } from "../home/get-started.tsx";
import { Hero } from "../home/hero.tsx";
import { PlaygroundSection } from "../home/playground-section.tsx";
import { Stats } from "../home/stats.tsx";
import { TestedSection } from "../home/tested-section.tsx";
import { PageShell } from "../layout/page-shell.tsx";

export function HomePage({ title, description }: { title: string; description: string }) {
  return (
    <PageShell title={title} description={description} route="/">
      <div class="home">
        <Hero />
        <Stats />
        <PlaygroundSection />
        <Features />
        <AnatomySection />
        <PointersSection />
        <InsideSection />
        <GetStarted />
        <EditorSection />
        <TestedSection />
      </div>
    </PageShell>
  );
}
