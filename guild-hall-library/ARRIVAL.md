# XR Guild Hall for Arrival.space (infinite space)

This folder is the Guild Hall v3 world split into **48 movable pieces** (GLB files) with a layout of **127 placements**. Every piece is built around its own pivot point, so when you drag a bench, tree or lantern in the Arrival editor, it moves and turns the way you'd expect.

## What's in here

| Folder or file | What it is |
|---|---|
| `assets/` | The GLB pieces. Large pieces (Guild Hall, Library, colonnade, stage, desk, Connect table, pool, lawn, folly) also have a simple `-collision.glb` so people can walk on floors and not through walls. |
| `manifest.json` | The layout: each placement's label, which GLB it uses, position (metres), rotation (degrees around the vertical axis), scale, and group. |
| `preview/` | Renders of the pieces reassembled from these files (plan, aerial, hall, library, dome). |

**Movable pieces by group**

- **Architecture:** Guild Hall (with the mission banner), Library (with the News, Library search and Timeline panels as still images), colonnade.
- **Guild Hall:** stage, welcome desk, events board, plus **52 curved green-velvet benches** (proscenium default, each its own entity).
- **Library:** Connect table, category lanterns, 15 chairs.
- **Garden:** reflecting pool, garden folly (your white colonnade), 2 marble benches, 8 pool lanterns, 3 portal pads, 8 maples, 16 cypress, 11 flower beds.
- **Grounds:** lawn, distant hills and forest.

Total size is about 48 MB. The largest file is the Guild Hall at 9.4 MB (the Arrival limit is 25 MB per file).

## Steps on your Mac (Terminal)

You'll only need Terminal for three things: installing the Arrival CLI, signing in, and the final push. Your sign-in key stays on your Mac (`~/.arrival/config.json`), and Claude never sees it.

**1. Install the Arrival CLI (once).** Needs Node 18 or newer (`node -v` to check).

```bash
cd ~/Documents/Claude/Projects/XRGuide
git clone https://github.com/arrival-space/arrival-plugins.git
cd arrival-plugins/tools/arrival-cli
npm install
npm link
```

If `npm link` asks for permissions, run `npx arrival` in place of `arrival` in the steps below.

**2. Sign in.** This opens your browser.

```bash
arrival login
```

**3. Create the space as a private infinite space and pull it into this folder.**

```bash
cd ~/Documents/Claude/Projects/XRGuide/XRGuildHall-arrival
arrival create "XR Guild Hall" --type infinite --privacy Closed --pull --dir workspace
```

It stays **Closed** (private) while we build. Open it later when the Guild is ready.

**4. Tell Claude it's pulled.** Claude will copy the pieces into `workspace/space/assets/` and write one entity file per placement into `workspace/space/entities/`, plus a spawn point by the welcome desk.

**5. Check and publish.**

```bash
cd ~/Documents/Claude/Projects/XRGuide/XRGuildHall-arrival/workspace
arrival validate
arrival push
```

`arrival push` takes a snapshot first, so a bad push can be undone in the app.

## Moving furniture, then keeping your layout

1. Open the space in Arrival, go into the editor, and move benches, lanterns, trees and portal pads where you want them.
2. In Terminal, in the `workspace` folder, run `arrival pull` to bring your positions back to these files.
3. Tell Claude. Claude can copy the new garden layout back into the Guild Hall source (`site.ts`) so the VIVERSE build matches.

Two things to know: push is last-writer-wins, so pull before asking Claude to change anything, and don't push while someone else is editing the same space.

## What's different from the VIVERSE build

- **Lighting:** Arrival lights the space its own way. The chandeliers, stained glass, lanterns and panels keep their glow (emissive), but the hall's point lights and the aurora sky are not in the files. We can tune the Arrival sky and lights together.
- **Panels are still images.** The Join panel, notice board, News, Library search and Timeline show a snapshot. Links to xrguild.org and Join could become Arrival Gates or a small plugin later.
- **Voice:** Arrival's built-in voice is a group broadcast, not spatial. The separated-audio colonnade still helps with sight lines, but voices won't fade with distance there.
- **Not included:** the simulated crowd, seating presets (only the proscenium benches are placed), the hologram cone above the Connect table, lantern name labels, and the water's live reflections.

## Regenerate

In the Guild Hall source: start `npx vite`, then run `node tools/arrival-export.mjs` (writes `arrival-export/`). The exporter is `src/export.ts`.
