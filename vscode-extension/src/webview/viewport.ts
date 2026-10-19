// The 3D view: draws a RenderScene with three.js the way Blender's viewport does. Z is up, navigation follows
// Blender (middle or left drag orbits, Shift pans, wheel zooms, numpad views), and there are four shading modes.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { RenderCamera, RenderLight, RenderMaterial, RenderMesh, RenderScene, RenderTexture, TextureSlot } from "./scene-model.ts";

export type ShadingMode = "wireframe" | "solid" | "material" | "rendered";
export type ViewDirection = "front" | "back" | "right" | "left" | "top" | "bottom";

export interface ViewportOptions {
  onSelect?: (objectName: string | undefined) => void;
}

/** Colors of Blender's default dark theme. */
const THEME = {
  background: 0x303030,
  grid: 0x404040,
  axisX: 0xff3352,
  axisY: 0x8bdc00,
  wire: 0x000000,
  wireOnly: 0xb0b0b0,
  selected: 0xffa033,
  gizmo: 0x101010,
  sceneCamera: 0x000000,
  light: 0xe0e0a0,
};

const toColor = ([red, green, blue]: readonly number[]) => new THREE.Color().setRGB(red!, green!, blue!, THREE.LinearSRGBColorSpace);
const toMatrix = (columns: Float64Array) => new THREE.Matrix4().fromArray(Array.from(columns));

/** One drawable object: its group in the scene graph plus the pieces each shading mode switches. */
interface ViewportObject {
  name: string;
  root: THREE.Group;
  surfaces: THREE.Mesh[];
  wire?: THREE.LineSegments;
  gizmo?: THREE.Object3D;
  /** The scene light a light object adds; hidden together with the object. */
  light?: THREE.Light;
  materials?: { solid: THREE.Material[]; material: THREE.Material[]; rendered: THREE.Material[] };
}

/** Where a loaded image goes: a slot of a material-preview or rendered material, read through one UV channel. */
interface TextureBinding {
  material: THREE.MeshPhysicalMaterial;
  slot: TextureSlot;
  texture: RenderTexture;
  /** three.js UV channel: 0 reads "uv", 1 "uv1", … */
  channel: number;
}

/** three.js names of the UV attributes for channels 0 to 3. */
const UV_ATTRIBUTE_NAMES = ["uv", "uv1", "uv2", "uv3"];

export class SceneViewport {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly objects = new Map<string, ViewportObject>();
  private readonly textureBindings = new Map<string, TextureBinding[]>();
  private readonly appliedTextures: THREE.Texture[] = [];
  private readonly sceneLights = new THREE.Group();
  private readonly studioLights = new THREE.Group();
  private readonly overlays = new THREE.Group();
  private readonly environment: THREE.Texture;
  private readonly headlight = new THREE.DirectionalLight(0xffffff, 1.4);
  private readonly resizeObserver: ResizeObserver;
  private shadingMode: ShadingMode = "solid";
  private selectedName?: string;
  private sceneCamera?: { camera: THREE.PerspectiveCamera | THREE.OrthographicCamera; data: RenderCamera };
  private lookingThroughSceneCamera = false;
  private overlaysVisible = true;
  private frameRequested = false;
  private disposed = false;

  constructor(private readonly container: HTMLElement, private readonly renderScene: RenderScene, private readonly options: ViewportOptions = {}) {
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    // preserveDrawingBuffer lets the e2e test read pixels back from the canvas.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.classList.add("viewport-canvas");
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute("aria-label", "3D view of the scene. Drag to orbit, Shift-drag to pan, scroll to zoom.");
    this.renderer.domElement.setAttribute("role", "img");
    container.append(this.renderer.domElement);
    RectAreaLightUniformsLib.init();

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10_000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    this.controls.zoomToCursor = true;
    this.controls.addEventListener("change", () => {
      this.lookingThroughSceneCamera = false;
      this.requestFrame();
    });

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.scene.add(this.sceneLights, this.studioLights, this.overlays);
    this.buildStudioLights();
    this.buildOverlays();
    for (const mesh of renderScene.meshes) this.addMesh(mesh);
    for (const light of renderScene.lights) this.addLight(light);
    for (const camera of renderScene.cameras) this.addCamera(camera);
    for (const empty of renderScene.empties) this.addGizmo(empty.objectName, empty.worldMatrix, empty.visible, this.createEmptyGizmo(empty.displaySize));

    this.renderer.domElement.addEventListener("pointerdown", this.rememberPointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.selectAtPointer);
    this.renderer.domElement.addEventListener("keydown", this.handleKey);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.frameAll();
    this.setShadingMode("solid");
  }

