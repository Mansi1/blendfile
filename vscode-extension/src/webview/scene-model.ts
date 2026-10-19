// Render-ready data for the 3D view, computed from a parsed file with the library. No DOM and no three.js,
// so the unit tests check it on the fixtures. Coordinates stay in Blender's Z-up space.
import {
  type BlendFile,
  type BlendStruct,
  type CameraDescription,
  type LightDescription,
  type Matrix4,
  type MaterialAppearance,
  type MaterialTexture,
  type SceneObject,
  readCamera,
  readLight,
  readMaterialAppearance,
  readMeshGeometry,
  readMeshUvMap,
  readScene,
  triangulateMeshGeometry,
} from "../../../src/index.ts";

export interface RenderMaterial {
  name: string;
  /** Solid mode: the material's viewport display color, linear RGB. */
  viewportColor: [number, number, number];
  /** Material preview and rendered modes: Principled BSDF values, else the viewport values. */
  baseColor: [number, number, number];
  opacity: number;
  metallic: number;
  roughness: number;
  emissive: [number, number, number];
  /** Image textures for material preview and rendered modes. */
  textures?: Partial<Record<TextureSlot, RenderTexture>>;
}

export type TextureSlot = "baseColor" | "metallic" | "roughness" | "normal";

/** One image texture as the 3D view applies it. */
export interface RenderTexture {
  /** Identifies the image file: the same key means the same decoded pixels. */
  key: string;
  imageName: string;
  /** Image.filepath as saved; "//" means relative to the .blend file. */
  filepath: string;
  packedBytes?: Uint8Array;
  /** sRGB images are color; everything else ("Non-Color", "Linear …") is data. */
  isColor: boolean;
  /** UV map name, undefined for the mesh's render UV map. */
  uvMap?: string;
  /** Row-major 3×3 matrix from mesh UV to image UV: Blender's Mapping node (point type) in 2D. */
  uvTransform: number[];
  /** Normal Map strength. */
  strength?: number;
}

interface RenderItem {
  objectName: string;
  worldMatrix: Matrix4;
  visible: boolean;
}

export interface RenderMesh extends RenderItem {
  meshName: string;
  /** Triangle corners in object space, three per triangle, grouped by material slot. */
  positions: Float32Array;
  normals: Float32Array;
  /** UV maps per triangle corner (two floats each): the render UV map first, then maps that textures name. Empty without UVs. */
  uvChannels: { name: string; uvs: Float32Array }[];
  /** Ranges of `positions` (in vertices) drawn with `materials[materialSlot]`. */
  groups: { start: number; count: number; materialSlot: number }[];
  materials: RenderMaterial[];
  /** Face boundary edges in object space, two points per edge: what Blender's wireframe shows. */
  edgePositions: Float32Array;
  vertexCount: number;
  faceCount: number;
  triangleCount: number;
  modifierNames: string[];
}

export interface RenderLight extends RenderItem {
  light: LightDescription;
}

export interface RenderCamera extends RenderItem {
  camera: CameraDescription;
  isSceneCamera: boolean;
  /** Camera.drawsize: how large Blender draws the camera in the viewport. */
  displaySize: number;
}

export interface RenderEmpty extends RenderItem {
  displaySize: number;
}

export interface RenderScene {
  sceneName: string;
  meshes: RenderMesh[];
  lights: RenderLight[];
  cameras: RenderCamera[];
  empties: RenderEmpty[];
  /** Objects the view cannot draw from saved data, e.g. curves, text, armatures (evaluated geometry is not saved). */
  skippedObjects: { objectName: string; reason: string }[];
  worldColor: [number, number, number];
  resolution: [number, number];
  /** World-space box around everything visible; undefined for an empty scene. */
  bounds?: { min: [number, number, number]; max: [number, number, number] };
}

