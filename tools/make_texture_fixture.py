"""Writes a texture fixture for the 3D viewer: a plane with two UV maps and a material whose Principled BSDF reads
an external sRGB PNG through a Mapping node (base color), a packed Non-Color PNG through a reroute (roughness) and
an external EXR through a Normal Map node on the second UV map, plus Blender's own view of it as truth JSON.

Run headless: Blender -b --factory-startup --python tools/make_texture_fixture.py -- <out_dir> <prefix>
"""
import json
import os
import sys

import bpy

out, prefix = sys.argv[sys.argv.index("--") + 1:][:2]
out = os.path.abspath(out)
texture_dir = os.path.join(out, "textures")
os.makedirs(texture_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "TextureScene"


def make_image(name, width, height, pixel, colorspace, is_float=False):
    image = bpy.data.images.new(name, width, height, alpha=True, float_buffer=is_float)
    image.colorspace_settings.name = colorspace
    image.pixels = [channel for y in range(height) for x in range(width) for channel in pixel(x, y)]
    return image


# Base color: 4×2, red bottom row, blue top row, so a flipped image shows up in the e2e pixel check.
base = make_image("BaseImage", 4, 2, lambda x, y: (0.8, 0.1, 0.1, 1.0) if y == 0 else (0.1, 0.1, 0.8, 1.0), "sRGB")
base.filepath_raw = os.path.join(texture_dir, "texture_base.png")
base.file_format = "PNG"
base.save()
base.filepath = "//textures/texture_base.png"

rough = make_image("RoughImage", 2, 2, lambda x, y: (0.25, 0.25, 0.25, 1.0), "Non-Color")
rough.filepath_raw = os.path.join(texture_dir, "texture_rough.png")
rough.file_format = "PNG"
rough.save()
rough.pack()
rough.filepath = "//textures/texture_rough.png"

normal = make_image("NormalImage", 2, 2, lambda x, y: (0.5, 0.5, 1.0, 1.0), "Non-Color", is_float=True)
normal.filepath_raw = os.path.join(texture_dir, "texture_normal.exr")
normal.file_format = "OPEN_EXR"
normal.save()
normal.filepath = "//textures/texture_normal.exr"

material = bpy.data.materials.new("Textured")
material.use_nodes = True
nodes, links = material.node_tree.nodes, material.node_tree.links
principled = next(node for node in nodes if node.bl_idname == "ShaderNodeBsdfPrincipled")
principled.inputs["Metallic"].default_value = 0.3

coordinates = nodes.new("ShaderNodeTexCoord")
mapping = nodes.new("ShaderNodeMapping")
mapping.inputs["Location"].default_value = (0.25, 0.5, 0.0)
mapping.inputs["Rotation"].default_value = (0.0, 0.0, 0.3)
mapping.inputs["Scale"].default_value = (2.0, 3.0, 1.0)
links.new(coordinates.outputs["UV"], mapping.inputs["Vector"])
base_node = nodes.new("ShaderNodeTexImage")
base_node.image = base
links.new(mapping.outputs["Vector"], base_node.inputs["Vector"])
links.new(base_node.outputs["Color"], principled.inputs["Base Color"])

rough_node = nodes.new("ShaderNodeTexImage")
rough_node.image = rough
reroute = nodes.new("NodeReroute")
links.new(rough_node.outputs["Color"], reroute.inputs[0])
links.new(reroute.outputs[0], principled.inputs["Roughness"])

second_uv = nodes.new("ShaderNodeUVMap")
second_uv.uv_map = "Second"
normal_node = nodes.new("ShaderNodeTexImage")
normal_node.image = normal
links.new(second_uv.outputs["UV"], normal_node.inputs["Vector"])
normal_map = nodes.new("ShaderNodeNormalMap")
normal_map.inputs["Strength"].default_value = 0.7
links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

bpy.ops.mesh.primitive_plane_add(size=2.0)
plane = bpy.context.active_object
plane.name = "TexturedPlane"
plane.data.name = "TexturedPlaneMesh"
plane.data.materials.append(material)
second = plane.data.uv_layers.new(name="Second")
for index, loop_uv in enumerate(second.data):
    loop_uv.uv = (0.1 * index, 1.0 - 0.1 * index)

camera = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
scene.collection.objects.link(camera)
camera.location = (0.0, 0.0, 6.0)
scene.camera = camera

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{prefix}.blend"), compress=False, relative_remap=False)

mesh = plane.data
mesh.calc_loop_triangles()
render_uv = next(layer for layer in mesh.uv_layers if layer.active_render)
truth = {
    "blenderVersion": bpy.app.version_string,
    "uvMaps": {layer.name: [round(value, 6) for loop_uv in layer.data for value in loop_uv.uv] for layer in mesh.uv_layers},
    "renderUvMap": render_uv.name,
    "images": {image.name: {"filepath": image.filepath, "colorSpace": image.colorspace_settings.name, "packed": image.packed_file is not None} for image in (base, rough, normal)},
    "mapping": {"location": list(mapping.inputs["Location"].default_value), "rotation": list(mapping.inputs["Rotation"].default_value), "scale": list(mapping.inputs["Scale"].default_value)},
    "normalStrength": normal_map.inputs["Strength"].default_value,
    "packedRoughSize": rough.packed_file.size,
    # VERIFIED: same shape as the other fixtures' truth, for e2e/consumer.ts.
    "objects": {obj.name: {"location": list(obj.location), "matrix_world": [list(row) for row in obj.matrix_world], "visible": obj.visible_get()} for obj in scene.objects},
    "meshes": {mesh.name: {"vertices": len(mesh.vertices), "triangles": len(mesh.loop_triangles)}},
}
with open(os.path.join(out, f"{prefix}.truth.json"), "w") as handle:
    json.dump(truth, handle, indent=2)
