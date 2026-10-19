import { BlendError } from "../core/errors.ts";
import { triangulatePolygonCorners } from "../core/triangulate.ts";
import type { BlendStruct } from "./blend-struct.ts";

/**
 * Vertex positions of a `Mesh` struct as flat xyz floats.
 * Blender 5.x stores them in `attribute_storage` ("position" attribute), 3.4 to 4.x in the
 * `vdata` CustomData layer named "position"; older files use the legacy `mvert` array.
 */
export function readMeshVertexPositions(mesh: BlendStruct): Float32Array {
  if (mesh.structType.name !== "Mesh") throw new BlendError("UNSUPPORTED", `expected Mesh, got ${mesh.structType.name}`);
  const vertexCount = mesh.readMember("totvert") as number;
  const toPositions = (coordinates: number[]) => Float32Array.from(coordinates.slice(0, vertexCount * 3));

  if (mesh.structType.findMember("attribute_storage")) {
    const attributeStorage = mesh.readMember("attribute_storage") as BlendStruct;
    for (const attribute of attributeStorage.followPointerToArray("dna_attributes", "Attribute")) {
      if (attribute.readString("name") !== "position") continue;
      const attributeArray = attribute.followPointer("data", "AttributeArray");
      if (attributeArray) return toPositions(attributeArray.readPrimitiveArray("data", "float") as number[]);
    }
  }
  const vertexData = mesh.readMember("vdata") as BlendStruct;
  for (const layer of vertexData.followPointerToArray("layers", "CustomDataLayer")) {
    if (layer.readMember("name") !== "position") continue;
    return toPositions(layer.readPrimitiveArray("data", "float") as number[]);
  }
  if (mesh.structType.findMember("mvert")) {
    return toPositions(mesh.followPointerToArray("mvert").flatMap((vertex) => vertex.readMember("co") as number[]));
  }
  return new Float32Array(0);
}

/** Faces of a mesh, the way Blender 3.6+ stores them: offsets into a corner array. */
export interface MeshGeometry {
  /** xyz per vertex. */
  positions: Float32Array;
  /** faceCount + 1 entries; face `i` uses corners `faceOffsets[i]` up to `faceOffsets[i + 1]`. */
  faceOffsets: Uint32Array;
  /** Vertex index of every face corner. */
  cornerVertices: Uint32Array;
  /** Material slot per face. */
  faceMaterialIndices: Uint32Array;
  /** 1 where the face is shaded smooth, 0 where flat. */
  faceSmooth: Uint8Array;
}

/** Triangles of a mesh: three vertex indices each, the face corners they came from, and the face of every triangle. */
export interface MeshTriangles {
  vertexIndices: Uint32Array;
  /** Index into the mesh's corner arrays (`cornerVertices`, UV maps) for each entry of `vertexIndices`. */
  cornerIndices: Uint32Array;
  faceIndices: Uint32Array;
}

/**
 * Values of a named mesh attribute as primitives of `typeName`, or undefined when the mesh has none.
 * A single-value attribute (Blender 5.x stores constant attributes once) is repeated `elementCount` times.
 */
export function readMeshAttribute(mesh: BlendStruct, attributeName: string, typeName: string, elementCount: number): number[] | undefined {
  const expand = (values: number[], componentCount: number) =>
    values.length === componentCount && elementCount > 1 ? Array.from({ length: elementCount * componentCount }, (_, index) => values[index % componentCount]!) : values;

  if (mesh.structType.findMember("attribute_storage")) {
    const attributeStorage = mesh.readMember("attribute_storage") as BlendStruct;
    for (const attribute of attributeStorage.followPointerToArray("dna_attributes", "Attribute")) {
      if (attribute.readString("name") !== attributeName) continue;
      const storage = attribute.followPointer("data");
      if (!storage) return undefined;
      const values = storage.readPrimitiveArray("data", typeName) as number[];
      const isSingle = storage.structType.name === "AttributeSingle" || (storage.structType.findMember("is_single") && storage.readMember("is_single") !== 0);
      return isSingle ? expand(values, values.length) : values;
    }
  }
  for (const customDataName of ["vdata", "edata", "pdata", "ldata"]) {
    const customData = mesh.readMember(customDataName) as BlendStruct;
    for (const layer of customData.followPointerToArray("layers", "CustomDataLayer")) {
      if (layer.readMember("name") === attributeName) return layer.readPrimitiveArray("data", typeName) as number[];
    }
  }
  return undefined;
}

