// What a 3D viewer needs from a scene: objects with world matrices and visibility, materials, lights,
// cameras and the world color. Values come from the file as saved; modifiers, constraints and drivers are not evaluated.
import { BlendError } from "../core/errors.ts";
import { type Matrix4, type ObjectTransformMembers, composeObjectLocalMatrix, matrixFromNestedColumns, multiplyMatrices } from "../core/transforms.ts";
import type { BlendFile } from "./blend-file.ts";
import type { BlendStruct } from "./blend-struct.ts";

/** Object.type values (DNA_object_types.h). */
const OBJECT_TYPE_NAMES: Record<number, SceneObjectType> = { 0: "empty", 1: "mesh", 10: "light", 11: "camera" };
export type SceneObjectType = "empty" | "mesh" | "light" | "camera" | "other";

// Visibility flags: Object.visibility_flag (stored as "restrictflag"), Base.flag, Collection.flag, LayerCollection.flag.
const OBJECT_HIDE_VIEWPORT = 1 << 0;
const BASE_HIDDEN = 1 << 8;
const COLLECTION_HIDE_VIEWPORT = 1 << 0;
const LAYER_COLLECTION_EXCLUDE = 1 << 4;
const LAYER_COLLECTION_HIDE = 1 << 7;

export interface SceneObject {
  name: string;
  type: SceneObjectType;
  /** Object.type as stored, for types the viewer does not draw (curves, text, armatures, …). */
  typeCode: number;
  object: BlendStruct;
  /** Object.data: Mesh, Lamp, Camera, … or undefined for empties. */
  data?: BlendStruct;
  parentName?: string;
  /** Column-major 4×4, Blender's object-to-world matrix computed from the saved transforms and parents. */
  worldMatrix: Matrix4;
  /** What Blender's viewport shows: not hidden by object, eye icon, collection or view layer. */
  visible: boolean;
  /** Material per slot, honoring per-slot object/data links; undefined for an empty slot. */
  materials: (BlendStruct | undefined)[];
}

export interface SceneDescription {
  name: string;
  objects: SceneObject[];
  /** Name of the scene's active camera object. */
  cameraName?: string;
  /** World color (World.horr/horg/horb), linear RGB. */
  worldColor?: [number, number, number];
  resolution: [number, number];
}

export interface MaterialAppearance {
  name: string;
  /** Viewport display color, what Blender's solid mode shows. Linear RGBA. */
  viewportColor: [number, number, number, number];
  metallic: number;
  roughness: number;
  /** Unlinked inputs of the first Principled BSDF node, what material preview and renders start from. */
  principled?: { baseColor: [number, number, number, number]; metallic: number; roughness: number; alpha: number; emissionColor?: [number, number, number, number]; emissionStrength: number };
  /** Image Texture nodes linked into the Principled BSDF, directly or through reroutes (and a Normal Map node for Normal). */
  textures?: MaterialTextures;
}

/** An Image Texture node's image and how it is mapped onto the mesh. */
export interface MaterialTexture {
  /** Image datablock name. */
  imageName: string;
  /** Image.filepath as saved; a leading "//" means relative to the .blend file's folder. */
  filepath: string;
  /** The image file's bytes when it is packed into the .blend file. */
  packedBytes?: Uint8Array;
  /** Image color space, e.g. "sRGB" or "Non-Color". */
  colorSpace: string;
  /** UV map named by a UV Map node in front of the texture; undefined means the mesh's render UV map. */
  uvMap?: string;
  /** Unlinked inputs of a Mapping node in front of the texture: location, XYZ Euler rotation in radians, scale. */
  mapping?: { location: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] };
}

export interface MaterialTextures {
  baseColor?: MaterialTexture;
  metallic?: MaterialTexture;
  roughness?: MaterialTexture;
  /** A tangent-space Normal Map node's image and its Strength. */
  normal?: MaterialTexture & { strength: number };
}

