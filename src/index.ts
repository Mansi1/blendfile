// High-level API: open a file, navigate datablocks and pointers.
export { BlendFile, parseBlendFile } from "./api/blend-file.ts";
export { BlendStruct, type BlendValue } from "./api/blend-struct.ts";
export {
  type MeshGeometry,
  type MeshTriangles,
  type MeshUvMap,
  listMeshUvMaps,
  readMeshAttribute,
  readMeshGeometry,
  readMeshUvMap,
  readMeshVertexPositions,
  triangulateMeshGeometry,
} from "./api/mesh.ts";
export {
  type CameraDescription,
  type LightDescription,
  type LightType,
  type MaterialAppearance,
  type MaterialTexture,
  type MaterialTextures,
  type SceneDescription,
  type SceneObject,
  type SceneObjectType,
  computeObjectWorldMatrix,
  readCamera,
  readLight,
  readMaterialAppearance,
  readObjectMaterials,
  readScene,
} from "./api/scene.ts";

// Core format functions: each decodes one layer of the file from bytes.
export { readPointerArray, readPrimitiveArray, readStringPayload } from "./core/block-payloads.ts";
export { type AddressResolver, type Block, createAddressResolver, datablockIdCode, indexBlocksByAddress, isDatablockBlock, readBlockList } from "./core/blocks.ts";
export { type CompressionMethod, decompressFileBytes, detectCompressionMethod } from "./core/compression.ts";
export { BlendError, type BlendErrorCode } from "./core/errors.ts";
export { type BlockHeaderLayout, type FileHeader, decodeFileHeader } from "./core/header.ts";
export { type MemberValue, nestByArrayDimensions, readMemberValue } from "./core/members.ts";
export { decodeNulTerminatedString, isPrimitiveType, readPointerValue, readPrimitiveValue } from "./core/primitives.ts";
export { type ReadContext, createReadContext } from "./core/read-context.ts";
export { type Sdna, type SdnaMember, type SdnaStruct, decodeSdna, parseMemberDeclarator } from "./core/sdna.ts";
export { type RenderInfo, type Thumbnail, readRenderInfo, readThumbnail } from "./core/special-blocks.ts";
export {
  type Matrix4,
  type ObjectTransformMembers,
  axisAngleToMatrix3,
  composeObjectLocalMatrix,
  createIdentityMatrix,
  eulerToMatrix3,
  matrixFromNestedColumns,
  multiplyMatrices,
  quaternionToMatrix3,
} from "./core/transforms.ts";
export { triangulatePolygon, triangulatePolygonCorners } from "./core/triangulate.ts";
