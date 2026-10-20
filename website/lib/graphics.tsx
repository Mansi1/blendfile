// Build-time graphics for the overview page. Numbers come from the fixtures in input/, read with the library.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type BlendFile, datablockIdCode, isDatablockBlock, parseBlendFile } from "blendfile";
import { REPOSITORY_ROOT } from "./site.ts";

const openFixture = (fileName: string) => parseBlendFile(readFileSync(join(REPOSITORY_ROOT, "input", fileName)));
const formatHex = (address: bigint) => `0x${address.toString(16)}`;
const formatKilobytes = (byteCount: number) => `${(byteCount / 1024).toFixed(0)} KB`;

/** The file as a strip of parts, then one block opened up into its 32 header bytes and payload. */
export function FileAnatomy() {
  const fileParts = [
    { label: "Header", detail: "12 or 17 bytes", tone: "header", weight: 1.2 },
    { label: "REND", detail: "scenes", tone: "special", weight: 1 },
    { label: "TEST", detail: "thumbnail", tone: "special", weight: 1 },
    { label: "GLOB", detail: "globals", tone: "special", weight: 1 },
    { label: "OB", detail: "datablock", tone: "datablock", weight: 1.2 },
    { label: "DATA", detail: "owned", tone: "data", weight: 0.9 },
    { label: "DATA", detail: "owned", tone: "data", weight: 0.9 },
    { label: "ME", detail: "datablock", tone: "datablock", weight: 1.2 },
    { label: "…", detail: "more blocks", tone: "data", weight: 1.4 },
    { label: "DNA1", detail: "type catalog", tone: "catalog", weight: 2 },
    { label: "ENDB", detail: "end", tone: "end", weight: 0.8 },
  ];
  const headerFields = [
    { name: "code", bytes: 4, example: '"OB\\0\\0"' },
    { name: "SDNAnr", bytes: 4, example: "struct index" },
    { name: "old", bytes: 8, example: "saved address" },
    { name: "len", bytes: 8, example: "payload size" },
    { name: "nr", bytes: 8, example: "struct count" },
  ];
  return (
    <figure class="graphic" aria-label="Anatomy of a .blend file">
      <ol class="anatomy-strip">
        {fileParts.map((part, index) => (
          <li key={`${part.label}-${index}`} class="anatomy-part" data-tone={part.tone} style={`flex-grow:${part.weight}`}>
            <strong>{part.label}</strong>
            <span>{part.detail}</span>
          </li>
        ))}
      </ol>
      <div class="anatomy-zoom" aria-hidden="true"><span>one block, opened up (Blender 5.x layout)</span></div>
      <div class="anatomy-block">
        <ol class="anatomy-bytes" aria-label="Block header: 32 bytes">
          {headerFields.map((field) => (
            <li key={field.name} class="anatomy-field" style={`flex-grow:${field.bytes}`}>
              <span class="anatomy-cells" style={`--cells:${field.bytes}`} aria-hidden="true">
                {Array.from({ length: field.bytes }, (_, cellIndex) => <i key={String(cellIndex)} />)}
              </span>
              <strong>{field.name}</strong>
              <span>{field.bytes} B · {field.example}</span>
            </li>
          ))}
        </ol>
        <div class="anatomy-payload">
          <strong>payload</strong>
          <span><code>nr</code> structs of type <code>SDNAnr</code>, <code>len</code> bytes</span>
        </div>
      </div>
      <figcaption>Blocks follow each other with no padding. The DNA1 block describes every struct type, so a reader needs no built-in struct definitions.</figcaption>
    </figure>
  );
}

/** Real pointer values from the Blender 5.2 fixture: Object → Mesh → material array → Material. */
export function PointerHops() {
  const blendFile = openFixture("v52.blend");
  const object = blendFile.findDatablock("OB", "ProbeCube")!;
  const meshAddress = object.readPointer("data");
  const mesh = object.followPointer("data")!;
  const materialArrayAddress = mesh.readPointer("mat");
  const [materialAddress = 0n] = mesh.readPointerArray("mat");
  const material = blendFile.resolvePointer(materialAddress)[0]!;
  const hops = [
    { title: `Object "${object.datablockName}"`, block: "OB block", member: "*data", value: formatHex(meshAddress) },
    { title: `Mesh "${mesh.datablockName}"`, block: `ME block, old = ${formatHex(meshAddress)}`, member: "**mat", value: formatHex(materialArrayAddress) },
    { title: "Pointer array", block: `DATA block, old = ${formatHex(materialArrayAddress)}`, member: "[0]", value: formatHex(materialAddress) },
    { title: `Material "${material.datablockName}"`, block: `MA block, old = ${formatHex(materialAddress)}`, member: "r, g, b", value: ["r", "g", "b"].map((channel) => material.readMember(channel)).join(", ") },
  ];
  return (
    <figure class="graphic" aria-label="Following pointers through saved addresses">
      <ol class="pointer-hops">
        {hops.map((hop, index) => (
          <li key={hop.title} class="pointer-hop" data-step={String(index + 1)}>
            <span class="pointer-hop-block">{hop.block}</span>
            <strong>{hop.title}</strong>
            <span class="pointer-hop-member"><code>{hop.member}</code> = <code>{hop.value}</code></span>
          </li>
        ))}
      </ol>
      <figcaption>Values read from the Blender 5.2 test file. A pointer holds the address a struct had when Blender saved; the block whose <code>old</code> field matches is the target.</figcaption>
    </figure>
  );
}

