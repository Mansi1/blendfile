// Extension host: registers a read-only custom editor for .blend files. Parsing happens in the webview,
// so the host only reads bytes through vscode.workspace.fs (local, remote and virtual file systems alike).
import * as vscode from "vscode";
import type { HostToWebviewMessage, PreviewReport, WebviewToHostMessage } from "../messages.ts";
import { imagePathCandidates } from "./image-paths.ts";
import { createNonce, renderWebviewHtml } from "./webview-html.ts";

export const PREVIEW_VIEW_TYPE = "blendfile.preview";

/** Returned from activate(); the integration test reads what each preview reported after rendering. */
export interface BlendPreviewApi {
  /** The first report that satisfies `accept` (default: the first report). The webview reports again when textures settle. */
  waitForReport(uri: vscode.Uri, accept?: (report: PreviewReport) => boolean): Promise<PreviewReport>;
}

const fileNameOf = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf("/") + 1);
/** Larger image files are not sent to the webview. */
const MAX_IMAGE_BYTES = 256 * 1024 * 1024;

/** The webview message serializer only rebuilds plain typed arrays; on desktop readFile returns a Node Buffer. */
const toPlainBytes = (fileBytes: Uint8Array) => new Uint8Array(fileBytes.buffer, fileBytes.byteOffset, fileBytes.byteLength).slice();

/** Reads the first candidate path of an image a .blend file names that exists, on the .blend file's own file system. */
async function readImageFile(blendUri: vscode.Uri, filepath: string): Promise<Uint8Array> {
  const blendFolder = vscode.Uri.joinPath(blendUri, "..");
  const candidates = imagePathCandidates(blendFolder.path, filepath);
  if (candidates.length === 0) throw new Error(`'${filepath}' is not an image file the preview can show`);
  for (const path of candidates) {
    const uri = blendFolder.with({ path });
    const stat = await vscode.workspace.fs.stat(uri).then((value) => value, () => undefined);
    if (!stat || stat.type & vscode.FileType.Directory) continue;
    if (stat.size > MAX_IMAGE_BYTES) throw new Error(`'${filepath}' is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
    return toPlainBytes(await vscode.workspace.fs.readFile(uri));
  }
  throw new Error(`'${filepath}' was not found`);
}

class BlendPreviewProvider implements vscode.CustomReadonlyEditorProvider {
  private readonly reports = new Map<string, PreviewReport>();
  private readonly reportListeners = new Map<string, { accept: (report: PreviewReport) => boolean; resolve: (report: PreviewReport) => void }[]>();

  constructor(private readonly extensionUri: vscode.Uri) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => this.reports.delete(uri.toString()) };
  }

  resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): void {
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, "media");
    const webview = panel.webview;
    webview.options = { enableScripts: true, localResourceRoots: [mediaUri] };
    webview.html = renderWebviewHtml({
      cspSource: webview.cspSource,
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "preview.js")).toString(),
      styleUri: webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "preview.css")).toString(),
      nonce: createNonce(),
    });

    const sendFileBytes = async () => {
      const bytes = toPlainBytes(await vscode.workspace.fs.readFile(document.uri));
      const message: HostToWebviewMessage = { type: "load", fileName: fileNameOf(document.uri), bytes };
      await webview.postMessage(message);
    };

    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(document.uri, ".."), fileNameOf(document.uri)),
    );
    const subscriptions = [
      fileWatcher,
      fileWatcher.onDidChange(() => void sendFileBytes()),
      fileWatcher.onDidCreate(() => void sendFileBytes()),
      webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
        if (message.type === "ready") void sendFileBytes().catch((error: Error) => vscode.window.showErrorMessage(`Blend preview: ${error.message}`));
        if (message.type === "rendered") this.recordReport(document.uri, message.report);
        if (message.type === "readImage") {
          void readImageFile(document.uri, message.filepath).then(
            (bytes): HostToWebviewMessage => ({ type: "image", requestId: message.requestId, bytes }),
            (error: Error): HostToWebviewMessage => ({ type: "image", requestId: message.requestId, errorMessage: error.message }),
          ).then((reply) => webview.postMessage(reply));
        }
      }),
    ];
    panel.onDidDispose(() => subscriptions.forEach((subscription) => subscription.dispose()));
  }

  waitForReport(uri: vscode.Uri, accept: (report: PreviewReport) => boolean = () => true): Promise<PreviewReport> {
    const known = this.reports.get(uri.toString());
    if (known && accept(known)) return Promise.resolve(known);
    return new Promise((resolve) => {
      const listeners = this.reportListeners.get(uri.toString()) ?? [];
      this.reportListeners.set(uri.toString(), [...listeners, { accept, resolve }]);
    });
  }

  private recordReport(uri: vscode.Uri, report: PreviewReport) {
    this.reports.set(uri.toString(), report);
    const listeners = this.reportListeners.get(uri.toString()) ?? [];
    for (const listener of listeners.filter((candidate) => candidate.accept(report))) listener.resolve(report);
    this.reportListeners.set(uri.toString(), listeners.filter((candidate) => !candidate.accept(report)));
  }
}

export function activate(context: vscode.ExtensionContext): BlendPreviewApi {
  const provider = new BlendPreviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(PREVIEW_VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: true,
      // Keeps the parsed file and the opened struct path when the tab is in the background.
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("blendfile.openPreview", (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) return vscode.window.showInformationMessage("Select a .blend file to preview.");
      return vscode.commands.executeCommand("vscode.openWith", target, PREVIEW_VIEW_TYPE);
    }),
  );
  return { waitForReport: (uri, accept) => provider.waitForReport(uri, accept) };
}

export function deactivate() {}
