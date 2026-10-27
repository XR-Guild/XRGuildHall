"""
Export the pieces in xr-guild-hall-v3.blend back to headset-ready GLBs + manifest.json (round trip for artists).

  blender --background blender/xr-guild-hall-v3.blend --python blender/xr_export.py -- --out blender/export

For each object in the "Pieces" collection: one GLB, Y up, JPEG textures capped at 1024 px, no Draco, origin 0,0,0
(the piece's pivot). Placements are read back from the objects in the "World" collections (custom property
xrgh_asset), so moving or adding a linked duplicate in Blender moves or adds it in the manifest.
Validate after export: reimport, check triangle totals and texture sizes (printed at the end).
"""
import argparse, json, math, os, sys
import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser(); ap.add_argument('--out', default='blender/export'); ap.add_argument('--max-tex', type=int, default=1024)
args = ap.parse_args(argv)
OUT = os.path.abspath(args.out); os.makedirs(os.path.join(OUT, 'assets'), exist_ok=True)

# cap textures
for img in bpy.data.images:
    if img.size[0] > args.max_tex or img.size[1] > args.max_tex:
        s = args.max_tex / max(img.size); img.scale(max(1, int(img.size[0] * s)), max(1, int(img.size[1] * s)))

assets, placements, total = {}, [], 0
pieces = bpy.data.collections['Pieces']
for obj in pieces.objects:
    if obj.type != 'MESH': continue
    bpy.ops.object.select_all(action='DESELECT')
    pieces.hide_viewport = False; obj.hide_set(False); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    f = os.path.join(OUT, 'assets', obj.name + '.glb')
    bpy.ops.export_scene.gltf(filepath=f, use_selection=True, export_format='GLB', export_yup=True, export_image_format='JPEG', export_draco_mesh_compression_enable=False, export_apply=True)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons); total += tris
    assets[obj.name] = {'file': 'assets/' + obj.name + '.glb', 'bytes': os.path.getsize(f), 'triangles': tris}
    print(f'{obj.name}: {os.path.getsize(f)/1048576:.2f} MB, {tris} tris', flush=True)
pieces.hide_viewport = True

for o in bpy.data.objects:
    a = o.get('xrgh_asset')
    if not a or o.users_collection[0].name in ('Pieces', 'Collision'): continue
    x, y, z = o.location
    placements.append({'label': o.name, 'asset': a, 'group': o.get('xrgh_group', ''), 'position': [round(x, 3), round(z, 3), round(-y, 3)],
                       'rotationY': round(math.degrees(o.rotation_euler.z), 3), 'scale': [round(o.scale.x, 3), round(o.scale.z, 3), round(o.scale.y, 3)],
                       **({'hidden': True} if o.hide_render else {})})
json.dump({'name': 'XR Guild Hall V3 (from Blender)', 'units': 'metres, y up; rotationY in degrees about +y', 'assets': assets, 'placements': placements},
          open(os.path.join(OUT, 'manifest.json'), 'w'), indent=2)
print(f'done: {len(assets)} pieces, {len(placements)} placements, {total} triangles; max texture {args.max_tex}px', flush=True)
