// Client-side .blend inspector: the VS Code extension's preview (3D view and inspector) running in the page through the
// blendfile library; nothing is uploaded. The preview lives in a shadow root so its styles and the site's stay apart.
import { createRef } from "defuss";
import { type PreviewApp, createPreviewApp } from "blendfile-preview";

// VERIFIED: relative to the inspector page at the site root, so they also resolve when the site is served under a sub-path.
const SAMPLES = [
  { label: "Blender 5.2 scene (zstd)", url: "assets/samples/scene_v52.blend", fileName: "scene_v52.blend" },
  { label: "Blender 4.3 textured plane", url: "assets/samples/texture_v43.blend", fileName: "texture_v43.blend", images: ["assets/samples/textures/texture_base.png", "assets/samples/textures/texture_normal.exr"] },
  { label: "Blender 4.3 sample", url: "assets/samples/v43.blend", fileName: "v43.blend" },
];
const PREVIEW_STYLESHEET = "assets/vendor/blend-preview.css";
const BLEND_FILE_NAME = /\.blend\d*$/i;

const baseName = (path: string) => path.split(/[\\/]/).at(-1)!.toLowerCase();

export default function Inspector() {
  const hostRef = createRef<HTMLDivElement>();
  const statusRef = createRef<HTMLParagraphElement>();
  let app: PreviewApp | undefined;
  /** Image files chosen or fetched with the .blend file, by lower-case file name; materials name them by path. */
  let imagesByName = new Map<string, Blob>();

  const setStatus = (text: string) => {
    if (statusRef.current) statusRef.current.textContent = text;
  };

  /** Runs in the browser after hydration; the build-time render also calls onMount, without a DOM. */
  function mountPreview(host: HTMLDivElement | null) {
    if (typeof document === "undefined" || !host || host.shadowRoot) return;
    const shadowRoot = host.attachShadow({ mode: "open" });
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = PREVIEW_STYLESHEET;
    const root = document.createElement("main");
    root.id = "preview-root";
    shadowRoot.append(stylesheet, root);
    app = createPreviewApp(root, {
      readImageFile: async (filepath) => {
        const image = imagesByName.get(baseName(filepath));
        if (!image) throw new Error(`'${baseName(filepath)}' was not chosen with the .blend file`);
        return new Uint8Array(await image.arrayBuffer());
      },
    });
  }

  async function show(fileName: string, bytes: ArrayBuffer) {
    if (!app) return;
    hostRef.current?.removeAttribute("hidden");
    const report = await app.showFile(fileName, new Uint8Array(bytes));
    setStatus(report.ok ? `${fileName}: Blender ${report.blenderVersion}, ${report.blockCount} blocks, ${report.datablockCount} datablocks` : `${fileName}: ${report.errorMessage}`);
  }

  async function loadChosenFiles(event: Event) {
    // VERIFIED: the defuss-shadcn file drop appends to the input's files instead of replacing them, so the newest .blend
    // file is the last one, and images dropped after it are added to it.
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    const blendFile = files.filter((file) => BLEND_FILE_NAME.test(file.name)).at(-1) ?? files.at(-1);
    if (!blendFile) return;
    imagesByName = new Map(files.filter((file) => !BLEND_FILE_NAME.test(file.name)).map((file) => [file.name.toLowerCase(), file]));
    await show(blendFile.name, await blendFile.arrayBuffer());
  }

  async function loadSample(sample: (typeof SAMPLES)[number]) {
    setStatus(`Loading ${sample.fileName}…`);
    const fetchBlob = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response.blob();
    };
    try {
      const images = await Promise.all((sample.images ?? []).map(async (url) => [baseName(url), await fetchBlob(url)] as const));
      imagesByName = new Map(images);
      await show(sample.fileName, await (await fetchBlob(sample.url)).arrayBuffer());
    } catch (error) {
      setStatus(`Could not load ${sample.fileName}: ${(error as Error).message}`);
    }
  }

  return (
    <section class="inspector-app" aria-label="Inspector">
      <div class="file-drop" data-max-files="20">
        <label class="file-drop-zone">
          <input class="file-drop-input" type="file" name="blend" multiple accept=".blend,.blend1,.png,.jpg,.jpeg,.webp,.bmp,.gif,.exr" id="inspector-file" onChange={loadChosenFiles} />
          <span class="file-drop-icon" aria-hidden="true">⬡</span>
          <span class="file-drop-title">Drop a .blend file here or <span class="file-drop-browse">browse</span></span>
          <span class="file-drop-hint">Add its image files too to see textures. Everything is read in your browser; nothing is uploaded.</span>
        </label>
        <p class="file-drop-error"></p>
      </div>
      <div class="inspector-samples">
        {SAMPLES.map((sample) => (
          <button class="btn" type="button" data-variant="outline" key={sample.url} onClick={() => loadSample(sample)}>{sample.label}</button>
        ))}
      </div>
      <p class="card-description" id="inspector-status" ref={statusRef} aria-live="polite">No file loaded yet.</p>
      <div class="blend-preview-host" id="inspector-preview" ref={hostRef} hidden onMount={() => mountPreview(hostRef.current)} />
    </section>
  );
}
