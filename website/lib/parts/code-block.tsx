// A static code block, highlighted with Shiki while the page is written (no script in the browser).
// For code with tabs and a copy button use components/code-example.tsx.
import type { Props } from "defuss";
import { highlightToHtml } from "../highlight.ts";

export function CodeBlock({ code, lang = "ts" }: Props & { code: string; lang?: string }) {
  return <div class="code-block" dangerouslySetInnerHTML={{ __html: highlightToHtml(code.trim(), lang) }} />;
}
