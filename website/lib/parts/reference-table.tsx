// A two-column table of names and descriptions (API exports, error codes, supported files); cells may hold `code`.
import type { Props } from "defuss";
import { RichText } from "./rich-text.tsx";

export interface ReferenceTableProps extends Props {
  headings: [string, string];
  rows: [string, string][];
}

export function ReferenceTable({ headings, rows }: ReferenceTableProps) {
  return (
    <table class="reference-table">
      <thead><tr><th>{headings[0]}</th><th>{headings[1]}</th></tr></thead>
      <tbody>
        {rows.map(([name, description]) => (
          <tr key={name}><td><RichText text={name} /></td><td><RichText text={description} /></td></tr>
        ))}
      </tbody>
    </table>
  );
}
