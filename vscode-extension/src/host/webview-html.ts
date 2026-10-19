// The webview page. No vscode import, so the e2e test can serve the same page outside VS Code.

export interface WebviewHtmlOptions {
  /** Origin the webview may load scripts and styles from (`webview.cspSource` in VS Code). */
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  nonce: string;
}

export const createNonce = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");

export function renderWebviewHtml({ cspSource, scriptUri, styleUri, nonce }: WebviewHtmlOptions): string {
  const contentSecurityPolicy = [
    "default-src 'none'",
    `img-src ${cspSource} data: blob:`,
    `style-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${styleUri}">
<title>Blend File Preview</title>
</head>
<body>
<main id="preview-root" aria-live="polite"><p class="muted">Reading file…</p></main>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