  get currentShadingMode() {
    return this.shadingMode;
  }

  get hasSceneCamera() {
    return this.sceneCamera !== undefined;
  }

  get isLookingThroughSceneCamera() {
    return this.lookingThroughSceneCamera;
  }

  /** Object names in the order the outliner lists them, with their current visibility. */
  listObjects(): { name: string; kind: string; visible: boolean }[] {
    const kindOf = (name: string) =>
      this.renderScene.meshes.some((mesh) => mesh.objectName === name) ? "mesh"
        : this.renderScene.lights.some((light) => light.objectName === name) ? "light"
          : this.renderScene.cameras.some((camera) => camera.objectName === name) ? "camera" : "empty";
    return [...this.objects.values()].map((object) => ({ name: object.name, kind: kindOf(object.name), visible: object.root.visible }));
  }

  setShadingMode(mode: ShadingMode) {
    this.shadingMode = mode;
    const background = mode === "rendered" ? toColor(this.renderScene.worldColor) : new THREE.Color(THEME.background);
    this.scene.background = background;
    this.scene.environment = mode === "material" ? this.environment : null;
    this.renderer.toneMapping = mode === "material" || mode === "rendered" ? THREE.AgXToneMapping : THREE.NoToneMapping;
    this.sceneLights.visible = mode === "rendered";
    this.studioLights.visible = mode === "solid";
    this.headlight.visible = mode === "solid";
    for (const object of this.objects.values()) {
      for (const surface of object.surfaces) {
        surface.visible = mode !== "wireframe";
        if (object.materials && mode !== "wireframe") surface.material = object.materials[mode];
      }
      if (object.wire) object.wire.visible = mode === "wireframe" || object.name === this.selectedName;
    }
    this.updateSelectionColors();
    this.requestFrame();
  }

  setObjectVisible(name: string, visible: boolean) {
    const object = this.objects.get(name);
    if (!object) return;
    object.root.visible = visible;
    if (object.light) object.light.visible = visible;
    this.requestFrame();
  }

  setOverlaysVisible(visible: boolean) {
    this.overlaysVisible = visible;
    this.overlays.visible = visible;
    for (const object of this.objects.values()) if (object.gizmo) object.gizmo.visible = visible;
    this.requestFrame();
  }

  get areOverlaysVisible() {
    return this.overlaysVisible;
  }

  select(name: string | undefined) {
    this.selectedName = name && this.objects.has(name) ? name : undefined;
    this.setShadingMode(this.shadingMode);
    this.options.onSelect?.(this.selectedName);
  }

