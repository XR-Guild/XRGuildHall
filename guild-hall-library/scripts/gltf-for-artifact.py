"""Repackage public/models/*.glb as glTF JSON (buffers embedded) + image files in artifact/models/.
Run after: npx gltf-transform copy public/models/<name>.glb scratch/gltf/<name>.gltf"""
import json, base64, os, shutil
os.makedirs('artifact/models', exist_ok=True)
for n in ['library', 'hall']:
    g = json.load(open(f'scratch/gltf/{n}.gltf'))
    for b in g['buffers']:
        b['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(open('scratch/gltf/' + b['uri'], 'rb').read()).decode()
    for im in g.get('images', []):
        new = f"{n}-{os.path.basename(im['uri'])}"
        shutil.copy('scratch/gltf/' + im['uri'], 'artifact/models/' + new); im['uri'] = new
    json.dump(g, open(f'artifact/models/{n}.json', 'w'))
