// The 3D view tab: toolbar, viewport, outliner and status line around a SceneViewport.
import { $, createRef } from "defuss";
import type { BlendFile } from "../../../src/index.ts";
import { type RenderScene, buildRenderScene } from "./scene-model.ts";
import { decodeTexture } from "./texture-loader.ts";
import { SceneViewport, type ShadingMode } from "./viewport.ts";

const SHADING_MODES: { mode: ShadingMode; label: string; hint: string }[] = [
  { mode: "wireframe", label: "Wireframe", hint: "Edges only" },
  { mode: "solid", label: "Solid", hint: "Studio light, viewport colors" },
  { mode: "material", label: "Material", hint: "Principled BSDF values and image textures, studio environment" },
  { mode: "rendered", label: "Rendered", hint: "The scene's own lights and world color" },
];
const KIND_ICONS: Record<string, string> = { mesh: "▲", light: "☀", camera: "◧", empty: "✛" };

export interface ViewerPanelState {
  shadingMode: ShadingMode;
  selectedName?: string;
  view?: { position: number[]; target: number[] };
}

export interface ViewerPanelOptions {
  /** Opens an object in the inspector tab's struct browser. */
  onInspect: (objectName: string) => void;
  /** Reads an image file a material names (Image.filepath as saved) through the extension host. */
  readImageFile: (filepath: string) => Promise<Uint8Array>;
  /** Called once every image texture has loaded or failed (not called when the materials use none). */
  onTexturesSettled?: (status: TextureStatus) => void;
}

/** Image textures of the materials: how many there are and which could not be shown. */
export interface TextureStatus {
  total: number;
  loaded: number;
  failed: { imageName: string; reason: string }[];
}

export interface ViewerSummary {
  objectCount: number;
  meshCount: number;
  triangleCount: number;
  skippedCount: number;
  textures?: TextureStatus;
}