const SHARE_CATEGORIES = [
  { key: "interface", label: "Interface state", description: "window manager, workspaces, screens and their data" },
  { key: "scene", label: "Scene data", description: "scene, objects, meshes, materials and their data" },
  { key: "catalog", label: "Type catalog", description: "the DNA1 block" },
  { key: "fileInfo", label: "File info", description: "REND, TEST (thumbnail), GLOB" },
] as const;
type ShareCategory = (typeof SHARE_CATEGORIES)[number]["key"];

/** Payload bytes per category; each DATA block counts toward the datablock it follows. */
function measureByteShares(blendFile: BlendFile): Record<ShareCategory, number> {
  const shares: Record<ShareCategory, number> = { interface: 0, scene: 0, catalog: 0, fileInfo: 0 };
  let currentOwner: ShareCategory = "fileInfo";
  for (const block of blendFile.blocks) {
    if (block.code === "DNA1") shares.catalog += block.size;
    else if (isDatablockBlock(block)) {
      currentOwner = ["WM", "WS", "SR"].includes(datablockIdCode(block)) ? "interface" : "scene";
      shares[currentOwner] += block.size;
    } else if (block.code === "DATA") shares[currentOwner] += block.size;
    else shares.fileInfo += block.size;
  }
  return shares;
}

/** 100% stacked bars: where the bytes of the two test files go. */
export function ByteShareChart() {
  const files = [
    { label: "Blender 5.2 file", blendFile: openFixture("v52.blend") },
    { label: "Blender 4.3 file", blendFile: openFixture("v43.blend") },
  ].map(({ label, blendFile }) => {
    const shares = measureByteShares(blendFile);
    const total = Object.values(shares).reduce((sum, bytes) => sum + bytes, 0);
    return { label, shares, total };
  });
  const percent = (bytes: number, total: number) => (100 * bytes) / total;
  return (
    <figure class="graphic share-chart" aria-label="Bytes per category in the two test files">
      <ul class="share-legend">
        {SHARE_CATEGORIES.map((category) => (
          <li key={category.key}><i class="share-swatch" data-category={category.key} aria-hidden="true" />{category.label}</li>
        ))}
      </ul>
      {files.map((file) => (
        <div class="share-row" key={file.label}>
          <div class="share-row-label"><strong>{file.label}</strong><span>{formatKilobytes(file.total)} of payload</span></div>
          <div class="share-bar">
            {SHARE_CATEGORIES.map((category) => {
              const share = percent(file.shares[category.key], file.total);
              return (
                <span
                  key={category.key}
                  class="share-segment"
                  data-category={category.key}
                  style={`flex-basis:${share.toFixed(2)}%`}
                  tabindex="0"
                  title={`${category.label}: ${share.toFixed(1)}% (${formatKilobytes(file.shares[category.key])})`}
                  aria-label={`${category.label}: ${share.toFixed(1)}%`}
                />
              );
            })}
          </div>
          <p class="share-values">
            {SHARE_CATEGORIES.map((category) => (
              <span key={category.key}><i class="share-swatch" data-category={category.key} aria-hidden="true" />{percent(file.shares[category.key], file.total).toFixed(0)}%</span>
            ))}
          </p>
        </div>
      ))}
      <details class="share-table">
        <summary>Table view</summary>
        <table>
          <thead><tr><th>Category</th><th>What it holds</th>{files.map((file) => <th key={file.label}>{file.label}</th>)}</tr></thead>
          <tbody>
            {SHARE_CATEGORIES.map((category) => (
              <tr key={category.key}>
                <td>{category.label}</td>
                <td>{category.description}</td>
                {files.map((file) => <td key={file.label}>{formatKilobytes(file.shares[category.key])} ({percent(file.shares[category.key], file.total).toFixed(1)}%)</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <figcaption>Most of a small file is user-interface state and the type catalog, not the scene. Payload bytes of the two test files; DATA blocks count toward the datablock they follow.</figcaption>
    </figure>
  );
}
