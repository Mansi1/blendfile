// What the library handles, as four cards.
import { HomeSection } from "../parts/section-header.tsx";

const FEATURES = [
  { glyph: "17", accent: "var(--primary)", title: "Old and new headers", description: "The 12-byte header of Blender up to 4.x and the 17-byte header of Blender 5.0+, with all three block header layouts." },
  { glyph: "⇣", accent: "var(--chart-3)", title: "Compressed files", description: "gzip from Blender before 3.0 and multi-frame zstd from Blender 3.0+, detected from the first bytes." },
  { glyph: "≡", accent: "var(--chart-2)", title: "The file's own types", description: "Struct layouts come from the SDNA catalog each file carries, so any Blender version decodes without hard-coded offsets." },
  { glyph: "⌘", accent: "var(--chart-5)", title: "Browser and Node.js", description: "Input is a Uint8Array or ArrayBuffer. No file system, DOM or native code inside; ESM and CommonJS builds." },
];

export function Features() {
  return (
    <HomeSection id="features-title" eyebrow="What it handles" title="Every file Blender writes, one code path">
      <div class="feature-grid">
        {FEATURES.map((feature) => (
          <div class="card feature-card" style={`--feature-accent: ${feature.accent}`} key={feature.title}>
            <div class="card-header">
              <h3 class="card-title"><span class="feature-glyph" aria-hidden="true">{feature.glyph}</span>{feature.title}</h3>
              <p class="card-description">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </HomeSection>
  );
}
