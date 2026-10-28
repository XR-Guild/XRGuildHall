#!/bin/bash
# compress.sh in.glb out.glb  -> dedupe, prune, resize textures to 2048 max, WebP (q85), Draco geometry
# Pinned to gltf-transform v4 through npx: older global installs fail to load the Draco encoder.
set -e
gt() { npx -y @gltf-transform/cli@4 "$@" >/dev/null; }
in="$1"; out="$2"; tmp=$(mktemp -d)
gt dedup "$in" $tmp/a.glb
gt prune $tmp/a.glb $tmp/b.glb
gt resize $tmp/b.glb $tmp/c.glb --width 2048 --height 2048
gt webp $tmp/c.glb $tmp/d.glb --quality 85
gt draco $tmp/d.glb "$out"
rm -rf $tmp