/**
 * Faces of a `Mesh`: corner offsets, corner vertices, material slot and smooth flag per face.
 * Reads Blender 3.6+ (`poly_offset_indices`, `.corner_vert`, `material_index`, `sharp_face`) and the
 * older `mpoly`/`mloop` arrays. Modifiers are not applied: files store the mesh before modifiers.
 */
export function readMeshGeometry(mesh: BlendStruct): MeshGeometry {
  const positions = readMeshVertexPositions(mesh);
  const faceCount = mesh.readMember("totpoly") as number;
  const cornerCount = mesh.readMember("totloop") as number;
  const offsetsAddress = mesh.structType.findMember("poly_offset_indices") ? mesh.readPointer("poly_offset_indices") : 0n;
  const legacyFaces = offsetsAddress === 0n && mesh.structType.findMember("mpoly") ? mesh.followPointerToArray("mpoly") : [];

  let faceOffsets: Uint32Array;
  if (offsetsAddress !== 0n) faceOffsets = Uint32Array.from((mesh.readPrimitiveArray("poly_offset_indices", "int") as number[]).slice(0, faceCount + 1));
  else if (legacyFaces.length > 0) faceOffsets = Uint32Array.from([...legacyFaces.map((face) => face.readMember("loopstart") as number), cornerCount]);
  else faceOffsets = new Uint32Array(faceCount > 0 ? 0 : 1);
  if (faceOffsets.length !== faceCount + 1) throw new BlendError("CORRUPT", `mesh has ${faceCount} faces but ${faceOffsets.length} face offsets`);

  const cornerVertexValues =
    readMeshAttribute(mesh, ".corner_vert", "int", cornerCount) ??
    (mesh.structType.findMember("mloop") ? mesh.followPointerToArray("mloop").map((corner) => corner.readMember("v") as number) : []);
  const cornerVertices = Uint32Array.from(cornerVertexValues.slice(0, cornerCount));
  if (cornerVertices.length !== cornerCount) throw new BlendError("CORRUPT", `mesh has ${cornerCount} corners but ${cornerVertices.length} corner vertices`);
  const vertexCount = positions.length / 3;
  if (cornerVertices.some((vertex) => vertex >= vertexCount)) throw new BlendError("CORRUPT", "mesh corner refers to a vertex past the end");

  const materialIndexValues =
    readMeshAttribute(mesh, "material_index", "int", faceCount) ?? legacyFaces.map((face) => face.readMember("mat_nr") as number);
  const faceMaterialIndices = new Uint32Array(faceCount);
  faceMaterialIndices.set(materialIndexValues.slice(0, faceCount).map((index) => Math.max(0, index)));

  // Blender 4.0+: a missing "sharp_face" attribute means every face is smooth. Older files keep ME_SMOOTH in MPoly.flag.
  const sharpFaceValues = readMeshAttribute(mesh, "sharp_face", "char", faceCount);
  const faceSmooth = new Uint8Array(faceCount);
  if (sharpFaceValues) faceSmooth.set(sharpFaceValues.slice(0, faceCount).map((sharp) => (sharp ? 0 : 1)));
  else if (legacyFaces.length > 0) faceSmooth.set(legacyFaces.map((face) => ((face.readMember("flag") as number) & 1 ? 1 : 0)));
  else faceSmooth.fill(1);

  return { positions, faceOffsets, cornerVertices, faceMaterialIndices, faceSmooth };
}

