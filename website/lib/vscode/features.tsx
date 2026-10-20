// What the extension shows: the 3D view, the inspector, and what it reads (privacy).
import type { DefussChild } from "defuss";
import { RichText } from "../parts/rich-text.tsx";
import { Screenshot } from "../parts/screenshot.tsx";

/** A bulleted list whose items start with a bold name. */
function FeatureList({ items, children }: { items: [string, string][]; children?: DefussChild }) {
  return (
    <ul>
      {items.map(([name, text]) => <li key={name}><strong>{name}:</strong> <RichText text={text} /></li>)}
      {children}
    </ul>
  );
}

const VIEWER_FEATURES: [string, string][] = [
  ["The scene as Blender's viewport shows it", "meshes with their materials, lights, cameras and empties, placed with the world matrices Blender computes (parents, every rotation mode, delta transforms). Objects hidden in the viewport start hidden."],
  ["Four shading modes", "Wireframe, Solid (studio light and viewport display colors), Material (Principled BSDF base color, metallic, roughness and emission with image textures) and Rendered (the scene's own lights, shadows and world color)."],
  ["Navigation like Blender", "drag to orbit, Shift-drag to pan, wheel to zoom; 1, 3 and 7 for front, right and top views, 0 for the scene camera, Home to frame everything."],
  ["Outliner and status line", "show, hide and select objects; the status line counts vertices, faces and triangles and names objects with modifiers."],
];

const INSPECTOR_FEATURES: [string, string][] = [
  ["Thumbnail and scenes", "the preview image Blender saved and each scene's frame range."],
  ["Datablocks", "objects, meshes, materials, scenes and the rest, grouped by type, with a filter."],
];

export function ViewerSection() {
  return (
    <>
      <h3 id="vscode-3d-view">3D view</h3>
      <FeatureList items={VIEWER_FEATURES} />
      <p>Image textures show in Material and Rendered modes when an Image Texture node feeds the Principled BSDF's Base Color, Metallic, Roughness, or Normal through a Normal Map node. Packed images come from the file itself; external images are read next to the <code>.blend</code> file, also from its <code>textures</code> folder when the saved path belongs to another machine. PNG, JPEG, WebP, BMP, GIF and OpenEXR are supported and scaled to at most 2048 pixels.</p>
      <p>The file stores meshes before modifiers, so subdivision, mirror and other modifiers are not applied. Curves, text and volumes only get geometry when Blender evaluates them and are listed as not drawn. Node setups beyond an image feeding the Principled BSDF (Mix, Color Ramp, procedural textures) are not rendered.</p>
    </>
  );
}

export function InspectorSection() {
  return (
    <>
      <h3 id="vscode-inspector">Inspector</h3>
      <Screenshot src="/assets/vscode-inspector.png" alt="The Inspector tab: the saved thumbnail of a cube, the scene with its frame range, and the datablocks grouped by type." width={1280} height={720} caption="The Inspector tab with the saved thumbnail and the datablocks." />
      <FeatureList items={INSPECTOR_FEATURES}>
        <li><strong>Struct browser:</strong> every member of a datablock as the file's own SDNA describes it. Click a pointer to follow it; <strong>Copy as JSON</strong> copies the open struct. The <a href="/#playground">playground on this site</a> is this same preview, running in the browser.</li>
      </FeatureList>
      <p>It reads files from Blender 2.5 to 5.x, plain, gzip or zstd compressed, and reloads when Blender saves the file again.</p>
    </>
  );
}

export function PrivacySection() {
  return (
    <>
      <h3 id="vscode-privacy">Privacy</h3>
      <p>The extension has no network access and sends no telemetry. The file is parsed inside the preview. The only other files it reads are images (by file extension) that a material names, and only to show them in the preview.</p>
    </>
  );
}
