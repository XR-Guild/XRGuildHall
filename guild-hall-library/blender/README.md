# Blender files (V3)

| File | What it is |
|---|---|
| `xr-guild-hall-v3.blend` | The whole V3 world, assembled from the pieces: 54 pieces, 133 placements, in metres, Z up. |
| `pieces/` | The same world as movable GLB pieces + `manifest.json` (layout: position, rotation, scale, group). The Arrival.space upload uses these too. |
| `build_scene.py` | Rebuilds the `.blend` from `pieces/` (re-run after any re-export). |
| `xr_export.py` | Round trip: exports the pieces back out of the `.blend` as headset-ready GLBs + manifest. |

## How the .blend is organised

- **Pieces** (hidden): one mesh object per piece. Edit a piece here and every placed copy updates.
- **World**: collections per group (Architecture, Guild Hall, Hall benches, Library, Library chairs, Colonnade vines, Garden, Garden benches, Garden lanterns, Portal sites, Trees, Flower beds, Grounds). Each object is a linked duplicate of a piece, with custom properties `xrgh_asset` and `xrgh_group`.
- **Collision** (hidden): walk-on and wall meshes for the big pieces.
- *Colonnade ivy with jasmine* is placed but hidden, as in the Arrival build.
- Spawn camera at the arrival point; a moon light and a night world colour. Skies are not in the .blend: the world's four skies live in `public/skies/` (Aurora is procedural in `src/sky.ts`).

The media screens carry the idle XR Guild slide as an emissive texture, and the boards carry the Principles and Code of Conduct text. Water uses a plain glossy stand-in material (the rippling water is a shader in the web build).

## Rebuild or round trip

```bash
# from guild-hall-library/
npm run dev &                                        # the export reads the live source
OUT=blender/pieces node tools/arrival-export.mjs     # web world  -> GLB pieces + manifest
blender --background --python blender/build_scene.py -- --pieces blender/pieces --out blender/xr-guild-hall-v3.blend
blender --background blender/xr-guild-hall-v3.blend --python blender/xr_export.py -- --out blender/export   # .blend -> GLBs
```

Without the Blender app, `pip install bpy` in a Python 3.11 venv runs the same scripts (`python blender/build_scene.py --pieces … --out …`).

## Notes

- Source of truth: the web world in `src/` builds the geometry. Edits made only in Blender are not picked up by the web build; use the round trip for Arrival.space and other GLB platforms, or port changes back into `src/`.
- `xr_export.py` caps textures at 1024 px for headsets (Quest 3/3S). The pieces exported from the web build keep up to 2048 px.
- Credits: the Guild Hall art and design are Evo Heyning's, for the XR Guild. See `NOTICE.md` at the repo root.
