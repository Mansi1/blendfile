// The preview UI shared by the VS Code webview and the website's inspector: a 3D view and an inspector of one parsed
// .blend file, rendered into a given root element. Callers supply the bytes and, optionally, image files for textures.
import { $, createRef } from "defuss";
import { BlendError, type BlendFile, type BlendStruct, parseBlendFile } from "../../../src/index.ts";
import type { PreviewReport } from "../messages.ts";
import {
  type DatablockGroup,
  describeFileFacts,
  describeMembers,
  filterDatablockGroups,
  formatBytes,
  groupDatablocksByIdCode,
  labelOfStruct,
  totalBlocksByCode,
} from "./preview-model.ts";
import { eventElement } from "./dom-events.ts";
import { type ViewerPanelState, type ViewerSummary, mountViewerPanel } from "./viewer-panel.tsx";

export interface PreviewAppOptions {
  /** Bytes of an image file a material names; without it, external textures are reported as missing. */
  readImageFile?: (filepath: string) => Promise<Uint8Array>;
  /** Called after each render, and again once textures have loaded or failed. */
  onReport?: (fileName: string, report: PreviewReport) => void;
}

export interface PreviewApp {
  /** Parses and shows a file; `bytes` may be any view or buffer the caller's transport delivers. */
  showFile(fileName: string, bytes: unknown): Promise<PreviewReport>;
}

interface PreviewState {
  blendFile?: BlendFile;
  fileName: string;
  datablockGroups: DatablockGroup[];
  filterQuery: string;
  /** Structs opened so far; the last one is shown. Following a pointer pushes its target. */
  openedStructs: BlendStruct[];
  activeTab: TabName;
  viewer?: { readState: () => ViewerPanelState; dispose: () => void; summary: ViewerSummary };
  viewerState?: ViewerPanelState;
}

type TabName = "viewer" | "inspector";
const TABS: { name: TabName; label: string }[] = [
  { name: "viewer", label: "3D View" },
  { name: "inspector", label: "Inspector" },
];

/**
 * VERIFIED: renders the preview into `rootElement`. Elements are looked up inside it, not in the document, so the root may sit
 * in a shadow root that keeps the preview's styles apart from the page around it.
 */
