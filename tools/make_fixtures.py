"""Writes .blend fixtures plus Blender's own view of them (truth JSON) for the parser tests.

Run headless: Blender -b --factory-startup --python tools/make_fixtures.py -- <out_dir> <prefix>
"""
import json
import os
import sys

import bpy

out, prefix = sys.argv[sys.argv.index("--") + 1:][:2]
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "ProbeScene"
scene.frame_start, scene.frame_end = 7, 42
scene.render.resolution_x, scene.render.resolution_y = 640, 360

bpy.ops.mesh.primitive_cube_add(location=(1.0, 2.0, 3.0))
cube = bpy.context.active_object
cube.name = "ProbeCube"
cube.data.name = "ProbeMesh"
cube.scale = (0.5, 0.5, 0.5)
mat = bpy.data.materials.new("ProbeMaterial")
mat.diffuse_color = (0.25, 0.5, 0.75, 1.0)
cube.data.materials.append(mat)

bpy.ops.object.empty_add(location=(-4.0, 0.0, 0.5))
bpy.context.active_object.name = "ProbeEmpty"

truth = {
    "blender_version": list(bpy.app.version),
    "file_version": bpy.app.version_file[0] * 100 + bpy.app.version_file[1],
    "scene": {"name": scene.name, "frame_start": scene.frame_start, "frame_end": scene.frame_end,
              "resolution_x": scene.render.resolution_x, "resolution_y": scene.render.resolution_y},
    "objects": {o.name: {"type": o.type, "location": list(o.location), "scale": list(o.scale),
                         "data": o.data.name if o.data else None} for o in bpy.data.objects},
    "meshes": {m.name: {"vertices": len(m.vertices), "faces": len(m.polygons),
                        "positions": [list(v.co) for v in m.vertices],
                        "materials": [x.name for x in m.materials]} for m in bpy.data.meshes},
    "materials": {m.name: {"diffuse_color": list(m.diffuse_color)} for m in bpy.data.materials},
}

for suffix, compress in (("", False), ("_zstd", True)):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{prefix}{suffix}.blend"), compress=compress)
with open(os.path.join(out, f"{prefix}.truth.json"), "w") as f:
    json.dump(truth, f, indent=1)