/** Mounts the 3D view into `container`. Returns a handle to read its state before the next file load replaces it. */
export function mountViewerPanel(container: HTMLElement, blendFile: BlendFile, previous: ViewerPanelState | undefined, options: ViewerPanelOptions) {
  let renderScene: RenderScene;
  try {
    renderScene = buildRenderScene(blendFile);
  } catch (error) {
    void $(container).update(<p class="viewer-message" role="alert">The scene could not be prepared for the 3D view: {(error as Error).message}</p>);
    return undefined;
  }

  const viewportRef = createRef<HTMLDivElement>();
  const toolbarRef = createRef<HTMLDivElement>();
  const outlinerRef = createRef<HTMLDivElement>();
  let viewport: SceneViewport | undefined;
  let disposed = false;

  const refreshToolbar = () => void $(toolbarRef).update(<Toolbar />);
  const refreshOutliner = () => void $(outlinerRef).update(<Outliner />);
  const textureStatusRef = createRef<HTMLSpanElement>();
  const textureStatus: TextureStatus = { total: 0, loaded: 0, failed: [] };
  const refreshTextureStatus = () => void $(textureStatusRef).update(<TextureStatusText />);

  function TextureStatusText() {
    if (textureStatus.total === 0) return <span />;
    const pending = textureStatus.total - textureStatus.loaded - textureStatus.failed.length;
    const failures = textureStatus.failed.map((failure) => `${failure.imageName}: ${failure.reason}`).join("\n");
    return (
      <span class={textureStatus.failed.length > 0 ? "notice" : "muted"} title={failures || undefined}>
        Textures {textureStatus.loaded}/{textureStatus.total}{pending > 0 ? " loading…" : ""}{textureStatus.failed.length > 0 ? ` · ${textureStatus.failed.length} missing: ${textureStatus.failed.map((failure) => failure.imageName).join(", ")}` : ""}
      </span>
    );
  }

  function Toolbar() {
    const current = viewport?.currentShadingMode ?? previous?.shadingMode ?? "solid";
    return (
      <div class="toolbar-groups">
        <div class="segmented" role="group" aria-label="Viewport shading">
          {SHADING_MODES.map(({ mode, label, hint }) => (
            <button type="button" key={mode} title={hint} aria-pressed={String(current === mode)} onClick={() => { viewport?.setShadingMode(mode); refreshToolbar(); }}>{label}</button>
          ))}
        </div>
        <div class="toolbar-actions">
          <button type="button" title="Home" onClick={() => viewport?.frameAll()}>Frame all</button>
          <button type="button" title="Numpad ." onClick={() => viewport?.frameSelected()}>Frame selected</button>
          {viewport?.hasSceneCamera
            ? <button type="button" title="Numpad 0" aria-pressed={String(viewport.isLookingThroughSceneCamera)} onClick={() => { viewport?.toggleSceneCameraView(); refreshToolbar(); }}>Camera view</button>
            : null}
          <button type="button" aria-pressed={String(viewport?.areOverlaysVisible ?? true)} onClick={() => { viewport?.setOverlaysVisible(!viewport.areOverlaysVisible); refreshToolbar(); }}>Overlays</button>
        </div>
      </div>
    );
  }

  function Outliner() {
    const objects = viewport?.listObjects() ?? [];
    const selectedName = viewport ? selected : undefined;
    return (
      <ul class="outliner-list" aria-label="Scene objects">
        {objects.map((object) => (
          <li key={object.name} class={object.name === selectedName ? "selected" : ""}>
            <input type="checkbox" aria-label={`Show ${object.name}`} {...(object.visible ? { checked: true } : {})} onChange={(event: Event) => { viewport?.setObjectVisible(object.name, (event.target as HTMLInputElement).checked); }} />
            <span class="kind" aria-hidden="true" title={object.kind}>{KIND_ICONS[object.kind] ?? "•"}</span>
            <button type="button" class="link" onClick={() => viewport?.select(object.name)}>{object.name}</button>
            <button type="button" class="inspect" title={`Open ${object.name} in the inspector`} aria-label={`Inspect ${object.name}`} onClick={() => options.onInspect(object.name)}>⋯</button>
          </li>
        ))}
        {renderScene.skippedObjects.map((skipped) => (
          <li key={`skipped-${skipped.objectName}`} class="skipped" title={skipped.reason}>
            <span class="kind" aria-hidden="true">∅</span>
            <span>{skipped.objectName}</span>
            <span class="muted">not drawn</span>
          </li>
        ))}
      </ul>
    );
  }

  const meshesWithModifiers = renderScene.meshes.filter((mesh) => mesh.modifierNames.length > 0);
  const summary: ViewerSummary = {
    objectCount: renderScene.meshes.length + renderScene.lights.length + renderScene.cameras.length + renderScene.empties.length,
    meshCount: renderScene.meshes.length,
    triangleCount: renderScene.meshes.reduce((sum, mesh) => sum + mesh.triangleCount, 0),
    skippedCount: renderScene.skippedObjects.length,
  };
  const vertexCount = renderScene.meshes.reduce((sum, mesh) => sum + mesh.vertexCount, 0);
  const faceCount = renderScene.meshes.reduce((sum, mesh) => sum + mesh.faceCount, 0);
  let selected = previous?.selectedName;

  void $(container).update(
    <div class="viewer">
      <div class="viewer-toolbar" ref={toolbarRef}><Toolbar /></div>
      <div class="viewer-main">
        <div class="viewport" ref={viewportRef} />
        <aside class="outliner" aria-label="Outliner">
          <h2>Scene “{renderScene.sceneName}”</h2>
          <div ref={outlinerRef}><Outliner /></div>
        </aside>
      </div>
      <footer class="viewer-status">
        <span id="viewer-statistics">Objects {summary.objectCount} · Vertices {vertexCount.toLocaleString("en")} · Faces {faceCount.toLocaleString("en")} · Triangles {summary.triangleCount.toLocaleString("en")}</span>
        {meshesWithModifiers.length > 0
          ? <span class="notice" title="Files store meshes before modifiers; the 3D view shows them unmodified.">Modifiers not applied: {meshesWithModifiers.map((mesh) => `${mesh.objectName} (${mesh.modifierNames.join(", ")})`).join("; ")}</span>
          : null}
        <span id="viewer-textures" ref={textureStatusRef}><TextureStatusText /></span>
        <span class="muted hint">Drag: orbit · Shift-drag: pan · Wheel: zoom · 1/3/7: views · 0: camera · Home: frame all</span>
      </footer>
    </div>,
  );

  try {
    viewport = new SceneViewport(viewportRef.current!, renderScene, {
      onSelect: (name) => {
        selected = name;
        refreshOutliner();
      },
    });
  } catch (error) {
    void $(container).update(<p class="viewer-message" role="alert">The 3D view needs WebGL, which is not available here: {(error as Error).message}. The Inspector tab still works.</p>);
    return undefined;
  }
  if (previous?.view) viewport.restoreView(previous.view);
  viewport.setShadingMode(previous?.shadingMode ?? "solid");
  if (previous?.selectedName) viewport.select(previous.selectedName);
  refreshToolbar();
  refreshOutliner();
  Object.assign(window, { blendViewport: viewport, blendTextureStatus: textureStatus });
  void loadTextures(viewport);

  /** One image at a time, so several 4K maps never sit decoded in memory together. Shows in Material and Rendered modes. */
  async function loadTextures(target: SceneViewport) {
    const requests = target.textureRequests;
    textureStatus.total = requests.length;
    refreshTextureStatus();
    for (const request of requests) {
      try {
        const bytes = request.packedBytes ?? (await options.readImageFile(request.filepath));
        target.applyTexture(request.key, await decodeTexture(bytes, request));
        textureStatus.loaded += 1;
      } catch (error) {
        textureStatus.failed.push({ imageName: request.imageName, reason: (error as Error).message || String(error) });
      }
      refreshTextureStatus();
    }
    if (requests.length > 0 && !disposed) options.onTexturesSettled?.(textureStatus);
  }

  return {
    summary,
    readState: (): ViewerPanelState => ({ shadingMode: viewport!.currentShadingMode, selectedName: selected, view: viewport!.viewState }),
    dispose: () => {
      disposed = true;
      viewport?.dispose();
    },
  };
}
