"""Writes a scene fixture for the 3D viewer: parents, every rotation mode, delta transforms, a concave n-gon,
smooth and flat faces, several materials, every light type, a camera, a world color and hidden objects,
plus Blender's own view of it (matrix_world, visibility, triangles, material values) as truth JSON.

Run headless: Blender -b --factory-startup --python tools/make_scene_fixture.py -- <out_dir> <prefix>
"""
import json
import math
import os
import sys

import bmesh
import bpy

out, prefix = sys.argv[sys.argv.index("--") + 1:][:2]
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "ViewerScene"
scene.render.resolution_x, scene.render.resolution_y = 800, 600


def principled_material(name, base_color, metallic, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = next(node for node in material.node_tree.nodes if node.bl_idname == "ShaderNodeBsdfPrincipled")
    principled.inputs["Base Color"].default_value = base_color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    material.diffuse_color = (0.9, 0.9, 0.9, 1.0)  # viewport display color differs on purpose
    return material


def link(obj, collection=None):
    (collection or scene.collection).objects.link(obj)
    return obj


red = principled_material("Red", (0.8, 0.05, 0.05, 1.0), 0.0, 0.5)
gold = principled_material("Gold", (1.0, 0.75, 0.3, 1.0), 1.0, 0.2)
plain = bpy.data.materials.new("ViewportOnly")
plain.diffuse_color = (0.1, 0.6, 0.2, 1.0)
if hasattr(plain, "use_nodes"):
    plain.use_nodes = False

# Cube with two materials: top and bottom faces use slot 1.
cube_mesh = bpy.data.meshes.new("BoxMesh")
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=2.0)
for face in bm.faces:
    face.material_index = 1 if abs(face.normal.z) > 0.5 else 0
bm.to_mesh(cube_mesh)
bm.free()
cube_mesh.materials.append(red)
cube_mesh.materials.append(plain)
box = link(bpy.data.objects.new("Box", cube_mesh))
box.location = (0.0, 0.0, 1.0)
box.rotation_euler = (0.3, 0.2, 0.1)
box.scale = (1.0, 2.0, 0.5)

# Child of Box, ZYX euler, keeps the parent inverse set by "parent with keep transform".
child = link(bpy.data.objects.new("Child", cube_mesh))
child.rotation_mode = "ZYX"
child.rotation_euler = (0.5, -0.4, 1.2)
child.location = (3.0, 0.0, 0.0)
child.scale = (0.3, 0.3, 0.3)
bpy.context.view_layer.update()
child.parent = box
child.matrix_parent_inverse = box.matrix_world.inverted()

# Smooth-shaded sphere, quaternion rotation, delta transforms.
sphere_mesh = bpy.data.meshes.new("BallMesh")
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=1.0)
for face in bm.faces:
    face.smooth = True
bm.to_mesh(sphere_mesh)
bm.free()
sphere_mesh.materials.append(gold)
ball = link(bpy.data.objects.new("Ball", sphere_mesh))
ball.rotation_mode = "QUATERNION"
ball.rotation_quaternion = (0.9, 0.1, 0.3, 0.2)
ball.location = (-3.0, 1.0, 1.0)
ball.delta_location = (0.0, 0.0, 0.5)
ball.delta_rotation_quaternion = (0.95, 0.0, 0.0, 0.3)
ball.delta_scale = (1.2, 1.2, 1.2)
ball.modifiers.new("Subdivision", "SUBSURF")

# Concave star n-gon (one face, 10 corners), axis-angle rotation, YXZ delta euler.
star_mesh = bpy.data.meshes.new("StarMesh")
star_points = [((1.0 if i % 2 == 0 else 0.4) * math.cos(i * math.pi / 5), (1.0 if i % 2 == 0 else 0.4) * math.sin(i * math.pi / 5), 0.0) for i in range(10)]
star_mesh.from_pydata(star_points, [], [list(range(10))])
star = link(bpy.data.objects.new("Star", star_mesh))
star.rotation_mode = "AXIS_ANGLE"
star.rotation_axis_angle = (0.7, 1.0, 0.0, 0.0)
star.location = (3.0, -3.0, 0.5)

# Collections: one visible, one hidden in the viewport.
props = bpy.data.collections.new("Props")
scene.collection.children.link(props)
hidden_collection = bpy.data.collections.new("HiddenProps")
props.children.link(hidden_collection)
hidden_collection.hide_viewport = True
link(bpy.data.objects.new("InHiddenCollection", cube_mesh), hidden_collection).location = (0.0, 5.0, 0.0)
pillar = link(bpy.data.objects.new("Pillar", cube_mesh), props)
pillar.rotation_mode = "YZX"
pillar.rotation_euler = (0.1, 0.2, 0.3)
pillar.location = (0.0, -4.0, 1.0)
pillar.delta_rotation_euler = (0.0, 0.0, 0.4)
link(bpy.data.objects.new("HiddenByFlag", cube_mesh), props).hide_viewport = True
eye_hidden = link(bpy.data.objects.new("HiddenByEye", cube_mesh), props)
eye_hidden.location = (5.0, 5.0, 0.0)

