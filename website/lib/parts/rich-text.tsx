// Short text with inline code written in backticks ("returns `BlendFile`"), as the reference tables and lists use it.
import type { Props } from "defuss";

export function RichText({ text }: Props & { text: string }) {
  return <>{text.split("`").map((part, index) => (index % 2 === 1 ? <code key={String(index)}>{part}</code> : part))}</>;
}
