"""
Build the XR Guild Hall V3 Blender scene from the GLB pieces and manifest.json.

  # Blender 4.2+ / 5.x, from the guild-hall-library folder:
  blender --background --python blender/build_scene.py -- --pieces blender/pieces --out blender/xr-guild-hall-v3.blend

  # or headless with pip bpy (Python 3.11):  python blender/build_scene.py --pieces ... --out ...

What it makes:
  - one mesh object per piece (all of a piece's materials joined into one object), kept in the hidden "Pieces" collection
  - every placement from manifest.json as a linked duplicate (shares the piece's mesh), in a collection per group
    ("Architecture", "Guild Hall", "Hall benches", "Garden", "Colonnade vines" ...), so moving a bench moves one bench
    and editing a piece's mesh updates every copy
  - collision meshes in the hidden "Collision" collection
  - a camera at the spawn point, a sun, and a night-sky world colour
Pieces flagged hidden in the manifest (ivy with jasmine) are placed but hidden, as in the Arrival build.

Coordinates: the manifest is three.js (metres, +Y up). Blender is +Z up: (x, y, z) -> (x, -z, y), and a rotation
about +Y becomes the same rotation about +Z. Re-run this script after any re-export: it rebuilds the scene from scratch.
"""
import argparse, json, math, os, sys
import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument('--pieces', default='blender/pieces', help='folder with manifest.json and assets/')
ap.add_argument('--out', default='blender/xr-guild-hall-v3.blend')
args = ap.parse_args(argv)
ROOT = os.path.abspath(args.pieces)
man = json.load(open(os.path.join(ROOT, 'manifest.json')))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'XR Guild Hall V3'
scene.unit_settings.system = 'METRIC'

def coll(name, parent=None, hide=False):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in (parent or scene.collection).children: (parent or scene.collection).children.link(c)
    c.hide_render = hide; c.hide_viewport = hide
    return c

pieces_c = coll('Pieces', hide=True)
collision_c = coll('Collision', hide=True)
world_c = coll('World')

def import_piece(path, name, into):
    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=path)
    new = [bpy.data.objects[n] for n in set(bpy.data.objects.keys()) - before]
    meshes = [o for o in new if o.type == 'MESH']
    others = [o.name for o in new if o.type != 'MESH']  # record names before joining: references go stale after join()
    if not meshes:
        for n in others: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    # bake parent transforms into the meshes, then join into one object per piece
    for o in meshes:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1: bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    for n in others:
        if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    for c in list(obj.users_collection): c.objects.unlink(obj)
    into.objects.link(obj)
    obj.name = name; obj.data.name = name  # name last, after cleanup, so it doesn't end up "name.001"
    return obj

pieces = {}
for key, a in man['assets'].items():
    obj = import_piece(os.path.join(ROOT, a['file']), key, pieces_c)
    if obj: pieces[key] = obj
    if a.get('collision'):
        col = import_piece(os.path.join(ROOT, a['collision']), key + '-collision', collision_c)
        if col: col.display_type = 'WIRE'
    print('piece', key, 'ok' if obj else 'EMPTY', flush=True)

def to_blender(p):
    x, y, z = p
    return (x, -z, y)

for pl in man['placements']:
    src = pieces.get(pl['asset'])
    if not src: continue
    g = coll(pl['group'], world_c)
    o = src.copy()  # linked duplicate: shares the mesh
    o.name = pl['label']
    o.location = to_blender(pl['position'])
    o.rotation_euler = (0, 0, math.radians(pl['rotationY']))
    sx, sy, sz = pl['scale']
    o.scale = (sx, sz, sy)
    g.objects.link(o)
    if pl.get('hidden'): o.hide_set(True); o.hide_render = True
    o['xrgh_asset'] = pl['asset']; o['xrgh_group'] = pl['group']

# spawn camera, sun, world
sp = man['spawn']
cam = bpy.data.objects.new('Spawn camera', bpy.data.cameras.new('Spawn camera'))
cam.location = to_blender([sp['position'][0], 1.7, sp['position'][2]])
look = to_blender(sp['lookAt'])
d = (look[0] - cam.location.x, look[1] - cam.location.y, look[2] - cam.location.z)
cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
cam.data.lens = 24
world_c.objects.link(cam); scene.camera = cam
sun = bpy.data.objects.new('Moon', bpy.data.lights.new('Moon', 'SUN'))
sun.data.energy = 1.5; sun.data.color = (0.66, 0.76, 1.0); sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
world_c.objects.link(sun)
w = bpy.data.worlds.new('Aurora night'); scene.world = w
w.use_nodes = True
bg = w.node_tree.nodes.get('Background')
if bg: bg.inputs[0].default_value = (0.012, 0.03, 0.045, 1); bg.inputs[1].default_value = 1.0
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items.keys() else scene.render.engine
scene['xrgh_manifest'] = json.dumps({k: man[k] for k in ('name', 'generated', 'units')})

os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.out), compress=True)
print('saved', args.out, len(pieces), 'pieces', len(man['placements']), 'placements', flush=True)