/** Blender's default material (no material in a slot): light grey. */
const DEFAULT_MATERIAL: RenderMaterial = { name: "(default)", viewportColor: [0.8, 0.8, 0.8], baseColor: [0.8, 0.8, 0.8], opacity: 1, metallic: 0, roughness: 0.5, emissive: [0, 0, 0] };
const OBJECT_TYPE_LABELS: Record<number, string> = {
  2: "curve", 3: "surface", 4: "text", 5: "metaball", 12: "speaker", 13: "light probe", 22: "lattice", 25: "armature",
  26: "grease pencil", 27: "hair curves", 28: "point cloud", 29: "volume", 30: "grease pencil",
};

/** Blender's Mapping node (point type) restricted to UV space: rotate(scale ⊙ uv) about Z, then translate. */
export function mappingToUvTransform(mapping: MaterialTexture["mapping"]): number[] {
  if (!mapping) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const [scaleU, scaleV] = mapping.scale;
  const cosine = Math.cos(mapping.rotation[2]);
  const sine = Math.sin(mapping.rotation[2]);
  return [cosine * scaleU, -sine * scaleV, mapping.location[0], sine * scaleU, cosine * scaleV, mapping.location[1], 0, 0, 1];
}

export function toRenderTexture(texture: MaterialTexture & { strength?: number }): RenderTexture {
  return {
    key: texture.packedBytes ? `packed:${texture.imageName}` : `file:${texture.filepath}`,
    imageName: texture.imageName,
    filepath: texture.filepath,
    packedBytes: texture.packedBytes,
    isColor: texture.colorSpace === "sRGB",
    uvMap: texture.uvMap,
    uvTransform: mappingToUvTransform(texture.mapping),
    strength: texture.strength,
  };
}

export function toRenderMaterial(appearance: MaterialAppearance): RenderMaterial {
  const rgb = (color: readonly number[]) => [color[0]!, color[1]!, color[2]!] as [number, number, number];
  const principled = appearance.principled;
  const emissionStrength = principled?.emissionStrength ?? 0;
  const textures = appearance.textures
    ? Object.fromEntries(Object.entries(appearance.textures).map(([slot, texture]) => [slot, toRenderTexture(texture)]))
    : undefined;
  return {
    ...(textures ? { textures } : {}),
    name: appearance.name,
    viewportColor: rgb(appearance.viewportColor),
    baseColor: rgb(principled?.baseColor ?? appearance.viewportColor),
    opacity: principled?.alpha ?? appearance.viewportColor[3],
    metallic: principled?.metallic ?? appearance.metallic,
    roughness: principled?.roughness ?? appearance.roughness,
    emissive: rgb((principled?.emissionColor ?? [0, 0, 0]).map((channel) => channel * emissionStrength)),
  };
}

/**
 * Triangles with flat normals for flat faces and averaged normals for smooth ones, sorted by material slot.
 * UVs come from the render UV map plus each map in `extraUvMapNames` the mesh has.
 */
