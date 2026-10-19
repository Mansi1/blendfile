// Client-side .blend inspector: everything runs in the browser through the blendfile library; no upload.
import { $, createRef } from "defuss";
import {
  BlendError,
  type BlendFile,
  BlendStruct,
  type SdnaMember,
  datablockIdCode,
  isDatablockBlock,
  parseBlendFile,
} from "../../src/index.ts";

// VERIFIED: relative to the inspector page at the site root, so they also resolve when the site is served under a sub-path.
const SAMPLES = [
  { label: "Blender 5.2 sample (zstd)", url: "assets/samples/v52_zstd.blend", fileName: "v52_zstd.blend" },
  { label: "Blender 4.3 sample", url: "assets/samples/v43.blend", fileName: "v43.blend" },
];

interface InspectorState {
  blendFile?: BlendFile;
  fileName?: string;
  errorMessage?: string;
  /** Structs opened so far; the last one is shown. Following a pointer pushes its target. */
  openedStructs: BlendStruct[];
}

const formatBytes = (byteCount: number) => new Intl.NumberFormat("en", { notation: "compact", style: "unit", unit: "byte", unitDisplay: "narrow" }).format(byteCount);
const formatHex = (address: bigint) => `0x${address.toString(16)}`;
const truncate = (text: string, maxLength = 90) => (text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text);

/** One row of the member table: what to show and, for pointers and inline structs, what can be opened. */
function describeMember(struct: BlendStruct, member: SdnaMember): { valueText: string; openTarget?: BlendStruct } {
  const file = struct.file;
  try {
    const value = struct.readMember(member.name);
    if (member.pointerDepth > 0 && typeof value === "bigint") {
      if (value === 0n) return { valueText: "null" };
      if (member.type === "char" && member.pointerDepth === 1) return { valueText: JSON.stringify(file.readStringAt(value, struct.offset) ?? formatHex(value)) };
      const target = file.resolvePointer(value, undefined, struct.offset)[0];
      const block = file.findBlockByAddress(value, struct.offset);
      if (target) return { valueText: `${formatHex(value)} → ${target.structType.name}${target.datablockName ? ` "${target.datablockName}"` : ""}`, openTarget: target };
      return { valueText: block ? `${formatHex(value)} → raw ${formatBytes(block.size)}` : `${formatHex(value)} (not in file)` };
    }
    if (value instanceof BlendStruct) return { valueText: `{ ${value.structType.name} }`, openTarget: value };
    if (typeof value === "string") return { valueText: JSON.stringify(value) };
    return { valueText: truncate(JSON.stringify(value, (_, element) => (typeof element === "bigint" ? element.toString() : element instanceof BlendStruct ? `{${element.structType.name}}` : element))) };
  } catch (error) {
    return { valueText: `— (${(error as Error).message})` };
  }
}

function FileSummary({ blendFile, fileName }: { blendFile: BlendFile; fileName: string }) {
  const { header, sdna, blocks } = blendFile;
  const statistics = [
    ["File", fileName],
    ["Blender version", blendFile.blenderVersion],
    ["Header", `${header.size} bytes, format ${header.formatVersion}`],
    ["Block header", header.blockHeaderLayout],
    ["Compression", blendFile.compressionMethod],
    ["Byte order / pointers", `${header.littleEndian ? "little" : "big"} endian, ${header.pointerSize}-byte`],
    ["Blocks", String(blocks.length)],
    ["SDNA structs", String(sdna.structs.length)],
    ["Uncompressed size", formatBytes(blendFile.fileBytes.length)],
  ];
  return (
    <div class="inspector-stats" id="inspector-summary">
      {statistics.map(([title, value]) => (
        <div class="statistic" key={title}>
          <p class="statistic-title">{title}</p>
          <p class="statistic-value" style="font-size:1.1rem">{value}</p>
        </div>
      ))}
    </div>
  );
}

