// The library guide's error codes and the table of supported files.
import { CodeBlock } from "../parts/code-block.tsx";
import { ReferenceTable } from "../parts/reference-table.tsx";

const ERROR_CODES: [string, string][] = [
  ["`NOT_BLEND`", "the bytes are not a .blend file (no `BLENDER` magic after decompression)"],
  ["`UNSUPPORTED`", "a Blender file this version cannot decode (unknown header variant), or a member path that does not exist"],
  ["`CORRUPT`", "truncated data, a block that runs past the end, broken compression or SDNA"],
];

const CATCH_EXAMPLE = `
import { BlendError, parseBlendFile } from "blendfile";

try {
  parseBlendFile(bytes);
} catch (error) {
  if (error instanceof BlendError) console.error(error.code, error.message);
}`;

const SUPPORTED_FILES: [string, string][] = [
  ["Blender 5.x (17-byte header, `LargeBHead8`)", "tested with Blender 5.2.2 files"],
  ["Blender 2.5 to 4.x, 64-bit little endian (`SmallBHead8`)", "tested with Blender 4.3.0 files"],
  ["zstd (Blender 3.0+) and gzip (before 3.0)", "tested"],
  ["32-bit (`BHead4`) and big-endian files", "decoded per the specification; tested with synthetic files only"],
  ["Mesh positions before Blender 3.4 (`mvert`)", "supported in `readMeshVertexPositions`; no test file"],
];

export function ErrorsSection() {
  return (
    <>
      <h2 id="errors">Errors</h2>
      <p>Every failure is a <code>BlendError</code> with a <code>code</code>:</p>
      <ReferenceTable headings={["Code", "Meaning"]} rows={ERROR_CODES} />
      <CodeBlock code={CATCH_EXAMPLE} />
    </>
  );
}

export function SupportedFilesSection() {
  return (
    <>
      <h2 id="supported-files">Supported files</h2>
      <ReferenceTable headings={["File", "Status"]} rows={SUPPORTED_FILES} />
    </>
  );
}
