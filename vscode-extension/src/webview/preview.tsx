// Webview entry: receives the file's bytes from the host and shows them with the shared preview app.
import type { HostToWebviewMessage, WebviewToHostMessage } from "../messages.ts";
import { createPreviewApp } from "./preview-app.tsx";
import { ImageFileRequests } from "./texture-loader.ts";

declare function acquireVsCodeApi(): { postMessage(message: WebviewToHostMessage): void };
const vscodeApi = acquireVsCodeApi();
const imageFileRequests = new ImageFileRequests((message) => vscodeApi.postMessage(message));

const app = createPreviewApp(document.getElementById("preview-root")!, {
  readImageFile: (filepath) => imageFileRequests.read(filepath),
  onReport: (fileName, report) => vscodeApi.postMessage({ type: "rendered", fileName, report }),
});

window.addEventListener("message", (event: MessageEvent<HostToWebviewMessage>) => {
  if (event.data?.type === "load") void app.showFile(event.data.fileName, event.data.bytes);
  if (event.data?.type === "image") imageFileRequests.handleReply(event.data);
});
vscodeApi.postMessage({ type: "ready" });