function BlockCodeTable({ blendFile }: { blendFile: BlendFile }) {
  const totalsByCode = new Map<string, { count: number; bytes: number }>();
  for (const block of blendFile.blocks) {
    const totals = totalsByCode.get(block.code) ?? { count: 0, bytes: 0 };
    totals.count += 1;
    totals.bytes += block.size;
    totalsByCode.set(block.code, totals);
  }
  return (
    <div class="table-container inspector-scroll">
      <table class="table" id="inspector-block-codes">
        <caption class="table-caption">Blocks by code</caption>
        <thead>
          <tr class="table-row">
            <th class="table-head">Code</th>
            <th class="table-head" style="text-align:right">Blocks</th>
            <th class="table-head" style="text-align:right">Payload</th>
          </tr>
        </thead>
        <tbody>
          {[...totalsByCode].map(([code, totals]) => (
            <tr class="table-row" key={code}>
              <td class="table-cell"><code>{code}</code></td>
              <td class="table-cell" style="text-align:right">{totals.count}</td>
              <td class="table-cell" style="text-align:right">{formatBytes(totals.bytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DatablockTable({ blendFile, onOpen }: { blendFile: BlendFile; onOpen: (struct: BlendStruct) => void }) {
  const datablockBlocks = blendFile.blocks.filter(isDatablockBlock);
  return (
    <div class="table-container inspector-scroll">
      <table class="table" id="inspector-datablocks">
        <caption class="table-caption">Datablocks ({datablockBlocks.length})</caption>
        <thead>
          <tr class="table-row">
            <th class="table-head">ID</th>
            <th class="table-head">Name</th>
            <th class="table-head">Struct</th>
            <th class="table-head"><span class="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {datablockBlocks.map((block) => {
            const datablock = blendFile.readStructsInBlock(block)[0]!;
            return (
              <tr class="table-row" key={String(block.headerOffset)}>
                <td class="table-cell"><span class="badge" data-variant="outline">{datablockIdCode(block)}</span></td>
                <td class="table-cell">{datablock.datablockName}</td>
                <td class="table-cell"><code>{datablock.structType.name}</code></td>
                <td class="table-cell">
                  <button class="btn" type="button" data-variant="ghost" data-size="sm" onClick={() => onOpen(datablock)}>Open</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StructBrowser({ openedStructs, onOpen, onBack }: { openedStructs: BlendStruct[]; onOpen: (struct: BlendStruct) => void; onBack: (depth: number) => void }) {
  const struct = openedStructs.at(-1);
  if (!struct) {
    return (
      <div class="card" id="inspector-struct">
        <div class="card-header">
          <h3 class="card-title">Struct browser</h3>
          <p class="card-description">Open a datablock to see its members as the SDNA describes them. Pointers and inline structs can be followed.</p>
        </div>
      </div>
    );
  }
  return (
    <div class="card" id="inspector-struct">
      <div class="card-header">
        <nav class="breadcrumb" aria-label="Opened structs">
          <ol class="breadcrumb-list">
            {openedStructs.flatMap((opened, depth) => {
              const label = opened.datablockName ?? opened.structType.name;
              const item = (
                <li class="breadcrumb-item" key={`item-${depth}-${opened.offset}`}>
                  {depth === openedStructs.length - 1
                    ? <span class="breadcrumb-page" aria-current="page">{label}</span>
                    : <a class="breadcrumb-link" href="#inspector-struct" onClick={(event: Event) => { event.preventDefault(); onBack(depth); }}>{label}</a>}
                </li>
              );
              return depth === 0 ? [item] : [<li class="breadcrumb-separator" aria-hidden="true" key={`separator-${depth}`}>/</li>, item];
            })}
          </ol>
        </nav>
        <h3 class="card-title">{struct.structType.name}</h3>
        <p class="card-description">{struct.structType.size} bytes at file offset {struct.offset}, {struct.structType.members.length} members</p>
      </div>
      <div class="card-content">
        <div class="table-container inspector-scroll">
          <table class="table">
            <thead>
              <tr class="table-row">
                <th class="table-head" style="text-align:right">Offset</th>
                <th class="table-head">Type</th>
                <th class="table-head">Member</th>
                <th class="table-head">Value</th>
              </tr>
            </thead>
            <tbody>
              {struct.structType.members.map((member) => {
                const { valueText, openTarget } = describeMember(struct, member);
                return (
                  <tr class="table-row" key={member.declarator}>
                    <td class="table-cell" style="text-align:right">{member.offset}</td>
                    <td class="table-cell"><code>{member.type}</code></td>
                    <td class="table-cell"><code>{member.declarator}</code></td>
                    <td class="table-cell">
                      {openTarget
                        ? <button class="btn" type="button" data-variant="link" data-size="sm" onClick={() => onOpen(openTarget)}>{valueText}</button>
                        : <span>{valueText}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Thumbnail({ blendFile }: { blendFile: BlendFile }) {
  const thumbnail = blendFile.readThumbnail();
  const renderInfo = blendFile.readRenderInfo();
  const canvasRef = createRef<HTMLCanvasElement>();
  const drawThumbnail = () => {
    const context = canvasRef.current?.getContext("2d");
    if (thumbnail && context) context.putImageData(new ImageData(new Uint8ClampedArray(thumbnail.rgba), thumbnail.width, thumbnail.height), 0, 0);
  };
  return (
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Preview and render info</h3>
        <p class="card-description">From the TEST and REND blocks, readable without the SDNA.</p>
      </div>
      <div class="card-content" style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center">
        {thumbnail
          ? <canvas class="inspector-thumbnail" role="img" ref={canvasRef} width={thumbnail.width} height={thumbnail.height} aria-label="File thumbnail" onMount={drawThumbnail} />
          : <p>No thumbnail in this file.</p>}
        <ul>
          {renderInfo.map((info) => (
            <li key={info.sceneName}>Scene <strong>{info.sceneName}</strong>: frames {info.frameStart} to {info.frameEnd}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Inspector() {
  const reportRef = createRef<HTMLDivElement>();
  const state: InspectorState = { openedStructs: [] };

  const renderReport = () => {
    $(reportRef).update(<Report />);
  };
  const openStruct = (struct: BlendStruct) => {
    state.openedStructs = [...state.openedStructs, struct];
    renderReport();
  };
  const openDatablock = (struct: BlendStruct) => {
    state.openedStructs = [struct];
    renderReport();
  };
  const goBack = (depth: number) => {
    state.openedStructs = state.openedStructs.slice(0, depth + 1);
    renderReport();
  };
  const loadBytes = (bytes: ArrayBuffer, fileName: string) => {
    try {
      state.blendFile = parseBlendFile(bytes);
      state.errorMessage = undefined;
    } catch (error) {
      state.blendFile = undefined;
      state.errorMessage = error instanceof BlendError ? `${error.code}: ${error.message}` : String(error);
    }
    state.fileName = fileName;
    state.openedStructs = [];
    renderReport();
  };
  const loadChosenFile = async (event: Event) => {
    const chosenFile = (event.target as HTMLInputElement).files?.[0];
    if (chosenFile) loadBytes(await chosenFile.arrayBuffer(), chosenFile.name);
  };
  const loadSample = async (sample: (typeof SAMPLES)[number]) => {
    const response = await fetch(sample.url);
    loadBytes(await response.arrayBuffer(), sample.fileName);
  };

  function Report() {
    if (state.errorMessage) {
      return (
        <div class="alert" data-variant="destructive" role="alert" id="inspector-error">
          <div class="alert-content">
            <h5 class="alert-title">Could not read {state.fileName}</h5>
            <p class="alert-description">{state.errorMessage}</p>
          </div>
        </div>
      );
    }
    const blendFile = state.blendFile;
    if (!blendFile) return <p class="card-description">No file loaded yet.</p>;
    return (
      <div style="display:grid;gap:1.5rem">
        <FileSummary blendFile={blendFile} fileName={state.fileName ?? ""} />
        <Thumbnail blendFile={blendFile} />
        <div class="inspector-columns">
          <div style="display:grid;gap:1.5rem">
            <DatablockTable blendFile={blendFile} onOpen={openDatablock} />
            <BlockCodeTable blendFile={blendFile} />
          </div>
          <StructBrowser openedStructs={state.openedStructs} onOpen={openStruct} onBack={goBack} />
        </div>
      </div>
    );
  }

  return (
    <section style="display:grid;gap:1.5rem" aria-label="Inspector">
      <div class="file-drop" data-max-files="1">
        <label class="file-drop-zone">
          <input class="file-drop-input" type="file" name="blend" accept=".blend,.blend1" id="inspector-file" onChange={loadChosenFile} />
          <span class="file-drop-icon" aria-hidden="true">⬡</span>
          <span class="file-drop-title">Drop a .blend file here or <span class="file-drop-browse">browse</span></span>
          <span class="file-drop-hint">Parsed in your browser; the file is never uploaded.</span>
        </label>
        <p class="file-drop-error"></p>
      </div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        {SAMPLES.map((sample) => (
          <button class="btn" type="button" data-variant="outline" key={sample.url} onClick={() => loadSample(sample)}>{sample.label}</button>
        ))}
      </div>
      <div ref={reportRef} id="inspector-report" aria-live="polite">
        <p class="card-description">No file loaded yet.</p>
      </div>
    </section>
  );
}
