// Messages between the extension host and the preview webview.

/** Host → webview: the file's bytes, sent on open and again whenever the file changes on disk. */
export interface LoadFileMessage {
  type: "load";
  fileName: string;
  bytes: Uint8Array;
}

/** Host → webview: an image file a material uses, or why it could not be read. Answers a ReadImageMessage. */
export interface ImageFileMessage {
  type: "image";
  requestId: number;
  bytes?: Uint8Array;
  errorMessage?: string;
}

/** Webview → host: read an image a material names; `filepath` is Image.filepath as saved ("//" = next to the .blend file). */
export interface ReadImageMessage {
  type: "readImage";
  requestId: number;
  filepath: string;
}

/** Webview → host: the page is listening. */
export interface ReadyMessage {
  type: "ready";
}

/** Webview → host: what the preview shows after parsing, or why it could not parse. */
export interface RenderedMessage {
  type: "rendered";
  fileName: string;
  report: PreviewReport;
}

export type PreviewReport =
  | {
      ok: true;
      blenderVersion: string;
      blockCount: number;
      datablockCount: number;
      hasThumbnail: boolean;
      /** What the 3D view drew; undefined when the scene could not be prepared. */
      viewer?: {
        objectCount: number;
        meshCount: number;
        triangleCount: number;
        skippedCount: number;
        /** Image textures of the materials; the webview reports again once every one has loaded or failed. */
        textures?: { total: number; loaded: number; failed: { imageName: string; reason: string }[] };
      };
    }
  | { ok: false; errorMessage: string };

export type HostToWebviewMessage = LoadFileMessage | ImageFileMessage;
export type WebviewToHostMessage = ReadyMessage | RenderedMessage | ReadImageMessage;