export type LightType = "point" | "sun" | "spot" | "area";
export interface LightDescription {
  name: string;
  type: LightType;
  /** Linear RGB. */
  color: [number, number, number];
  /** Watts for point, spot and area; W/m² (irradiance) for sun. Includes Blender 5's exposure factor. */
  power: number;
  /** Full cone angle in radians and the soft edge 0..1 (spot only). */
  spotSize: number;
  spotBlend: number;
  /** Area size in meters; width and height for rectangles and ellipses. */
  areaSize: [number, number];
  areaShape: "square" | "rectangle" | "disk" | "ellipse";
  radius: number;
}

export interface CameraDescription {
  name: string;
  projection: "perspective" | "orthographic" | "panoramic";
  /** Focal length in millimeters. */
  lens: number;
  sensorWidth: number;
  sensorHeight: number;
  sensorFit: "auto" | "horizontal" | "vertical";
  orthoScale: number;
  clipStart: number;
  clipEnd: number;
  shift: [number, number];
}

const LIGHT_TYPES: Record<number, LightType> = { 0: "point", 1: "sun", 2: "spot", 4: "area" };
const AREA_SHAPES: Record<number, LightDescription["areaShape"]> = { 0: "square", 1: "rectangle", 4: "disk", 5: "ellipse" };
const vector = (struct: BlendStruct, member: string) => struct.readMember(member) as number[];

function readTransformMembers(object: BlendStruct): ObjectTransformMembers {
  const readVector3 = (member: string) => vector(object, member) as unknown as ObjectTransformMembers["loc"];
  const readQuaternion = (member: string) => vector(object, member) as unknown as ObjectTransformMembers["quat"];
  return {
    loc: readVector3("loc"), dloc: readVector3("dloc"), size: readVector3("size"), dscale: readVector3("dscale"),
    rotmode: object.readMember("rotmode") as number, rot: readVector3("rot"), drot: readVector3("drot"),
    quat: readQuaternion("quat"), dquat: readQuaternion("dquat"),
    rotAxis: readVector3("rotAxis"), rotAngle: object.readMember("rotAngle") as number,
    drotAxis: readVector3("drotAxis"), drotAngle: object.readMember("drotAngle") as number,
  };
}

/**
 * Object-to-world matrix: parent world · parentinv · local (solve_parenting in Blender).
 * Every parent type is treated as object parenting; bone and vertex parents need evaluated data the file lacks.
 */
export function computeObjectWorldMatrix(object: BlendStruct, visiting = new Set<number>()): Matrix4 {
  const local = composeObjectLocalMatrix(readTransformMembers(object));
  const parent = object.followPointer("parent");
  if (!parent || visiting.has(parent.offset)) return local;
  visiting.add(object.offset);
  const parentWorld = computeObjectWorldMatrix(parent, visiting);
  const parentInverse = matrixFromNestedColumns(object.readMember("parentinv") as number[][]);
  return multiplyMatrices(multiplyMatrices(parentWorld, parentInverse), local);
}

/** Material slots of an object: Object.matbits[i] picks the object's own material over the data's. */
export function readObjectMaterials(object: BlendStruct): (BlendStruct | undefined)[] {
  const data = object.followPointer("data");
  const slotCount = Math.max(object.readMember("totcol") as number, data?.structType.findMember("totcol") ? (data.readMember("totcol") as number) : 0);
  const pointerArray = (owner: BlendStruct | undefined) => (owner?.structType.findMember("mat") ? owner.readPointerArray("mat") : []);
  const objectMaterials = pointerArray(object);
  const dataMaterials = pointerArray(data);
  const linkToObject = object.readPrimitiveArray("matbits", "char") as number[];
  return Array.from({ length: slotCount }, (_, slot) => {
    const address = linkToObject[slot] ? objectMaterials[slot] : dataMaterials[slot];
    // Material pointers point at datablocks, which resolve file-wide.
    return address ? object.file.resolvePointer(address, "Material")[0] : undefined;
  });
}