export function createPreviewApp(rootElement: HTMLElement, options: PreviewAppOptions = {}): PreviewApp {
  const state: PreviewState = { fileName: "", datablockGroups: [], filterQuery: "", openedStructs: [], activeTab: "viewer" };
  const datablockListRef = createRef<HTMLDivElement>();
  const structPanelRef = createRef<HTMLDivElement>();
  const viewerHostRef = createRef<HTMLElement>();

  /** Switches tabs without re-rendering, so the 3D canvas and the inspector keep their state. */
  function selectTab(name: TabName) {
    state.activeTab = name;
    for (const tab of TABS) {
      rootElement.querySelector(`#tab-${tab.name}`)?.setAttribute("aria-selected", String(tab.name === name));
      rootElement.querySelector(`#panel-${tab.name}`)?.toggleAttribute("hidden", tab.name !== name);
    }
  }

  function inspectObject(objectName: string) {
    const object = state.blendFile?.findDatablock("OB", objectName);
    if (!object) return;
    selectTab("inspector");
    openStruct(object, { startNewPath: true });
  }

  function openStruct(struct: BlendStruct, { startNewPath }: { startNewPath: boolean }) {
    state.openedStructs = startNewPath ? [struct] : [...state.openedStructs, struct];
    void $(structPanelRef).update(<StructPanel />);
  }

  function returnToStruct(depth: number) {
    state.openedStructs = state.openedStructs.slice(0, depth + 1);
    void $(structPanelRef).update(<StructPanel />);
  }

  function filterDatablocks(event: Event) {
    state.filterQuery = eventElement<HTMLInputElement>(event).value;
    void $(datablockListRef).update(<DatablockList />);
  }

  function FileFacts({ blendFile }: { blendFile: BlendFile }) {
    return (
      <dl class="facts">
        {describeFileFacts(blendFile, state.fileName).map(([title, value]) => (
          <div class="fact" key={title}>
            <dt>{title}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  function ThumbnailAndScenes({ blendFile }: { blendFile: BlendFile }) {
    const thumbnail = blendFile.readThumbnail();
    const scenes = blendFile.readRenderInfo();
    return (
      <section class="panel" aria-labelledby="preview-title">
        <h2 id="preview-title">Preview</h2>
        {thumbnail
          ? <canvas id="thumbnail" class="thumbnail" role="img" aria-label="File thumbnail" width={thumbnail.width} height={thumbnail.height} />
          : <p class="muted">This file has no thumbnail.</p>}
        <ul class="scenes">
          {scenes.map((scene) => (
            <li key={scene.sceneName}>Scene <strong>{scene.sceneName}</strong>, frames {scene.frameStart}–{scene.frameEnd}</li>
          ))}
        </ul>
      </section>
    );
  }

  function drawThumbnail(blendFile: BlendFile) {
    const thumbnail = blendFile.readThumbnail();
    const canvas = rootElement.querySelector<HTMLCanvasElement>("#thumbnail");
    const context = canvas?.getContext("2d");
    if (thumbnail && context) context.putImageData(new ImageData(new Uint8ClampedArray(thumbnail.rgba), thumbnail.width, thumbnail.height), 0, 0);
  }

  function DatablockList() {
    const groups = filterDatablockGroups(state.datablockGroups, state.filterQuery);
    if (groups.length === 0) return <p class="muted">No datablock matches “{state.filterQuery}”.</p>;
    return (
      <div class="groups">
        {groups.map((group) => (
          <details class="group" key={group.idCode} {...(state.filterQuery !== "" || (!group.isInterfaceState && group.entries.length <= 12) ? { open: true } : {})}>
            <summary><span class="badge">{group.idCode}</span>{group.label}<span class="count">{group.entries.length}</span></summary>
            <ul>
              {group.entries.map((entry) => (
                <li key={String(entry.struct.offset)}>
                  <button type="button" class="link" onClick={() => openStruct(entry.struct, { startNewPath: true })}>{entry.name || "(unnamed)"}</button>
                  <code class="muted">{entry.struct.structType.name}</code>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    );
  }

  function StructPanel() {
    const struct = state.openedStructs.at(-1);
    if (!struct) {
      return (
        <div class="empty">
          <h2>Struct browser</h2>
          <p class="muted">Pick a datablock on the left to see its members as the file's SDNA describes them. Pointers and inline structs can be followed.</p>
        </div>
      );
    }
    const copyAsJson = () => void navigator.clipboard.writeText(JSON.stringify(struct.toJSON(1), null, 2));
    return (
      <div>
        <nav aria-label="Opened structs">
          <ol class="breadcrumb">
            {state.openedStructs.map((opened, depth) => (
              <li key={`${depth}-${opened.offset}`}>
                {depth === state.openedStructs.length - 1
                  ? <span aria-current="page">{labelOfStruct(opened)}</span>
                  : <button type="button" class="link" onClick={() => returnToStruct(depth)}>{labelOfStruct(opened)}</button>}
              </li>
            ))}
          </ol>
        </nav>
        <div class="struct-heading">
          <div>
            <h2 id="struct-title">{struct.structType.name}</h2>
            <p class="muted">{struct.structType.size} bytes at file offset {struct.offset}, {struct.structType.members.length} members</p>
          </div>
          <button type="button" class="button" onClick={copyAsJson}>Copy as JSON</button>
        </div>
        <div class="table-scroll">
          <table class="members" aria-labelledby="struct-title">
            <thead><tr><th class="number">Offset</th><th>Type</th><th>Member</th><th>Value</th></tr></thead>
            <tbody>
              {describeMembers(struct).map(({ member, valueText, openTarget }) => (
                <tr key={member.declarator}>
                  <td class="number">{member.offset}</td>
                  <td><code>{member.type}</code></td>
                  <td><code>{member.declarator}</code></td>
                  <td>{openTarget
                    ? <button type="button" class="link" onClick={() => openStruct(openTarget, { startNewPath: false })}>{valueText}</button>
                    : <span class="value">{valueText}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function BlockTable({ blendFile }: { blendFile: BlendFile }) {
    return (
      <details class="panel">
        <summary><h2>Blocks by code</h2></summary>
        <table class="blocks">
          <thead><tr><th>Code</th><th class="number">Blocks</th><th class="number">Payload</th></tr></thead>
          <tbody>
            {totalBlocksByCode(blendFile).map((total) => (
              <tr key={total.code}><td><code>{total.code}</code></td><td class="number">{total.count}</td><td class="number">{formatBytes(total.bytes)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    );
  }

  function Preview({ blendFile }: { blendFile: BlendFile }) {
    return (
      <div class="app">
        <header class="title-bar">
          <h1>{state.fileName}</h1>
          <span class="badge">Blender {blendFile.blenderVersion}</span>
          <span class="muted">{formatBytes(blendFile.fileBytes.length)} uncompressed{blendFile.compressionMethod === "none" ? "" : `, stored with ${blendFile.compressionMethod}`}</span>
          <div class="tabs" role="tablist" aria-label="Views">
            {TABS.map((tab) => (
              <button type="button" role="tab" key={tab.name} id={`tab-${tab.name}`} aria-controls={`panel-${tab.name}`} aria-selected={String(tab.name === state.activeTab)} onClick={() => selectTab(tab.name)}>{tab.label}</button>
            ))}
          </div>
        </header>
        <section class="viewer-host" id="panel-viewer" role="tabpanel" aria-labelledby="tab-viewer" ref={viewerHostRef} {...(state.activeTab === "viewer" ? {} : { hidden: true })} />
        <div class="layout" id="panel-inspector" role="tabpanel" aria-labelledby="tab-inspector" {...(state.activeTab === "inspector" ? {} : { hidden: true })}>
        <aside class="sidebar">
          <ThumbnailAndScenes blendFile={blendFile} />
          <section class="panel" aria-labelledby="datablocks-title">
            <h2 id="datablocks-title">Datablocks</h2>
            <input type="search" class="filter" placeholder="Filter by name or type" aria-label="Filter datablocks" value={state.filterQuery} onInput={filterDatablocks} />
            <div ref={datablockListRef}><DatablockList /></div>
          </section>
          <section class="panel" aria-labelledby="facts-title">
            <h2 id="facts-title">File</h2>
            <FileFacts blendFile={blendFile} />
          </section>
          <BlockTable blendFile={blendFile} />
        </aside>
        <section class="struct-panel" ref={structPanelRef} aria-label="Struct browser"><StructPanel /></section>
        </div>
      </div>
    );
  }

  function ErrorMessage({ message }: { message: string }) {
    return (
      <div class="error" role="alert">
        <h1>Could not read {state.fileName}</h1>
        <p>{message}</p>
      </div>
    );
  }

  /** Parses the bytes, renders, and reports what was shown. Keeps the opened struct path across reloads when it still resolves. */
  async function showFile(fileName: string, bytes: unknown): Promise<PreviewReport> {
    state.fileName = fileName;
    let report: PreviewReport;
    try {
      const blendFile = parseBlendFile(asUint8Array(bytes));
      if (state.viewer) {
        state.viewerState = state.viewer.readState();
        state.viewer.dispose();
        state.viewer = undefined;
      }
      const reopenedPath = state.openedStructs.map((opened) => blendFile.findDatablock(datablockCodeOf(opened), opened.datablockName ?? "")).filter((struct) => struct !== undefined);
      state.blendFile = blendFile;
      state.datablockGroups = groupDatablocksByIdCode(blendFile);
      state.openedStructs = reopenedPath.slice(0, 1);
      await $(rootElement).update(<Preview blendFile={blendFile} />);
      drawThumbnail(blendFile);
      state.viewer = mountViewerPanel(viewerHostRef.current!, blendFile, state.viewerState, {
        onInspect: inspectObject,
        readImageFile: options.readImageFile ?? ((filepath) => Promise.reject(new Error(`'${filepath}' is not available here`))),
        onTexturesSettled: (textures) => {
          if (report.ok && report.viewer) options.onReport?.(fileName, { ...report, viewer: { ...report.viewer, textures: structuredClone(textures) } });
        },
      });
      const datablockCount = state.datablockGroups.reduce((sum, group) => sum + group.entries.length, 0);
      report = {
        ok: true,
        blenderVersion: blendFile.blenderVersion,
        blockCount: blendFile.blocks.length,
        datablockCount,
        hasThumbnail: blendFile.readThumbnail() !== undefined,
        viewer: state.viewer?.summary,
      };
    } catch (error) {
      const message = error instanceof BlendError ? `${error.code}: ${error.message}` : String(error);
      state.blendFile = undefined;
      state.openedStructs = [];
      state.viewer?.dispose();
      state.viewer = undefined;
      await $(rootElement).update(<ErrorMessage message={message} />);
      report = { ok: false, errorMessage: message };
    }
    options.onReport?.(fileName, report);
    return report;
  }

  return { showFile };
}

/** The message's bytes as a Uint8Array, whatever view or buffer type the serializer delivered. */
function asUint8Array(bytes: unknown): Uint8Array {
  if (bytes instanceof Uint8Array) return bytes;
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  throw new Error(`the editor sent ${Object.prototype.toString.call(bytes)} instead of file bytes`);
}

/** ID code of a datablock struct from its `id.name` prefix, e.g. "OBCube" → "OB". */
const datablockCodeOf = (struct: BlendStruct) => String(struct.structType.findMember("id") ? struct.readMember("id.name") : "").slice(0, 2);

