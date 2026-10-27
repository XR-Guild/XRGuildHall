# Viverse submission kit

**V3:** build the upload with `npm run viverse-zip` → `guild-hall-v3-viverse.zip` (the contents of `dist/`, with `index.html` at the zip root, plus `guildhall.config.json` you can edit inside the zip). Step by step, settings and open decisions: [V3.md](V3.md).

Files: `docs/viverse/` (thumbnail, 720p trailer) and `docs/images/` (gallery, 1280×720; V3 views in `docs/images/v3/`). The 1080p trailer (14 MB) and 1920×1080 gallery are kept out of git to save space; ask Evo for them. The Immersive X walkthrough trailer (45 s and 5 s, Oct 2026) can replace the v2 trailer: ask Evo for the files.

Viverse Studio asks for a **Thumbnail**, an optional **Trailer**, and optional **Gallery** images, but its docs don't publish exact sizes for them. These files use safe web defaults: 16:9, 1920×1080 JPEG, and H.264 MP4 without audio. If Studio rejects a size, the 1280×720 versions are included too.

## Listing copy (draft, edit before submitting)

**Title:** XR Guild Hall

**Short description:** A volunteer-built guild hall for the XR community: meet on the stage, join the Guild at the welcome desk, and walk the labradorite colonnade to a library of XR ethics and history.

**Description:**
The XR Guild Hall is a browser-native home for the XR Guild, a volunteer-run nonprofit of spatial computing professionals who care about ethical outcomes. Arrive in a twelve-sided hall with Gothic arches, gilt Art Nouveau windows, and labradorite columns. Join the Guild at the welcome desk, check upcoming events on the notice board, and gather around the walnut stage. An open labradorite colonnade leads through the garden to the Library. There you can search 225 works on XR ethics, privacy, safety, and research, walk 209 moments on the Timeline of XR, and read the Meta Connect 2026 briefing at the Connect table. Outside, maples and a reflecting pool sit under the aurora.

Comfortable: teleport and snap turn by default, no forced camera motion. When you join others, your mic stays off until you turn it on, and you can mute or block anyone. Talks and launches play on the big screen above the stage, and you can choose your own sky: aurora, blue sky, meteors or sunset.

**Tags:** XR Guild, library, education, ethics, history of VR, timeline, WebXR, art nouveau, community

**Comfort:** Comfortable

**Controls:** Desktop: drag to look, WASD to walk, click objects and chairs. Mobile: drag to look, tap. VR: teleport, snap turn, point and trigger or pinch.

**Credits:** Design direction and 3D models by Evo (Realitycraft) for the XR Guild. Library data from library.xrguild.org volunteers. Timeline from the XR Guild community Timeline of XR. Built with the Immersive Web SDK and three.js.

## Before publishing the multiplayer version

- [ ] App ID from VIVERSE Studio, set as `VITE_VIVERSE_APP_ID` at build time
- [ ] Microphone permission requested for the world in VIVERSE Studio (needed for voice)
- [ ] Photon Voice App ID set as `VITE_PHOTON_APP_ID`, and the Photon SDK files in `public/photon/` before building
- [ ] New trailer and thumbnail: the current ones show the pilot layout

## Gallery order (v2)

1. v2-01-hall-stage
2. v2-02-welcome-desk
3. v2-05-library
4. v2-04-colonnade
5. v2-07-garden-pool
6. v2-06-library-shelves
7. v2-03-cabaret
8. v2-08-maples
9. v2-09-aerial