/** The scene by name (default: the first scene) as the objects its first view layer shows. */
export function readScene(file: BlendFile, sceneName?: string): SceneDescription {
  const scene = sceneName === undefined ? file.listDatablocks("SC")[0] : file.findDatablock("SC", sceneName);
  if (!scene) throw new BlendError("UNSUPPORTED", sceneName === undefined ? "the file has no scene" : `no scene named '${sceneName}'`);
  const viewLayer = scene.readListBase("view_layers")[0];
  const baseFlags = new Map<number, number>();
  for (const base of viewLayer?.readListBase("object_bases") ?? []) {
    const object = base.followPointer("object");
    if (object) baseFlags.set(object.offset, base.readMember("flag") as number);
  }

  // Walk the layer collection tree: excluded collections drop their objects, hidden ones hide them.
  const collectionVisibility = new Map<number, { object: BlendStruct; visible: boolean }>();
  const visitLayerCollection = (layerCollection: BlendStruct, parentHidden: boolean) => {
    const flag = layerCollection.readMember("flag") as number;
    if (flag & LAYER_COLLECTION_EXCLUDE) return;
    const collection = layerCollection.followPointer("collection");
    const hidden = parentHidden || Boolean(flag & LAYER_COLLECTION_HIDE) || Boolean(((collection?.readMember("flag") as number) ?? 0) & COLLECTION_HIDE_VIEWPORT);
    for (const collectionObject of collection?.readListBase("gobject") ?? []) {
      const object = collectionObject.followPointer("ob");
      if (!object) continue;
      const known = collectionVisibility.get(object.offset);
      collectionVisibility.set(object.offset, { object, visible: (known?.visible ?? false) || !hidden });
    }
    for (const child of layerCollection.readListBase("layer_collections")) visitLayerCollection(child, hidden);
  };
  for (const layerCollection of viewLayer?.readListBase("layer_collections") ?? []) visitLayerCollection(layerCollection, false);

  const objects = [...collectionVisibility.values()].map(({ object, visible }): SceneObject => {
    const typeCode = object.readMember("type") as number;
    const hiddenByObject = ((object.readMember("restrictflag") as number) & OBJECT_HIDE_VIEWPORT) !== 0;
    const hiddenByEye = ((baseFlags.get(object.offset) ?? 0) & BASE_HIDDEN) !== 0;
    return {
      name: object.datablockName ?? "",
      type: OBJECT_TYPE_NAMES[typeCode] ?? "other",
      typeCode,
      object,
      data: object.followPointer("data"),
      parentName: object.followPointer("parent")?.datablockName,
      worldMatrix: computeObjectWorldMatrix(object),
      visible: visible && !hiddenByObject && !hiddenByEye,
      materials: readObjectMaterials(object),
    };
  });

  const world = scene.followPointer("world");
  return {
    name: scene.datablockName ?? "",
    objects,
    cameraName: scene.followPointer("camera")?.datablockName,
    worldColor: world ? (["horr", "horg", "horb"].map((member) => world.readMember(member)) as [number, number, number]) : undefined,
    resolution: [scene.readMember("r.xsch") as number, scene.readMember("r.ysch") as number],
  };
}

// Image.source: IMA_SRC_FILE; NodeShaderNormalMap.space: SHD_SPACE_TANGENT.
const IMAGE_SOURCE_FILE = 1;
const NORMAL_MAP_SPACE_TANGENT = 0;

/** Node links of a node tree, looked up by the socket they feed. */
function indexLinksByTargetSocket(nodeTree: BlendStruct): Map<number, BlendStruct> {
  const links = new Map<number, BlendStruct>();
  for (const link of nodeTree.readListBase("links")) {
    const targetSocket = link.followPointer("tosock");
    if (targetSocket) links.set(targetSocket.offset, link);
  }
  return links;
}

/** Unlinked input values of a node, by socket identifier. */
function readUnlinkedInputs(node: BlendStruct, linksByTarget: Map<number, BlendStruct>): Map<string, number | number[]> {
  const inputs = new Map<string, number | number[]>();
  for (const socket of node.readListBase("inputs")) {
    if (linksByTarget.has(socket.offset)) continue;
    const value = socket.followPointer("default_value");
    if (value?.structType.findMember("value")) inputs.set(socket.readMember("identifier") as string, value.readMember("value") as number | number[]);
  }
  return inputs;
}

