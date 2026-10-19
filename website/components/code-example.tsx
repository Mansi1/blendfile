// defuss-shadcn code block with tabs (CSS-only switching, rules for tab-0..tab-5 in site.css) and a copy button.
import { $, createRef, type Props } from "defuss";

export interface CodeExampleProps extends Props {
  /** Unique per page: names the radio group that switches the tabs. */
  name: string;
  label: string;
  tabs: { title: string; code: string }[];
}

export default function CodeExample({ name, label, tabs }: CodeExampleProps) {
  const figureRef = createRef<HTMLElement>();
  const statusRef = createRef<HTMLSpanElement>();
  const copyVisibleTab = async () => {
    const figure = figureRef.current;
    if (!figure) return;
    const checkedValue = figure.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? "tab-0";
    const code = tabs[Number(checkedValue.replace("tab-", ""))]?.code ?? "";
    try {
      await navigator.clipboard.writeText(code);
      $(statusRef).text("Copied");
    } catch {
      $(statusRef).text("Copy failed: select the code instead");
    }
  };
  return (
    <figure class="mk-code-block" ref={figureRef}>
      <div class="mk-code-block-head">
        <div class="mk-code-block-tabs" role="radiogroup" aria-label={label}>
          {tabs.map((tab, index) => (
            <label key={tab.title}><input type="radio" name={name} value={`tab-${index}`} checked={index === 0} />{tab.title}</label>
          ))}
        </div>
        <button class="mk-code-block-copy" type="button" aria-label="Copy code" onClick={copyVisibleTab}>⧉</button>
      </div>
      {tabs.map((tab, index) => (
        <pre key={tab.title} data-tab={`tab-${index}`}><code>{tab.code.split("\n").map((line, lineIndex) => <span key={String(lineIndex)}>{line}</span>)}</code></pre>
      ))}
      <span class="mk-code-block-status" role="status" ref={statusRef}></span>
    </figure>
  );
}
