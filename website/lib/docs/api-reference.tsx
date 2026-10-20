// Every runtime export of the library with one line each. test/website-contract.test.ts checks that this file names
// all of them, so a new export cannot go undocumented.
import { ReferenceTable } from "../parts/reference-table.tsx";

const HIGH_LEVEL_API: [string, string][] = [
  ["`parseBlendFile(bytes)`", "decompress and open a file; returns `BlendFile`"],
  ["`BlendFile`", "`header`, `blocks`, `sdna`, `compressionMethod`, `blenderVersion`, `listDatablocks(idCode?)`, `findDatablock(idCode, name)`, `findBlockByAddress(address, referencingOffset?)`, `structTypeOfBlock(block)`, `readStructsInBlock(block, structType?)`, `resolvePointer(address, structTypeName?, referencingOffset?)`, `readPointerArrayAt(address, referencingOffset?)`, `readPrimitiveArrayAt(address, typeName, referencingOffset?)`, `readStringAt(address, referencingOffset?)`, `readRenderInfo()`, `readThumbnail()`. Pass `referencingOffset` (the file offset of the struct holding the pointer) for data pointers in Blender 5.x files, or use `BlendStruct`'s methods, which do it"],
  ["`BlendStruct`", "`structType`, `offset`, `memberNames`, `datablockName`, `readMember(path)`, `readPointer(path)`, `followPointer(path, structTypeName?)`, `followPointerToArray(path, structTypeName?)`, `readPointerArray(path)`, `readPrimitiveArray(path, typeName)`, `readString(path)`, `readListBase(path)`, `toJSON(depth?)`"],
  ["`readMeshVertexPositions(mesh)`", "vertex positions of a `Mesh` as a `Float32Array`"],
  ["`readMeshGeometry(mesh)`", "`MeshGeometry`: positions, face offsets, corner vertices, material slot and smooth flag per face (Blender 3.6+ and older `mpoly`/`mloop`)"],
  ["`triangulateMeshGeometry(geometry)`", "`MeshTriangles`: three vertex indices per triangle, the face corner of each and the face each triangle came from"],
  ["`listMeshUvMaps(mesh)`", "names of the mesh's UV maps and the render UV map (what a Texture Coordinate node's UV output reads)"],
  ["`readMeshUvMap(mesh, name?)`", "`MeshUvMap`: u, v per face corner of the named or the render UV map; undefined without UV maps"],
  ["`readMeshAttribute(mesh, name, typeName, count)`", "values of a named mesh attribute or CustomData layer, e.g. `\"material_index\"`"],
  ["`readScene(file, sceneName?)`", "`SceneDescription`: the view layer's objects (`SceneObject`: type, world matrix, visibility, materials), scene camera, world color, resolution"],
  ["`computeObjectWorldMatrix(object)`", "an object's world matrix from loc/rot/scale, deltas, rotation mode and parents"],
  ["`readObjectMaterials(object)`", "material per slot, honoring object- versus data-linked slots"],
  ["`readMaterialAppearance(material)`", "`MaterialAppearance`: viewport color, metallic, roughness, unlinked Principled BSDF inputs, and `textures` (`MaterialTexture`: image path, packed bytes, color space, UV map, Mapping node) for Image Texture nodes feeding Base Color, Metallic, Roughness and, through a Normal Map node, Normal"],
  ["`readLight(lamp)`", "`LightDescription`: type, color, power, spot and area settings"],
  ["`readCamera(camera)`", "`CameraDescription`: projection, lens, sensor and fit, clipping, shift"],
  ["`BlendError`", "error with `code`: `NOT_BLEND`, `UNSUPPORTED` or `CORRUPT`"],
];

const CORE_FUNCTIONS: [string, string][] = [
  ["`detectCompressionMethod(bytes)`", "`\"none\"`, `\"gzip\"` or `\"zstd\"` from the magic bytes"],
  ["`decompressFileBytes(bytes)`", "`{ uncompressedBytes, compressionMethod }`"],
  ["`decodeFileHeader(bytes)`", "`FileHeader`: size, format version, pointer size, byte order, file version, block header layout"],
  ["`readBlockList(bytes, header)`", "every `Block` up to `ENDB`"],
  ["`createAddressResolver(blocks)`", "resolves a saved address the way Blender does: within the referencing datablock's `DATA` blocks first (Blender 5.x reuses addresses across datablocks)"],
  ["`indexBlocksByAddress(blocks)`", "map from saved address to block, first block wins"],
  ["`isDatablockBlock(block)`, `datablockIdCode(block)`", "datablock detection; ID code with screens mapped from `SN` to `SR`"],
  ["`decodeSdna(payload, littleEndian)`", "the `Sdna` catalog: names, types, sizes, structs with member offsets"],
  ["`parseMemberDeclarator(declarator)`", "split `*next`, `mat[4][4]`, `(*func)()` into name, pointer depth and array dimensions"],
  ["`createReadContext(bytes, header)`", "the `ReadContext` the value readers share"],
  ["`readPrimitiveValue`, `readPointerValue`, `isPrimitiveType`, `decodeNulTerminatedString`", "single values"],
  ["`readMemberValue`, `nestByArrayDimensions`", "one struct member, with C arrays as nested arrays"],
  ["`readPointerArray`, `readPrimitiveArray`, `readStringPayload`", "raw block payloads"],
  ["`readRenderInfo(context, blocks)`, `readThumbnail(context, blocks)`", "`REND` and `TEST` blocks"],
  ["`composeObjectLocalMatrix(members)`, `multiplyMatrices(left, right)`, `createIdentityMatrix()`, `matrixFromNestedColumns(columns)`", "column-major 4×4 `Matrix4` math in Blender's conventions"],
  ["`eulerToMatrix3(euler, rotationMode)`, `quaternionToMatrix3(quaternion)`, `axisAngleToMatrix3(axis, angle)`", "rotations as Blender computes them (XYZ order is Rz · Ry · Rx)"],
  ["`triangulatePolygon(positions, cornerVertices)`", "ear-clipping triangulation of one face, concave faces included"],
  ["`triangulatePolygonCorners(positions, cornerVertices)`", "the same triangles as positions within `cornerVertices`, to look up per-corner data such as UVs"],
];

export function ApiReference() {
  return (
    <>
      <h2 id="api-reference">API reference</h2>
      <h3>High-level API</h3>
      <ReferenceTable headings={["Export", "Description"]} rows={HIGH_LEVEL_API} />
      <h3>Core functions</h3>
      <p>Each decodes one layer and can be used on its own, for example to list blocks without decoding structs.</p>
      <ReferenceTable headings={["Export", "Description"]} rows={CORE_FUNCTIONS} />
    </>
  );
}