/** The node and output socket feeding a node's input, skipping reroutes; undefined when nothing is linked. */
function followInputLink(node: BlendStruct, inputIdentifier: string, linksByTarget: Map<number, BlendStruct>): { node: BlendStruct; outputIdentifier: string } | undefined {
  const socket = node.readListBase("inputs").find((candidate) => candidate.readMember("identifier") === inputIdentifier);
  const link = socket && linksByTarget.get(socket.offset);
  const sourceNode = link?.followPointer("fromnode");
  if (!link || !sourceNode) return undefined;
  if (sourceNode.readMember("idname") === "NodeReroute") {
    const rerouteInput = sourceNode.readListBase("inputs")[0];
    return rerouteInput ? followInputLink(sourceNode, rerouteInput.readMember("identifier") as string, linksByTarget) : undefined;
  }
  return { node: sourceNode, outputIdentifier: link.followPointer("fromsock")?.readMember("identifier") as string };
}

/** The texture an Image Texture node shows, with its UV map and Mapping node; undefined for other nodes or non-file images. */
function readImageTextureNode(node: BlendStruct, linksByTarget: Map<number, BlendStruct>): MaterialTexture | undefined {
  if (node.readMember("idname") !== "ShaderNodeTexImage") return undefined;
  const image = node.followPointer("id");
  if (!image || image.structType.name !== "Image" || image.readMember("source") !== IMAGE_SOURCE_FILE) return undefined;
  const texture: MaterialTexture = {
    imageName: image.datablockName ?? "",
    filepath: image.readMember("name") as string,
    colorSpace: image.readMember("colorspace_settings.name") as string,
  };
  const packedFile = image.followPointer("packedfile", "PackedFile");
  const packedAddress = packedFile?.readPointer("data") ?? 0n;
  const packedBlock = packedAddress !== 0n ? image.file.findBlockByAddress(packedAddress, packedFile!.offset) : undefined;
  if (packedFile && packedBlock) {
    const size = Math.min(packedFile.readMember("size") as number, packedBlock.size);
    texture.packedBytes = image.file.fileBytes.subarray(packedBlock.offset, packedBlock.offset + size);
  }

  // Vector input: a Mapping node and then a UV Map node may sit in front; anything else reads the render UV map.
  let source = followInputLink(node, "Vector", linksByTarget);
  if (source?.node.readMember("idname") === "ShaderNodeMapping") {
    const inputs = readUnlinkedInputs(source.node, linksByTarget);
    const vector = (identifier: string, fallback: number) => ((inputs.get(identifier) as number[] | undefined) ?? [fallback, fallback, fallback]).slice(0, 3) as [number, number, number];
    texture.mapping = { location: vector("Location", 0), rotation: vector("Rotation", 0), scale: vector("Scale", 1) };
    source = followInputLink(source.node, "Vector", linksByTarget);
  }
  if (source?.node.readMember("idname") === "ShaderNodeUVMap") {
    const uvMap = source.node.followPointer("storage", "NodeShaderUVMap")?.readMember("uv_map") as string | undefined;
    if (uvMap) texture.uvMap = uvMap;
  }
  return texture;
}