export function buildMeshTriangles(meshStruct: BlendStruct, extraUvMapNames: string[] = []) {
  const geometry = readMeshGeometry(meshStruct);
  const { positions, faceOffsets, cornerVertices, faceSmooth, faceMaterialIndices } = geometry;
  const faceCount = faceOffsets.length - 1;
  const vertexCount = positions.length / 3;

  // Face normals (Newell's method works for n-gons), and area-weighted vertex normals for smooth faces.
  const faceNormals = new Float32Array(faceCount * 3);
  const vertexNormals = new Float32Array(vertexCount * 3);
  for (let face = 0; face < faceCount; face += 1) {
    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;
    const start = faceOffsets[face]!;
    const end = faceOffsets[face + 1]!;
    for (let corner = start; corner < end; corner += 1) {
      const current = cornerVertices[corner]! * 3;
      const next = cornerVertices[corner + 1 < end ? corner + 1 : start]! * 3;
      normalX += (positions[current + 1]! - positions[next + 1]!) * (positions[current + 2]! + positions[next + 2]!);
      normalY += (positions[current + 2]! - positions[next + 2]!) * (positions[current]! + positions[next]!);
      normalZ += (positions[current]! - positions[next]!) * (positions[current + 1]! + positions[next + 1]!);
    }
    for (let corner = start; corner < end; corner += 1) {
      const vertex = cornerVertices[corner]! * 3;
      vertexNormals[vertex] = vertexNormals[vertex]! + normalX;
      vertexNormals[vertex + 1] = vertexNormals[vertex + 1]! + normalY;
      vertexNormals[vertex + 2] = vertexNormals[vertex + 2]! + normalZ;
    }
    const length = Math.hypot(normalX, normalY, normalZ) || 1;
    faceNormals.set([normalX / length, normalY / length, normalZ / length], face * 3);
  }
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const length = Math.hypot(vertexNormals[offset]!, vertexNormals[offset + 1]!, vertexNormals[offset + 2]!) || 1;
    for (let axis = 0; axis < 3; axis += 1) vertexNormals[offset + axis]! /= length;
  }

  const triangles = triangulateMeshGeometry(geometry);
  const triangleCount = triangles.faceIndices.length;
  const triangleOrder = Array.from({ length: triangleCount }, (_, index) => index).sort(
    (left, right) => faceMaterialIndices[triangles.faceIndices[left]!]! - faceMaterialIndices[triangles.faceIndices[right]!]! || left - right,
  );
  const renderUvMap = readMeshUvMap(meshStruct);
  const uvMaps = renderUvMap ? [renderUvMap] : [];
  for (const name of extraUvMapNames) {
    if (uvMaps.some((uvMap) => uvMap.name === name)) continue;
    const uvMap = readMeshUvMap(meshStruct, name);
    if (uvMap?.name === name) uvMaps.push(uvMap);
  }
  const uvChannels = uvMaps.map(({ name }) => ({ name, uvs: new Float32Array(triangleCount * 6) }));
  const trianglePositions = new Float32Array(triangleCount * 9);
  const triangleNormals = new Float32Array(triangleCount * 9);
  const groups: RenderMesh["groups"] = [];
  triangleOrder.forEach((triangle, outputIndex) => {
    const face = triangles.faceIndices[triangle]!;
    const materialSlot = faceMaterialIndices[face]!;
    const lastGroup = groups.at(-1);
    if (lastGroup?.materialSlot === materialSlot) lastGroup.count += 3;
    else groups.push({ start: outputIndex * 3, count: 3, materialSlot });
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = triangles.vertexIndices[triangle * 3 + corner]!;
      const meshCorner = triangles.cornerIndices[triangle * 3 + corner]!;
      uvMaps.forEach((uvMap, channel) => uvChannels[channel]!.uvs.set(uvMap.uvs.subarray(meshCorner * 2, meshCorner * 2 + 2), outputIndex * 6 + corner * 2));
      const target = outputIndex * 9 + corner * 3;
      trianglePositions.set(positions.subarray(vertex * 3, vertex * 3 + 3), target);
      triangleNormals.set(faceSmooth[face] ? vertexNormals.subarray(vertex * 3, vertex * 3 + 3) : faceNormals.subarray(face * 3, face * 3 + 3), target);
    }
  });

  // Each face boundary edge once, even when two faces share it.
  const seenEdges = new Set<number>();
  const edgeCoordinates: number[] = [];
  for (let face = 0; face < faceCount; face += 1) {
    const start = faceOffsets[face]!;
    const end = faceOffsets[face + 1]!;
    for (let corner = start; corner < end; corner += 1) {
      const from = cornerVertices[corner]!;
      const to = cornerVertices[corner + 1 < end ? corner + 1 : start]!;
      const key = Math.min(from, to) * vertexCount + Math.max(from, to);
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edgeCoordinates.push(...positions.subarray(from * 3, from * 3 + 3), ...positions.subarray(to * 3, to * 3 + 3));
    }
  }

  return { positions: trianglePositions, normals: triangleNormals, uvChannels, groups, edgePositions: Float32Array.from(edgeCoordinates), vertexCount, faceCount, triangleCount };
}

