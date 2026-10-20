// Build-time graphic: a .blend file as a strip of parts, with one block opened up. Numbers come from the fixtures.

/** The file as a strip of parts, then one block opened up into its 32 header bytes and payload. */
export function FileAnatomy() {
  const fileParts = [
    { label: "Header", detail: "12 or 17 bytes", tone: "header", weight: 1.2 },
    { label: "REND", detail: "scenes", tone: "special", weight: 1 },
    { label: "TEST", detail: "thumbnail", tone: "special", weight: 1 },
    { label: "GLOB", detail: "globals", tone: "special", weight: 1 },
    { label: "OB", detail: "datablock", tone: "datablock", weight: 1.2 },
    { label: "DATA", detail: "owned", tone: "data", weight: 0.9 },
    { label: "DATA", detail: "owned", tone: "data", weight: 0.9 },
    { label: "ME", detail: "datablock", tone: "datablock", weight: 1.2 },
    { label: "…", detail: "more blocks", tone: "data", weight: 1.4 },
    { label: "DNA1", detail: "type catalog", tone: "catalog", weight: 2 },
    { label: "ENDB", detail: "end", tone: "end", weight: 0.8 },
  ];
  const headerFields = [
    { name: "code", bytes: 4, example: '"OB\\0\\0"' },
    { name: "SDNAnr", bytes: 4, example: "struct index" },
    { name: "old", bytes: 8, example: "saved address" },
    { name: "len", bytes: 8, example: "payload size" },
    { name: "nr", bytes: 8, example: "struct count" },
  ];
  return (
    <figure class="graphic" aria-label="Anatomy of a .blend file">
      <ol class="anatomy-strip">
        {fileParts.map((part, index) => (
          <li key={`${part.label}-${index}`} class="anatomy-part" data-tone={part.tone} style={`flex-grow:${part.weight}`}>
            <strong>{part.label}</strong>
            <span>{part.detail}</span>
          </li>
        ))}
      </ol>
      <div class="anatomy-zoom" aria-hidden="true"><span>one block, opened up (Blender 5.x layout)</span></div>
      <div class="anatomy-block">
        <ol class="anatomy-bytes" aria-label="Block header: 32 bytes">
          {headerFields.map((field) => (
            <li key={field.name} class="anatomy-field" style={`flex-grow:${field.bytes}`}>
              <span class="anatomy-cells" style={`--cells:${field.bytes}`} aria-hidden="true">
                {Array.from({ length: field.bytes }, (_, cellIndex) => <i key={String(cellIndex)} />)}
              </span>
              <strong>{field.name}</strong>
              <span>{field.bytes} B · {field.example}</span>
            </li>
          ))}
        </ol>
        <div class="anatomy-payload">
          <strong>payload</strong>
          <span><code>nr</code> structs of type <code>SDNAnr</code>, <code>len</code> bytes</span>
        </div>
      </div>
      <figcaption>Blocks follow each other with no padding. The DNA1 block describes every struct type, so a reader needs no built-in struct definitions.</figcaption>
    </figure>
  );
}