export function readMaterialAppearance(material: BlendStruct): MaterialAppearance {
  const appearance: MaterialAppearance = {
    name: material.datablockName ?? "",
    viewportColor: ["r", "g", "b", "a"].map((member) => material.readMember(member)) as MaterialAppearance["viewportColor"],
    metallic: material.readMember("metallic") as number,
    roughness: material.readMember("roughness") as number,
  };
  const nodeTree = material.followPointer("nodetree");
  const principledNode = nodeTree?.readListBase("nodes").find((candidate) => candidate.readMember("idname") === "ShaderNodeBsdfPrincipled");
  if (!nodeTree || !principledNode) return appearance;
  const linksByTarget = indexLinksByTargetSocket(nodeTree);
  const inputs = readUnlinkedInputs(principledNode, linksByTarget);
  const color = (identifier: string) => inputs.get(identifier) as MaterialAppearance["viewportColor"] | undefined;
  const number = (identifier: string, fallback: number) => (inputs.get(identifier) as number | undefined) ?? fallback;
  appearance.principled = {
    // A linked input (an image texture, for example) has no constant value; the viewport color stands in.
    baseColor: color("Base Color") ?? appearance.viewportColor,
    metallic: number("Metallic", appearance.metallic),
    roughness: number("Roughness", appearance.roughness),
    alpha: number("Alpha", 1),
    emissionColor: color("Emission Color") ?? color("Emission"),
    emissionStrength: number("Emission Strength", 0),
  };

  const textures: MaterialTextures = {};
  const imageTextureFeeding = (identifier: string) => {
    const source = followInputLink(principledNode, identifier, linksByTarget);
    return source?.outputIdentifier === "Color" ? readImageTextureNode(source.node, linksByTarget) : undefined;
  };
  textures.baseColor = imageTextureFeeding("Base Color");
  textures.metallic = imageTextureFeeding("Metallic");
  textures.roughness = imageTextureFeeding("Roughness");
  const normalSource = followInputLink(principledNode, "Normal", linksByTarget);
  const normalMapStorage = normalSource?.node.readMember("idname") === "ShaderNodeNormalMap" ? normalSource.node.followPointer("storage", "NodeShaderNormalMap") : undefined;
  if (normalSource && normalMapStorage?.readMember("space") === NORMAL_MAP_SPACE_TANGENT) {
    const colorSource = followInputLink(normalSource.node, "Color", linksByTarget);
    const texture = colorSource?.outputIdentifier === "Color" ? readImageTextureNode(colorSource.node, linksByTarget) : undefined;
    const uvMap = normalMapStorage.readMember("uv_map") as string;
    const strength = (readUnlinkedInputs(normalSource.node, linksByTarget).get("Strength") as number | undefined) ?? 1;
    if (texture) textures.normal = { ...texture, uvMap: texture.uvMap ?? (uvMap || undefined), strength };
  }
  for (const key of Object.keys(textures) as (keyof MaterialTextures)[]) if (!textures[key]) delete textures[key];
  if (Object.keys(textures).length > 0) appearance.textures = textures;
  return appearance;
}

export function readLight(lamp: BlendStruct): LightDescription {
  const has = (member: string) => lamp.structType.findMember(member) !== undefined;
  const exposure = has("exposure") ? (lamp.readMember("exposure") as number) : 0;
  const typeCode = lamp.readMember("type") as number;
  return {
    name: lamp.datablockName ?? "",
    type: LIGHT_TYPES[typeCode] ?? "point",
    color: ["r", "g", "b"].map((member) => lamp.readMember(member)) as [number, number, number],
    // Files store Light.energy under its old name "energy_new"; the file's "energy" is the deprecated value.
    power: (lamp.readMember("energy_new") as number) * 2 ** exposure,
    spotSize: lamp.readMember("spotsize") as number,
    spotBlend: lamp.readMember("spotblend") as number,
    areaSize: [lamp.readMember("area_size") as number, lamp.readMember("area_sizey") as number],
    areaShape: AREA_SHAPES[lamp.readMember("area_shape") as number] ?? "square",
    radius: lamp.readMember("radius") as number,
  };
}

export function readCamera(camera: BlendStruct): CameraDescription {
  const projections: CameraDescription["projection"][] = ["perspective", "orthographic", "panoramic"];
  const sensorFits: CameraDescription["sensorFit"][] = ["auto", "horizontal", "vertical"];
  return {
    name: camera.datablockName ?? "",
    projection: projections[camera.readMember("type") as number] ?? "perspective",
    lens: camera.readMember("lens") as number,
    sensorWidth: camera.readMember("sensor_x") as number,
    sensorHeight: camera.readMember("sensor_y") as number,
    sensorFit: sensorFits[camera.readMember("sensor_fit") as number] ?? "auto",
    orthoScale: camera.readMember("ortho_scale") as number,
    clipStart: camera.readMember("clipsta") as number,
    clipEnd: camera.readMember("clipend") as number,
    shift: [camera.readMember("shiftx") as number, camera.readMember("shifty") as number],
  };
}