# Ground plane, flat.
plane_mesh = bpy.data.meshes.new("GroundMesh")
plane_mesh.from_pydata([(-8, -8, 0), (8, -8, 0), (8, 8, 0), (-8, 8, 0)], [], [[0, 1, 2, 3]])
link(bpy.data.objects.new("Ground", plane_mesh))

empty = link(bpy.data.objects.new("Marker", None))
empty.location = (-2.0, -2.0, 2.0)
empty.rotation_mode = "XZY"
empty.rotation_euler = (0.2, 0.4, 0.6)

for light_type, location, color, energy in (
    ("POINT", (4.0, 1.0, 5.0), (1.0, 0.9, 0.8), 800.0),
    ("SUN", (0.0, 0.0, 10.0), (1.0, 1.0, 0.95), 3.0),
    ("SPOT", (-4.0, -4.0, 6.0), (0.6, 0.7, 1.0), 1200.0),
    ("AREA", (0.0, 6.0, 4.0), (1.0, 1.0, 1.0), 400.0),
):
    light = bpy.data.lights.new(f"{light_type.title()}Light", light_type)
    light.color, light.energy = color, energy
    if light_type == "SPOT":
        light.spot_size, light.spot_blend = 0.9, 0.3
    if light_type == "AREA":
        light.size = 2.5
    obj = link(bpy.data.objects.new(f"{light_type.title()}", light))
    obj.location = location
    obj.rotation_euler = (0.6, 0.0, 0.8)

camera_data = bpy.data.cameras.new("CamData")
camera_data.lens, camera_data.sensor_width = 35.0, 36.0
camera_data.clip_start, camera_data.clip_end = 0.1, 200.0
camera = link(bpy.data.objects.new("Cam", camera_data))
camera.location = (12.0, -10.0, 8.0)
camera.rotation_euler = (math.radians(62), 0.0, math.radians(50))
scene.camera = camera

world = bpy.data.worlds.new("Sky")
world.color = (0.05, 0.1, 0.2)
scene.world = world

bpy.context.view_layer.update()
eye_hidden.hide_set(True)
bpy.context.view_layer.update()


def principled_values(material):
    if not material.node_tree:
        return None
    node = next((n for n in material.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    if node is None:
        return None
    return {"base_color": list(node.inputs["Base Color"].default_value), "metallic": node.inputs["Metallic"].default_value,
            "roughness": node.inputs["Roughness"].default_value}


view_layer = bpy.context.view_layer
truth = {
    "blender_version": list(bpy.app.version),
    "scene": {"name": scene.name, "camera": scene.camera.name, "world_color": list(world.color),
              "resolution": [scene.render.resolution_x, scene.render.resolution_y]},
    "objects": {o.name: {"type": o.type, "parent": o.parent.name if o.parent else None, "rotation_mode": o.rotation_mode,
                         "matrix_world": [list(row) for row in o.matrix_world], "visible": o.visible_get(),
                         "in_view_layer": o.name in view_layer.objects, "data": o.data.name if o.data else None,
                         "materials": [slot.material.name if slot.material else None for slot in o.material_slots]}
                for o in bpy.data.objects},
    "meshes": {m.name: {"positions": [list(v.co) for v in m.vertices], "faces": [list(p.vertices) for p in m.polygons],
                        "material_indices": [p.material_index for p in m.polygons], "smooth": [p.use_smooth for p in m.polygons],
                        "triangles": sum(len(p.vertices) - 2 for p in m.polygons)} for m in bpy.data.meshes},
    "materials": {m.name: {"diffuse_color": list(m.diffuse_color), "metallic": m.metallic, "roughness": m.roughness,
                           "principled": principled_values(m)} for m in bpy.data.materials},
    "lights": {l.name: {"type": l.type, "color": list(l.color), "energy": l.energy,
                        "spot_size": getattr(l, "spot_size", None), "spot_blend": getattr(l, "spot_blend", None),
                        "size": getattr(l, "size", None)} for l in bpy.data.lights},
    "cameras": {c.name: {"type": c.type, "lens": c.lens, "sensor_width": c.sensor_width, "sensor_fit": c.sensor_fit,
                         "clip_start": c.clip_start, "clip_end": c.clip_end} for c in bpy.data.cameras},
}

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{prefix}.blend"), compress=True)
with open(os.path.join(out, f"{prefix}.truth.json"), "w") as f:
    json.dump(truth, f, indent=1)