function transformPoint(matrix: Matrix4, x: number, y: number, z: number): [number, number, number] {
  return [0, 1, 2].map((row) => matrix[row]! * x + matrix[4 + row]! * y + matrix[8 + row]! * z + matrix[12 + row]!) as [number, number, number];
}

/** Everything the 3D view draws for the file's first scene (or `sceneName`). */
export function buildRenderScene(file: BlendFile, sceneName?: string): RenderScene {
  const scene = readScene(file, sceneName);
  const materialCache = new Map<number, RenderMaterial>();
  const renderMaterialOf = (material: SceneObject["materials"][number]) => {
    if (!material) return DEFAULT_MATERIAL;
    const cached = materialCache.get(material.offset) ?? toRenderMaterial(readMaterialAppearance(material));
    materialCache.set(material.offset, cached);
    return cached;
  };
  const meshTriangleCache = new Map<string, ReturnType<typeof buildMeshTriangles>>();
  const result: RenderScene = {
    sceneName: scene.name,
    meshes: [],
    lights: [],
    cameras: [],
    empties: [],
    skippedObjects: [],
    worldColor: scene.worldColor ?? [0.05, 0.05, 0.05],
    resolution: scene.resolution,
  };

  for (const object of scene.objects) {
    const item = { objectName: object.name, worldMatrix: object.worldMatrix, visible: object.visible };
    try {
      if (object.type === "mesh" && object.data) {
        const materials = object.materials.map(renderMaterialOf);
        const extraUvMapNames = [...new Set(materials.flatMap((material) => Object.values(material.textures ?? {}).flatMap((texture) => (texture.uvMap ? [texture.uvMap] : []))))].sort();
        const cacheKey = `${object.data.offset}:${extraUvMapNames.join("\u0000")}`;
        const triangles = meshTriangleCache.get(cacheKey) ?? buildMeshTriangles(object.data, extraUvMapNames);
        meshTriangleCache.set(cacheKey, triangles);
        // Each modifier block is its own type (SubsurfModifierData, …) that starts with a ModifierData named "modifier".
        const modifierNames = object.object.readListBase("modifiers").map((modifier) => String(modifier.readMember(modifier.structType.findMember("name") ? "name" : "modifier.name")));
        result.meshes.push({ ...item, ...triangles, meshName: object.data.datablockName ?? "", materials, modifierNames });
      } else if (object.type === "light" && object.data) result.lights.push({ ...item, light: readLight(object.data) });
      else if (object.type === "camera" && object.data) {
        result.cameras.push({ ...item, camera: readCamera(object.data), isSceneCamera: object.name === scene.cameraName, displaySize: object.data.readMember("drawsize") as number });
      } else if (object.type === "empty") result.empties.push({ ...item, displaySize: object.object.readMember("empty_drawsize") as number });
      else result.skippedObjects.push({ objectName: object.name, reason: `${OBJECT_TYPE_LABELS[object.typeCode] ?? `type ${object.typeCode}`} objects are not drawn` });
    } catch (error) {
      result.skippedObjects.push({ objectName: object.name, reason: (error as Error).message });
    }
  }

  const points: [number, number, number][] = [];
  for (const mesh of result.meshes.filter((candidate) => candidate.visible && candidate.positions.length > 0)) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < mesh.positions.length; index += 1) {
      min[index % 3] = Math.min(min[index % 3]!, mesh.positions[index]!);
      max[index % 3] = Math.max(max[index % 3]!, mesh.positions[index]!);
    }
    for (const x of [min[0]!, max[0]!]) for (const y of [min[1]!, max[1]!]) for (const z of [min[2]!, max[2]!]) points.push(transformPoint(mesh.worldMatrix, x, y, z));
  }
  for (const item of [...result.lights, ...result.cameras, ...result.empties].filter((candidate) => candidate.visible)) points.push(transformPoint(item.worldMatrix, 0, 0, 0));
  if (points.length > 0) {
    result.bounds = {
      min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]!))) as [number, number, number],
      max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]!))) as [number, number, number],
    };
  }
  return result;
}
