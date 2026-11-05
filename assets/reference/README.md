# Reference assets

Source models, images and a prototype script uploaded by the team. The Guild Hall build does not load anything in this folder; the app's shipped assets live in `guild-hall-library/public/`.

The models are Tripo generations (each file's glTF generator is `Tripo`). For licensing, see [`NOTICE.md`](../../NOTICE.md).

| File | Originally uploaded as | Added | Shipped version |
|---|---|---|---|
| `furniture/green-velvet-sofa.glb` | `green+velvet+sofa+3d+model.glb` | 2026-10-25 | `guild-hall-library/public/arrival/models/greenvelvetsofa3dmodel.glb` |
| `furniture/velvet-sofa.glb` | `velvet+sofa+3d+model.glb` | 2026-10-25 | `guild-hall-library/public/arrival/models/velvetsofa3dmodel.glb` |
| `furniture/velvet-sofa-1.glb` | `velvet+sofa+3d+model (1).glb` | 2026-10-25 | `guild-hall-library/public/arrival/models/velvetsofa3dmodel_1.glb` |
| `furniture/armillary-sphere.glb` | `armillary+sphere+3d+model.glb` | 2026-10-25 | `guild-hall-library/public/arrival/models/armillarysphere3dmodel.glb` |
| `furniture/art-nouveau-bookshelf.glb` | `art nouveau bookshelf 3d model.glb` | 2026-08-06 | None |
| `furniture/art-nouveau-bookshelf-1.glb` | `art nouveau bookshelf 3d model (1).glb` | 2026-08-06 | None |
| `furniture/art-nouveau-bookshelf-3.glb` | `art nouveau bookshelf 3d model 3.glb` | 2026-08-06 | None |
| `furniture/art-nouveau-bookshelf-holo.glb` | `art nouveau bookshelf 3d model holo.glb` | 2026-08-06 | None; same mesh and material as `art-nouveau-bookshelf-1.glb` |
| `furniture/ornate-bookshelf.glb` | `ornate bookshelf 3d model.glb` | 2026-08-06 | None |
| `buildings/modern-house.glb` | `modern house 3d model (2).glb` | 2026-08-06 | None |
| `images/image_0.png` | `image_0.png` | 2026-08-06 | None |
| `images/tripo-share-c0ae79b5-….png` | same name | 2026-08-06 | None |
| `scripts/library-artifacts.mjs` | `library-artifacts.mjs` | 2026-10-25 | None; a PlayCanvas prototype of procedural shelf artifacts |

Each shipped version has the same triangle count and Tripo material ID as its source, compressed with Draco and WebP.

All files were uploaded by Evo. Run `git log --follow <file>` for the full history of any file.
