// How the library is tested, closing the overview.
import { HomeSection } from "../parts/section-header.tsx";

export function TestedSection() {
  return (
    <HomeSection
      id="tested-title"
      eyebrow="Tested against Blender"
      title="Checked with Blender's own answers"
      intro="The tests open files written by Blender 4.3.0 and 5.2.2, plain and compressed, and compare every value with what Blender's Python API reported when it saved them: names, locations, scale, frame range, resolution, vertex positions, material colors. Files built byte by byte from the specification cover 32-bit pointers, big-endian files and damaged input."
    />
  );
}