/** Splits every face into triangles (concave n-gons included); a face with n corners gives n − 2 triangles. */
export function triangulateMeshGeometry(geometry: MeshGeometry): MeshTriangles {
  const vertexIndices: number[] = [];
  const cornerIndices: number[] = [];
  const faceIndices: number[] = [];
  for (let face = 0; face + 1 < geometry.faceOffsets.length; face += 1) {
    const firstCorner = geometry.faceOffsets[face]!;
    const corners = geometry.cornerVertices.subarray(firstCorner, geometry.faceOffsets[face + 1]);
    for (const corner of triangulatePolygonCorners(geometry.positions, corners)) {
      vertexIndices.push(corners[corner]!);
      cornerIndices.push(firstCorner + corner);
    }
    for (let triangle = 0; triangle < (corners.length >= 3 ? corners.length - 2 : 0); triangle += 1) faceIndices.push(face);
  }
  return { vertexIndices: Uint32Array.from(vertexIndices), cornerIndices: Uint32Array.from(cornerIndices), faceIndices: Uint32Array.from(faceIndices) };
}

// UV map storage: CD_PROP_FLOAT2 corner layers (Blender 3.5 to 4.x), CD_MLOOPUV with MLoopUV structs (older),
// and in 5.x float2 attributes on the corner domain (AttrType::Float2 = 6, AttrDomain::Corner = 3).
const CD_MLOOPUV = 16;
const CD_PROP_FLOAT2 = 49;
const ATTRIBUTE_FLOAT2 = 6;
const ATTRIBUTE_DOMAIN_CORNER = 3;

/** A UV map: u, v per face corner. */
export interface MeshUvMap {
  name: string;
  uvs: Float32Array;
}

/** Names of the mesh's UV maps and the one renders use by default (what a Texture Coordinate node's UV output reads). */
export function listMeshUvMaps(mesh: BlendStruct): { names: string[]; renderName?: string } {
  if (mesh.structType.findMember("attribute_storage")) {
    const attributeStorage = mesh.readMember("attribute_storage") as BlendStruct;
    const names = attributeStorage
      .followPointerToArray("dna_attributes", "Attribute")
      .filter((attribute) => attribute.readMember("data_type") === ATTRIBUTE_FLOAT2 && attribute.readMember("domain") === ATTRIBUTE_DOMAIN_CORNER)
      .map((attribute) => attribute.readString("name") ?? "")
      .filter((name) => name !== "" && !name.startsWith("."));
    if (names.length > 0) {
      const defaultName = mesh.structType.findMember("default_uv_map_attribute") ? mesh.readString("default_uv_map_attribute") : undefined;
      return { names, renderName: defaultName && names.includes(defaultName) ? defaultName : names[0] };
    }
  }
  const cornerData = mesh.readMember("ldata") as BlendStruct;
  const uvLayers = cornerData
    .followPointerToArray("layers", "CustomDataLayer")
    .filter((layer) => [CD_PROP_FLOAT2, CD_MLOOPUV].includes(layer.readMember("type") as number) && !String(layer.readMember("name")).startsWith("."));
  // CustomDataLayer.active_rnd counts from the first layer of the same type.
  const renderIndex = uvLayers[0] ? (uvLayers[0].readMember("active_rnd") as number) : 0;
  const names = uvLayers.map((layer) => layer.readMember("name") as string);
  return { names, renderName: names[renderIndex] ?? names[0] };
}

/** Corner UVs of the named UV map, or of the render UV map when the name is missing or unknown; undefined without UV maps. */
export function readMeshUvMap(mesh: BlendStruct, uvMapName?: string): MeshUvMap | undefined {
  const { names, renderName } = listMeshUvMaps(mesh);
  const name = uvMapName !== undefined && names.includes(uvMapName) ? uvMapName : renderName;
  if (name === undefined) return undefined;
  const cornerCount = mesh.readMember("totloop") as number;
  const legacyLayer = (mesh.readMember("ldata") as BlendStruct)
    .followPointerToArray("layers", "CustomDataLayer")
    .find((layer) => layer.readMember("type") === CD_MLOOPUV && layer.readMember("name") === name);
  const values = legacyLayer
    ? legacyLayer.followPointerToArray("data", "MLoopUV").flatMap((corner) => corner.readMember("uv") as number[])
    : readMeshAttribute(mesh, name, "float", cornerCount);
  if (!values || values.length < cornerCount * 2) throw new BlendError("CORRUPT", `UV map '${name}' has ${values?.length ?? 0} values for ${cornerCount} corners`);
  return { name, uvs: Float32Array.from(values.slice(0, cornerCount * 2) as number[]) };
}
