// Build-time chart: where the payload bytes of the two test files go.
import { type BlendFile, datablockIdCode, isDatablockBlock } from "blendfile";
import { openFixture, formatKilobytes } from "./fixtures.ts";

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
