# Guild Hall Library · pilot build

An immersive WebXR rotunda for the XR Guild: the main hall with the Connect table, the Library apse, and the garden with its reflecting pool under an aurora sky. It runs in any modern browser (desktop, phone, and Quest/Pico/other WebXR headsets) with no install.

Built with Meta's open-source **Immersive Web SDK** (`@iwsdk/core`, MIT) on three.js. Pilot build, September 2026.

## What's inside

| Space | What you can do |
|---|---|
| **Main hall** | 12-sided rotunda: labradorite columns with lily capitals, Nouveau tracery windows, walnut bookcases, a painted dome (Past · Present · Future) with a glass oculus, and the frieze *Past · More Human / Present · More Connected / Future · More Real*. |
| **Connect table** | Labradorite, walnut and gilt table with a glowing era ring. Six period devices (1838 stereoscope to 2023 AI glasses) sit on plinths. In VR you can pick them up; they return to their plinth when you let go. An illustrative model of the **Meta VR Glasses** floats in the hologram with its spec callouts. |
| **News easel** | Meta Connect 2026 briefing: sourced specs, discrepancies flagged, what Meta hasn't disclosed, and questions for builders, ethics, and business. |
| **Timeline easel** | The XR Guild's community **Timeline of XR** (209 entries, 1800s–2026): browse by decade and category, open an entry, follow related entries. |
| **Library apse** | Search the 225 works in [library.xrguild.org](https://library.xrguild.org) by category and topic, open an entry, and save it to a reading list. Nine crystal lanterns each open one library category. |
| **Garden** | Reflecting pool, cypress rows, lanterns, flower beds, marble benches, and a white colonnade at the far end. |

The 2D guide (desktop and phone) mirrors all of it: **Connect news**, **Library** search with filters, **Timeline** with a decade spine, **Ask** (library-grounded answers), and **Reading list**.

## Run it

```bash
cd guild-hall-library
npm install
npm run dev          # http://localhost:5173 , IWER emulates a headset in desktop Chrome
npm run build        # → dist/  (static site, relative paths)
npm run preview      # serve dist/ locally
```

Needs Node 20.19+. `dist/` is committed prebuilt, so you can also host it without installing anything.

## Publish to a short URL

`dist/` is a plain static site. WebXR needs **HTTPS**.

- **GitHub Pages** – Pages can only serve a repo root or `/docs` from a branch, so use the small Action in [`DEPLOY.md`](DEPLOY.md). Once a maintainer adds it, it publishes this folder's `dist/`.
- **Custom short domain** (for example `hall.xrguild.org`): add a `CNAME` record pointing to the Pages or Netlify host, and put the domain in the host's settings.
- **Netlify / Vercel / Cloudflare Pages** – drag and drop `dist/`, or connect the repo with build command `npm run build` and output `guild-hall-library/dist`.

## Viverse and other platforms

- **Viverse / RP1 (zip upload):** zip the *contents* of `dist/` (index.html at the zip root) and upload. The build uses relative paths, so it runs from any sub-path.
- **Pico / Meta developer portals:** the same `dist/` zip.
- The two uploaded designs are plain glTF (`public/models/*.glb`), so any engine can reuse them.

## Controls and comfort

- **Desktop:** drag to look, WASD or arrows to walk, Q/E to turn, double-click the floor to move there, click objects and panels.
- **Phone:** drag to look, double-tap the floor to move, tap objects. The **Walk to** buttons jump to each space.
- **VR:** thumbstick teleport and **45° snap turn** by default. Point and trigger (or pinch) at panels. Squeeze or pinch to pick up devices.
- **Comfort rating: Comfortable.** No forced camera motion. Walk-to jumps fade instead of gliding. The Comfort menu lets you reduce motion, stop the aurora, and turn off mirror reflections. `prefers-reduced-motion` is honored.

## XR Guild principles checklist

- [x] Teleport + snap turn default; smooth slide only on request
- [x] No strobing; ambient animation can be stopped
- [x] Every interactive panel works with a single trigger, pinch, click, or tap. Text sized for 1 m+ reading.
- [x] **Privacy:** no accounts, analytics, cookies, or tracking. Position, gaze, and hand data never leave the device. The reading list is stored only in the viewer's browser.
- [x] **Ask** only runs when the visitor presses Ask, and says where the answer comes from
- [x] Open formats (glTF, WebXR, plain JSON data), reachable by URL
- [x] News is sourced line by line, with conflicting figures flagged. The glasses model is labeled *illustrative, not an official render*.
- [ ] Seated-reach audit **in headset** by a second volunteer (definition of done)
- [ ] Gaze-dwell selection for users without controllers or hand tracking (next task)

## How it's built

```
guild-hall-library/
├── index.html            2D shell: loading screen, guide drawer, tours
├── src/
│   ├── main.ts           boots the IWSDK World, builds the scene, per-frame system
│   ├── rotunda.ts        walls, windows, columns, bookcases, frieze, dome, chandelier
│   ├── table.ts          the Connect table, device lineage, VR Glasses hologram
│   ├── library3d.ts      Library apse (encloses the Tripo library model) + category lanterns
│   ├── garden.ts         reflecting pool, trees, benches, lanterns, colonnade
│   ├── sky.ts            aurora + stars, rendered to a cube one face per frame
│   ├── tex.ts / mats.ts  procedural labradorite, walnut, mosaic, mural, frieze textures
│   ├── panel.ts          clickable canvas panels (the same code serves mouse, touch, and XR rays)
│   ├── xrpanels.ts       News, Library, and Timeline panels
│   ├── interact.ts       one raycast path for mouse, touch, controllers, and hands
│   ├── ui.ts / style.css the 2D guide
│   ├── search.ts         library search index
│   ├── timeline.ts       timeline search and eras
│   ├── bake.ts           merges static meshes by material (keeps headset draw calls low)
│   └── data/             library.json, timeline.json, news.ts
├── public/models/        library.glb (Tripo fantasy library), hall.glb (ornate colonnade)
├── scripts/refresh-data.py   re-pull library + timeline snapshots
├── proxy/ask-worker.js   optional Cloudflare Worker for the library's GitBook "ask" endpoint
└── dist/                 prebuilt static site
```

**World as data:** library works, timeline entries, and the news briefing are JSON or TypeScript data files. Update them without touching rendering code. Run `python3 scripts/refresh-data.py` to re-pull the library and timeline.

**Performance:** static meshes are merged per material, the aurora renders at most one cube face per frame (every other frame in VR), and mirror reflections switch off in VR and on phones. The heavy IWSDK spatial-UI fonts and the Havok physics runtime are stubbed out of the bundle (`src/stubs/`) because this world doesn't use them. JS is about 1.9 MB (520 KB gzipped); the models are about 8.7 MB.

## Ask the Library

- **Self-hosted:** Ask links out to the library's own GitBook assistant. To answer inline, deploy [`proxy/ask-worker.js`](proxy/ask-worker.js), because GitBook's endpoint does not send CORS headers. Then build with `VITE_ASK_PROXY=https://<your-worker>.workers.dev npm run build`, and set `ALLOWED_ORIGINS` in the worker to your domain.
- **Claude artifact preview:** Ask uses the visitor's own Claude account to answer from the library and timeline snapshots, with citations.

## Open decisions for the team

- **Multiplayer:** this pilot is single-visitor. Presence and voice need a networking layer (see the repo's `needs-decision` issue). Add a code of conduct, mute/block, and moderation before shared voice.
- **Engine:** this pilot votes for IWSDK/three.js with data-driven content. Port notes for Babylon.js are welcome.
- **12 pillars as program doorways** (`PROGRAMS.md`): the 12 columns are ready to carry program plaques and portals.

## Punch-list items this pilot covers

Architectural: columns, archways, floors, ceilings (dome). Production spaces: library elements, immersive library research viewer, search → library, tables and benches. Interactive: search → XR releases (Connect news), principles checklist. Content: **XR Timeline**. Gardens: reflecting pool, trees, bench by pool, flowers.

## Credits

- Design direction, concept art, and the Tripo 3D models: **Evo** (Realitycraft) for the XR Guild
- Library data: [XR Guild Library](https://library.xrguild.org) volunteers
- Timeline data: the XR Guild community [Timeline of XR](https://www.xrguild.org/timeline), inspired by Avi Bar-Zeev's original XR terminology list
- Connect 2026 news: UploadVR, Road to VR, Engadget, VR.org, Tom's Guide, Hypebeast, Meta (linked line by line in the app)
- Built with the [Immersive Web SDK](https://github.com/facebook/immersive-web-sdk) (MIT) and [three.js](https://threejs.org) (MIT)
