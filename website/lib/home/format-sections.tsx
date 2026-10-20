// The three overview sections that explain the format, each with its build-time graphic.
import { HomeSection } from "../parts/section-header.tsx";
import { ByteShareChart } from "./byte-share-chart.tsx";
import { FileAnatomy } from "./file-anatomy.tsx";
import { PointerHops } from "./pointer-hops.tsx";

export function AnatomySection() {
  return (
    <HomeSection
      id="anatomy-title"
      eyebrow="How a .blend file is built"
      title="A memory dump with a map"
      intro={<>Blender writes its in-memory structs to disk almost unchanged. A header in front of every block says where the block came from, and the DNA1 block describes the layout of every struct type. The <a href="/docs.html#specification">specification</a> covers each part byte by byte.</>}
    >
      <FileAnatomy />
    </HomeSection>
  );
}

export function PointersSection() {
  return (
    <HomeSection
      id="pointers-title"
      eyebrow="How data is connected"
      title="Pointers are saved addresses"
      intro={<>A struct points at another by the memory address it had when Blender saved. Every block header records that address, so following a pointer means finding the block with the same <code>old</code> value.</>}
    >
      <PointerHops />
    </HomeSection>
  );
}

export function InsideSection() {
  return (
    <HomeSection
      id="inside-title"
      eyebrow="What data is inside"
      title="More than the scene"
      intro={<>A file holds the whole state Blender had when saving: windows, workspaces and editors, the type catalog, a thumbnail, and the scene itself. <a href="/docs.html#08-datablocks">08 Datablocks</a> lists where common values live.</>}
    >
      <ByteShareChart />
    </HomeSection>
  );
}
