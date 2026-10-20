// The library guide's walk through reading data: datablocks, members, pointers, meshes, scenes and file info.
import { CodeBlock } from "../parts/code-block.tsx";

const DATABLOCKS = `
const scene = blendFile.findDatablock("SC", "Scene");
scene?.readMember("r.sfra"); // first frame; dotted paths walk inline structs
scene?.readMember("r.xsch"); // render width`;

const MEMBERS = `
const object = blendFile.findDatablock("OB", "Cube")!;
object.readMember("loc");        // [1, 2, 3]
object.readMember("size");       // scale; files store Object.scale as "size"
object.readMember("id.name");    // "OBCube"
object.memberNames;              // every member in declaration order
object.toJSON(1);                // plain object for logging or JSON`;

const POINTERS = `
const mesh = object.followPointer("data");          // Object.data → Mesh
const layers = scene!.readListBase("view_layers");  // ListBase → ViewLayer[]

// pointer arrays and strings stored in raw blocks
const materialAddresses = mesh!.readPointerArray("mat");
const materials = materialAddresses.map((address) => blendFile.resolvePointer(address)[0]);`;

const MESH_POSITIONS = `
import { readMeshVertexPositions } from "blendfile";
const positions = readMeshVertexPositions(mesh!); // Float32Array, xyz per vertex`;

const SCENES = `
import { readScene, readMeshGeometry, triangulateMeshGeometry, readMaterialAppearance, readLight, readCamera } from "blendfile";

const scene = readScene(blendFile); // first scene, or readScene(blendFile, "Scene")
for (const object of scene.objects) {
  object.name, object.type, object.visible; // "mesh" | "light" | "camera" | "empty" | "other"
  object.worldMatrix;                        // Float64Array(16), column-major, Blender's matrix_world
  if (object.type === "mesh") {
    const geometry = readMeshGeometry(object.data!);   // positions, faceOffsets, cornerVertices, faceMaterialIndices, faceSmooth
    const { vertexIndices } = triangulateMeshGeometry(geometry); // concave n-gons included
    const colors = object.materials.map((material) => material && readMaterialAppearance(material).principled?.baseColor);
  }
  if (object.type === "light") readLight(object.data!);   // type, color, power (W), spot and area sizes
  if (object.type === "camera") readCamera(object.data!); // lens, sensor, fit, clipping
}`;

const FILE_INFO = `
blendFile.readRenderInfo(); // [{ sceneName, frameStart, frameEnd }]
blendFile.readThumbnail();  // { width, height, rgba } top-down, or undefined`;

export function ReadingDataSection() {
  return (
    <>
      <h2 id="reading-data">Reading data</h2>
      <p><strong>Datablocks</strong> are found by their 2-letter ID code and name (without the code prefix):</p>
      <CodeBlock code={DATABLOCKS} />
      <p><strong>Members</strong> come back typed: numbers, <code>bigint</code> for 64-bit integers and pointers, strings for <code>char</code> arrays, nested arrays for C arrays, and <code>BlendStruct</code> for inline structs.</p>
      <CodeBlock code={MEMBERS} />
      <p>Member names are the names stored in the file, which can differ from Blender's Python names. <a href="/docs.html#05-sdna">05 SDNA</a> explains why.</p>
      <p><strong>Pointers</strong> are saved addresses. Follow them to the struct they point at:</p>
      <CodeBlock code={POINTERS} />
      <p><strong>Mesh vertex positions</strong> hide the version differences:</p>
      <CodeBlock code={MESH_POSITIONS} />
      <p><strong>Scenes and geometry</strong> for 3D viewers: the objects a scene shows, with world matrices computed the way Blender does, and mesh faces as triangles. <a href="/docs.html#09-scenes-and-geometry">09 Scenes and geometry</a> lists where each value lives.</p>
      <CodeBlock code={SCENES} />
      <p>Modifiers, constraints and animation are not evaluated; the file stores the mesh before modifiers.</p>
      <p><strong>File info</strong> without struct decoding:</p>
      <CodeBlock code={FILE_INFO} />
    </>
  );
}
