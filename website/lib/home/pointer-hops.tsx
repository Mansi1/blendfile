// Build-time graphic: real pointer values from the Blender 5.2 fixture, hop by hop.
import { openFixture, formatHex } from "./fixtures.ts";

/** Real pointer values from the Blender 5.2 fixture: Object → Mesh → material array → Material. */
export function PointerHops() {
  const blendFile = openFixture("v52.blend");
  const object = blendFile.findDatablock("OB", "ProbeCube")!;
  const meshAddress = object.readPointer("data");
  const mesh = object.followPointer("data")!;
  const materialArrayAddress = mesh.readPointer("mat");
  const [materialAddress = 0n] = mesh.readPointerArray("mat");
  const material = blendFile.resolvePointer(materialAddress)[0]!;
  const hops = [
    { title: `Object "${object.datablockName}"`, block: "OB block", member: "*data", value: formatHex(meshAddress) },
    { title: `Mesh "${mesh.datablockName}"`, block: `ME block, old = ${formatHex(meshAddress)}`, member: "**mat", value: formatHex(materialArrayAddress) },
    { title: "Pointer array", block: `DATA block, old = ${formatHex(materialArrayAddress)}`, member: "[0]", value: formatHex(materialAddress) },
    { title: `Material "${material.datablockName}"`, block: `MA block, old = ${formatHex(materialAddress)}`, member: "r, g, b", value: ["r", "g", "b"].map((channel) => material.readMember(channel)).join(", ") },
  ];
  return (
    <figure class="graphic" aria-label="Following pointers through saved addresses">
      <ol class="pointer-hops">
        {hops.map((hop, index) => (
          <li key={hop.title} class="pointer-hop" data-step={String(index + 1)}>
            <span class="pointer-hop-block">{hop.block}</span>
            <strong>{hop.title}</strong>
            <span class="pointer-hop-member"><code>{hop.member}</code> = <code>{hop.value}</code></span>
          </li>
        ))}
      </ol>
      <figcaption>Values read from the Blender 5.2 test file. A pointer holds the address a struct had when Blender saved; the block whose <code>old</code> field matches is the target.</figcaption>
    </figure>
  );
}