  /** Fits the camera around the visible objects (Home in Blender). */
  frameAll() {
    const bounds = this.renderScene.bounds;
    const box = bounds ? new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max)) : new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    this.frameBox(box, new THREE.Vector3(1, -1.2, 0.8));
  }

  /** Fits the camera around the selected object (numpad period in Blender). */
  frameSelected() {
    const object = this.selectedName ? this.objects.get(this.selectedName) : undefined;
    if (!object) return this.frameAll();
    const box = new THREE.Box3().setFromObject(object.root);
    if (box.isEmpty()) box.setFromCenterAndSize(object.root.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(1, 1, 1));
    this.frameBox(box, this.camera.position.clone().sub(this.controls.target));
  }

  /** Numpad 1/3/7 and their Ctrl variants. */
  viewFrom(direction: ViewDirection) {
    const offsets: Record<ViewDirection, THREE.Vector3> = {
      front: new THREE.Vector3(0, -1, 0), back: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0),
      left: new THREE.Vector3(-1, 0, 0), top: new THREE.Vector3(0, 0.0001, 1), bottom: new THREE.Vector3(0, 0.0001, -1),
    };
    const distance = this.camera.position.distanceTo(this.controls.target);
    this.camera.position.copy(this.controls.target).addScaledVector(offsets[direction].normalize(), distance);
    this.controls.update();
  }

  /** Numpad 0: look through the scene camera, with the render frame shown at the render aspect ratio. */
  toggleSceneCameraView(enabled = !this.lookingThroughSceneCamera) {
    if (!this.sceneCamera) return;
    this.lookingThroughSceneCamera = enabled;
    this.resize();
    this.requestFrame();
  }

  /** Camera position and orbit target, to keep the view when the file reloads. */
  get viewState(): { position: number[]; target: number[] } {
    return { position: this.camera.position.toArray(), target: this.controls.target.toArray() };
  }

  restoreView(view: { position: number[]; target: number[] }) {
    this.camera.position.fromArray(view.position);
    this.controls.target.fromArray(view.target);
    this.controls.update();
  }

  dispose() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener("pointerdown", this.rememberPointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.selectAtPointer);
    this.renderer.domElement.removeEventListener("keydown", this.handleKey);
    this.scene.traverse((node) => {
      if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments || node instanceof THREE.Line) {
        node.geometry.dispose();
        for (const material of [node.material].flat()) material.dispose();
      }
    });
    for (const object of this.objects.values()) for (const material of Object.values(object.materials ?? {}).flat()) material.dispose();
    for (const texture of this.appliedTextures) {
      texture.dispose();
      if (texture.image instanceof ImageBitmap) texture.image.close();
    }
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** One entry per image the materials use (by RenderTexture.key), to load and pass to applyTexture. */
  get textureRequests(): RenderTexture[] {
    return [...this.textureBindings.values()].map((bindings) => bindings[0]!.texture);
  }

  /** Puts a decoded image into every material slot that uses it, with each slot's UV map and Mapping node. */
  applyTexture(key: string, image: THREE.Texture) {
    if (this.disposed) {
      image.dispose();
      return;
    }
    this.appliedTextures.push(image);
    for (const { material, slot, texture, channel } of this.textureBindings.get(key) ?? []) {
      const map = image.clone(); // shares the image; the clone carries this slot's UV channel and transform
      map.channel = channel;
      map.matrixAutoUpdate = false;
      map.matrix.set(...(texture.uvTransform as Parameters<THREE.Matrix3["set"]>));
      map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      map.needsUpdate = true;
      this.appliedTextures.push(map);
      // three.js multiplies maps with the constant: white base color, roughness 1 and metalness 1 let the image decide.
      if (slot === "baseColor") {
        material.map = map;
        material.color.setRGB(1, 1, 1);
      } else if (slot === "roughness") {
        material.roughnessMap = map;
        material.roughness = 1;
      } else if (slot === "metallic") {
        material.metalnessMap = map;
        material.metalness = 1;
      } else {
        material.normalMap = map;
        material.normalScale.set(texture.strength ?? 1, texture.strength ?? 1);
      }
      material.needsUpdate = true;
    }
    this.requestFrame();
  }

  private requestFrame() {
    if (this.frameRequested || this.disposed) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.renderFrame();
    });
  }

  /** Draws one frame now. Exposed for tests that read pixels right after a change. */
  renderFrame() {
    if (this.disposed) return;
    const { width, height } = this.canvasSize();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, width, height);
    if (this.lookingThroughSceneCamera && this.sceneCamera) {
      // Passepartout: dark border, the render frame at the render's aspect ratio in the middle.
      this.renderer.setClearColor(0x1a1a1a);
      this.renderer.clear();
      const [renderWidth, renderHeight] = this.renderScene.resolution;
      const scale = Math.min((width * 0.92) / renderWidth, (height * 0.92) / renderHeight);
      const frameWidth = Math.round(renderWidth * scale);
      const frameHeight = Math.round(renderHeight * scale);
      const left = Math.round((width - frameWidth) / 2);
      const bottom = Math.round((height - frameHeight) / 2);
      this.renderer.setViewport(left, bottom, frameWidth, frameHeight);
      this.renderer.setScissor(left, bottom, frameWidth, frameHeight);
      this.renderer.setScissorTest(true);
      this.renderer.render(this.scene, this.sceneCamera.camera);
      this.renderer.setScissorTest(false);
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }

  private canvasSize() {
    return { width: Math.max(1, this.container.clientWidth), height: Math.max(1, this.container.clientHeight) };
  }

  private resize() {
    const { width, height } = this.canvasSize();
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestFrame();
  }

  private frameBox(box: THREE.Box3, viewDirection: THREE.Vector3) {
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.5);
    // The bounding sphere touches the view's top and bottom; Blender's View All frames about this tightly.
    const fitDistance = (radius / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) * 0.8;
    this.camera.near = Math.max(radius / 1000, 0.001);
    this.camera.far = Math.max(fitDistance * 20, 1000);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(viewDirection.normalize(), fitDistance);
    this.controls.update();
  }

  private buildStudioLights() {
    // Solid mode: Blender lights it with a studio setup that moves with the view; a hemisphere plus a headlight is close.
    this.studioLights.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
    this.headlight.position.set(1, 2, 3);
    this.camera.add(this.headlight);
    this.scene.add(this.camera);
    // Rendered mode: the world color lights everything evenly, like Blender's world background.
    this.sceneLights.add(new THREE.AmbientLight(toColor(this.renderScene.worldColor), Math.PI));
  }

  private buildOverlays() {
    const extent = this.renderScene.bounds ? Math.max(10, ...this.renderScene.bounds.max.map(Math.abs), ...this.renderScene.bounds.min.map(Math.abs)) : 10;
    const gridSize = Math.ceil(extent * 2.5);
    const grid = new THREE.GridHelper(gridSize * 2, gridSize * 2, THEME.grid, THEME.grid);
    grid.rotation.x = Math.PI / 2; // GridHelper lies in XZ; Blender's floor grid is XY
    const axisLine = (color: number, end: THREE.Vector3) =>
      new THREE.Line(new THREE.BufferGeometry().setFromPoints([end.clone().negate(), end]), new THREE.LineBasicMaterial({ color }));
    const floorLines = [grid, axisLine(THEME.axisX, new THREE.Vector3(gridSize, 0, 0)), axisLine(THEME.axisY, new THREE.Vector3(0, gridSize, 0))];
    // Opaque, drawn first and without depth writes, so geometry on the floor (a ground plane) covers the grid instead of
    // z-fighting. Transparent materials would be drawn after all opaque ones regardless of renderOrder.
    for (const line of floorLines) {
      line.renderOrder = -1;
      (line.material as THREE.Material).depthWrite = false;
    }
    this.overlays.add(...floorLines);
  }

  private createSurfaceMaterials(materials: RenderMaterial[], uvMapNames: string[]) {
    const side = THREE.DoubleSide; // Blender shows back faces by default
    const surfaceMaterials = {
      solid: materials.map((material) => new THREE.MeshStandardMaterial({ color: toColor(material.viewportColor), roughness: 0.7, metalness: 0, side, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })),
      material: materials.map((material) => this.createPhysicalMaterial(material, side)),
      rendered: materials.map((material) => this.createPhysicalMaterial(material, side)),
    };
    // Textures need UVs: the texture's UV map, or the render UV map (channel 0) when it names none.
    materials.forEach((material, slotIndex) => {
      for (const [slot, texture] of Object.entries(material.textures ?? {}) as [TextureSlot, RenderTexture][]) {
        const channel = texture.uvMap === undefined ? 0 : uvMapNames.indexOf(texture.uvMap);
        if (uvMapNames.length === 0 || channel < 0 || channel >= UV_ATTRIBUTE_NAMES.length) continue;
        const bindings = this.textureBindings.get(texture.key) ?? [];
        for (const mode of ["material", "rendered"] as const) bindings.push({ material: surfaceMaterials[mode][slotIndex] as THREE.MeshPhysicalMaterial, slot, texture, channel });
        this.textureBindings.set(texture.key, bindings);
      }
    });
    return surfaceMaterials;
  }

  private createPhysicalMaterial(material: RenderMaterial, side: THREE.Side) {
    return new THREE.MeshPhysicalMaterial({
      color: toColor(material.baseColor),
      metalness: material.metallic,
      roughness: material.roughness,
      emissive: toColor(material.emissive),
      opacity: material.opacity,
      transparent: material.opacity < 1,
      side,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  }

  private addMesh(mesh: RenderMesh) {
    const root = this.createRoot(mesh.objectName, mesh.worldMatrix, mesh.visible);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    mesh.uvChannels.slice(0, UV_ATTRIBUTE_NAMES.length).forEach(({ uvs }, channel) => geometry.setAttribute(UV_ATTRIBUTE_NAMES[channel]!, new THREE.BufferAttribute(uvs, 2)));
    const materialSlots = mesh.materials.length > 0 ? mesh.materials : [{ name: "(default)", viewportColor: [0.8, 0.8, 0.8], baseColor: [0.8, 0.8, 0.8], opacity: 1, metallic: 0, roughness: 0.5, emissive: [0, 0, 0] } satisfies RenderMaterial];
    for (const group of mesh.groups) geometry.addGroup(group.start, group.count, Math.min(group.materialSlot, materialSlots.length - 1));
    const materials = this.createSurfaceMaterials(materialSlots, mesh.uvChannels.map((channel) => channel.name));
    const surface = new THREE.Mesh(geometry, materials.solid);
    surface.castShadow = true;
    surface.receiveShadow = true;
    surface.userData.objectName = mesh.objectName;
    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute("position", new THREE.BufferAttribute(mesh.edgePositions, 3));
    const wire = new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial({ color: THEME.wireOnly }));
    root.add(surface, wire);
    wire.userData.objectName = mesh.objectName;
    this.objects.set(mesh.objectName, { name: mesh.objectName, root, surfaces: [surface], wire, materials });
  }

  private addLight(item: RenderLight) {
    const { light } = item;
    const matrix = toMatrix(item.worldMatrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    // Blender lights shine along their local -Z.
    const direction = new THREE.Vector3(0, 0, -1).transformDirection(matrix);
    const color = toColor(light.color);
    // Units: Blender's sun strength is irradiance (W/m²) and point/spot power is radiant flux (W); a white diffuse
    // surface then reaches E/π in both renderers when three's intensities are E for suns and P/(4π) for points.
    let threeLight: THREE.Light;
    if (light.type === "sun") {
      const sun = new THREE.DirectionalLight(color, light.power);
      sun.position.copy(position).addScaledVector(direction, -50);
      sun.target.position.copy(position).addScaledVector(direction, 1);
      this.configureShadow(sun);
      this.sceneLights.add(sun.target);
      threeLight = sun;
    } else if (light.type === "spot") {
      const spot = new THREE.SpotLight(color, light.power / (4 * Math.PI), 0, light.spotSize / 2, light.spotBlend, 2);
      spot.position.copy(position);
      spot.target.position.copy(position).add(direction);
      this.configureShadow(spot);
      this.sceneLights.add(spot.target);
      threeLight = spot;
    } else if (light.type === "area") {
      const scale = new THREE.Vector3().setFromMatrixScale(matrix);
      const [width, height] = light.areaShape === "rectangle" || light.areaShape === "ellipse" ? light.areaSize : [light.areaSize[0], light.areaSize[0]];
      const area = new THREE.RectAreaLight(color, light.power / (Math.PI * width * scale.x * height * scale.y || 1), width * scale.x, height * scale.y);
      area.position.copy(position);
      area.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(matrix));
      threeLight = area;
    } else {
      const point = new THREE.PointLight(color, light.power / (4 * Math.PI), 0, 2);
      point.position.copy(position);
      this.configureShadow(point);
      threeLight = point;
    }
    threeLight.visible = item.visible;
    threeLight.userData.objectName = item.objectName;
    this.sceneLights.add(threeLight);
    this.addGizmo(item.objectName, item.worldMatrix, item.visible, this.createLightGizmo(item), threeLight);
  }

  private configureShadow(light: THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0005;
    if (light instanceof THREE.DirectionalLight) {
      const bounds = this.renderScene.bounds;
      const extent = bounds ? Math.max(...bounds.max.map((value, axis) => value - bounds.min[axis]!)) : 10;
      Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.5, far: 200 });
    }
  }

  private addCamera(item: RenderCamera) {
    const { camera } = item;
    const [renderWidth, renderHeight] = this.renderScene.resolution;
    const aspect = renderWidth / renderHeight;
    const gizmo = this.createCameraGizmo(item, aspect);
    this.addGizmo(item.objectName, item.worldMatrix, item.visible, gizmo);
    if (!item.isSceneCamera) return;
    let threeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (camera.projection === "orthographic") {
      const halfWidth = aspect >= 1 ? camera.orthoScale / 2 : (camera.orthoScale / 2) * aspect;
      const halfHeight = halfWidth / aspect;
      threeCamera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, camera.clipStart, camera.clipEnd);
    } else {
      threeCamera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(verticalFieldOfView(camera, aspect)), aspect, camera.clipStart, camera.clipEnd);
    }
    // Blender cameras look along local -Z with +Y up, the same as three.js cameras; object scale does not apply.
    toMatrix(item.worldMatrix).decompose(threeCamera.position, threeCamera.quaternion, new THREE.Vector3());
    threeCamera.updateMatrixWorld();
    this.sceneCamera = { camera: threeCamera, data: item };
  }

  private createRoot(name: string, worldMatrix: Float64Array, visible: boolean) {
    const root = new THREE.Group();
    root.name = name;
    root.matrixAutoUpdate = false;
    root.matrix.copy(toMatrix(worldMatrix));
    root.visible = visible;
    this.scene.add(root);
    return root;
  }

  private addGizmo(name: string, worldMatrix: Float64Array, visible: boolean, gizmo: THREE.Object3D, light?: THREE.Light) {
    const root = this.createRoot(name, worldMatrix, visible);
    root.add(gizmo);
    gizmo.traverse((node) => { node.userData.objectName = name; });
    this.objects.set(name, { name, root, surfaces: [], gizmo, light });
  }

  private gizmoLines(points: number[][], color = THEME.gizmo) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
  }

  private createEmptyGizmo(size: number) {
    return this.gizmoLines([[-size, 0, 0], [size, 0, 0], [0, -size, 0], [0, size, 0], [0, 0, -size], [0, 0, size]]);
  }

  private createLightGizmo({ light }: RenderLight) {
    const circle = Array.from({ length: 24 }, (_, index) => {
      const angle = (index / 24) * Math.PI * 2;
      const next = ((index + 1) / 24) * Math.PI * 2;
      return [[Math.cos(angle) * 0.2, Math.sin(angle) * 0.2, 0], [Math.cos(next) * 0.2, Math.sin(next) * 0.2, 0]];
    }).flat();
    const lines: number[][] = [...circle];
    if (light.type === "sun") for (let ray = 0; ray < 8; ray += 1) {
      const angle = (ray / 8) * Math.PI * 2;
      lines.push([Math.cos(angle) * 0.3, Math.sin(angle) * 0.3, 0], [Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0]);
    }
    if (light.type === "sun" || light.type === "spot" || light.type === "area") lines.push([0, 0, 0], [0, 0, -2]);
    if (light.type === "spot") {
      const radius = Math.tan(light.spotSize / 2) * 2;
      for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) lines.push([0, 0, 0], [x! * radius, y! * radius, -2]);
    }
    if (light.type === "area") {
      const [width, height] = light.areaShape === "rectangle" || light.areaShape === "ellipse" ? light.areaSize : [light.areaSize[0], light.areaSize[0]];
      const corners = [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]];
      corners.forEach((corner, index) => lines.push([...corner, 0], [...corners[(index + 1) % 4]!, 0]));
    }
    const gizmo = this.gizmoLines(lines, THEME.light);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: toColor(light.color) }));
    gizmo.add(bulb);
    return gizmo;
  }

  private createCameraGizmo({ camera, displaySize, isSceneCamera }: RenderCamera, aspect: number) {
    // Blender draws a pyramid whose base is the sensor frame at `drawsize`, plus a triangle above it marking "up".
    const halfWidth = aspect >= 1 ? 0.5 : 0.5 * aspect;
    const halfHeight = halfWidth / aspect;
    const depth = camera.projection === "orthographic" ? 0.5 : camera.lens / (aspect >= 1 ? camera.sensorWidth : camera.sensorWidth / aspect);
    const corners = [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight]].map(([x, y]) => [x! * displaySize * 2, y! * displaySize * 2, -depth * displaySize * 2]);
    const lines: number[][] = [];
    corners.forEach((corner, index) => lines.push([0, 0, 0], corner, corner, corners[(index + 1) % 4]!));
    const top = halfHeight * displaySize * 2;
    const z = -depth * displaySize * 2;
    lines.push([-halfWidth * displaySize, top * 1.1, z], [halfWidth * displaySize, top * 1.1, z], [halfWidth * displaySize, top * 1.1, z], [0, top * 1.6, z], [0, top * 1.6, z], [-halfWidth * displaySize, top * 1.1, z]);
    return this.gizmoLines(lines, isSceneCamera ? THEME.sceneCamera : THEME.gizmo);
  }

  private updateSelectionColors() {
    for (const object of this.objects.values()) {
      const isSelected = object.name === this.selectedName;
      if (object.wire) {
        (object.wire.material as THREE.LineBasicMaterial).color.set(isSelected ? THEME.selected : this.shadingMode === "wireframe" ? THEME.wireOnly : THEME.wire);
      }
      object.gizmo?.traverse((node) => {
        if (node instanceof THREE.LineSegments) (node.material as THREE.LineBasicMaterial).color.set(isSelected ? THEME.selected : node.userData.baseColor ?? (node.userData.baseColor = (node.material as THREE.LineBasicMaterial).color.getHex()));
      });
    }
  }

  private pointerDownAt?: { x: number; y: number };
  private readonly rememberPointerDown = (event: PointerEvent) => {
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
    this.renderer.domElement.focus();
  };

  /** A click without dragging selects the object under the pointer (or clears the selection). */
  private readonly selectAtPointer = (event: PointerEvent) => {
    if (!this.pointerDownAt || Math.hypot(event.clientX - this.pointerDownAt.x, event.clientY - this.pointerDownAt.y) > 4 || this.lookingThroughSceneCamera) return;
    const rectangle = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rectangle.left) / rectangle.width) * 2 - 1, -((event.clientY - rectangle.top) / rectangle.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.05 };
    raycaster.setFromCamera(pointer, this.camera);
    const candidates: THREE.Object3D[] = [...this.objects.values()].filter((object) => object.root.visible).flatMap((object) => (this.shadingMode === "wireframe" || object.surfaces.length === 0 ? [object.root as THREE.Object3D] : object.surfaces));
    const hit = raycaster.intersectObjects(candidates, true).find((intersection) => intersection.object.userData.objectName ?? intersection.object.parent?.name);
    this.select(hit ? hit.object.userData.objectName ?? hit.object.parent?.name : undefined);
  };

  private readonly handleKey = (event: KeyboardEvent) => {
    const opposite = event.ctrlKey || event.metaKey;
    const views: Record<string, ViewDirection> = { "1": opposite ? "back" : "front", "3": opposite ? "left" : "right", "7": opposite ? "bottom" : "top" };
    const key = event.code.replace(/^(Numpad|Digit)/, "");
    if (views[key]) this.viewFrom(views[key]);
    else if (key === "0") this.toggleSceneCameraView();
    else if (event.code === "Home") this.frameAll();
    else if (event.code === "NumpadDecimal" || event.key === ".") this.frameSelected();
    else return;
    event.preventDefault();
  };
}

/** Vertical field of view of a Blender camera rendered at `aspect` (sensor fit as Blender applies it). */
export function verticalFieldOfView(camera: RenderCamera["camera"], aspect: number): number {
  // Auto fit spans sensor_x across the larger image side; explicit fits use sensor_x horizontally or sensor_y vertically.
  const fit = camera.sensorFit === "auto" ? (aspect >= 1 ? "horizontal" : "vertical") : camera.sensorFit;
  if (fit === "horizontal") {
    const horizontal = 2 * Math.atan(camera.sensorWidth / (2 * camera.lens));
    return 2 * Math.atan(Math.tan(horizontal / 2) / aspect);
  }
  const sensor = camera.sensorFit === "auto" ? camera.sensorWidth : camera.sensorHeight;
  return 2 * Math.atan(sensor / (2 * camera.lens));
}
