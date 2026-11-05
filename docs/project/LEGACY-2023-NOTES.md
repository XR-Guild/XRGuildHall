# What We Learned from the 2023 Prototype

A retrospective on the first XR Guild Hall attempt, kept so the new build inherits the
lessons without re-learning them. Read once before you start; it will save a few dead ends.

**Source:** https://github.com/codefrau/xrguildhall — a single "Initial commit," dated
**Sept 1, 2023**. Croquet Microverse world, v0.7.6.

---

## TL;DR

The 2023 prototype was a **fresh Microverse scaffold, not a finished hall** — a placeholder
ground plane and a lighting setup, nothing more. Its real value is what it teaches:
a stack decision, a portable lighting rig, a proven catalog of interaction patterns, and
one clear reason "pillars as data" is the right instinct. We are **not** continuing on
Microverse.

---

## The decision it informed

**New direction: WebXR-native.** Interaction design and RTMP baked into the browser, with
the world portable to [Viverse](https://www.viverse.com/) and RP1's open-metaverse browser
down the line.

Why this over continuing on Microverse:

- **Portability** is the whole point. A WebXR + browser base (three.js / Babylon.js) is the
  most neutral foundation for also running inside Viverse and RP1, which are browser-based.
  Microverse would have locked the world to Croquet's runtime.
- **Control.** Interaction and streaming live in our own code, not inside a framework's card
  system.

The one thing Microverse's data-driven "cards + behaviors" model got right — **describe the
world as data, not hand-coded scenes** — we should carry forward deliberately: glTF/GLB
scene assets plus a declarative config for pillars and touchpoints. That directly serves the
PROGRAMS.md directive to "keep pillars as data so they're assigned without re-modeling," and
it's also what makes a world portable across host platforms.

---

## What the new stack has to re-solve (that Microverse gave us for free)

Leaving Microverse means consciously replacing things it handled invisibly. Don't discover
these late:

- **Multiplayer sync.** Microverse's reflector gave deterministic, synchronized multiplayer
  out of the box. WebXR has none. Pick a networking approach early — WebRTC/WebSocket, a
  service, or a sync layer — because it shapes the whole architecture. This is the single
  biggest capability we're giving up by switching, so treat it as a first-class decision.
- **RTMP in the browser.** Browsers do **not** play RTMP natively. Plan the path: RTMP is
  fine for *outbound* broadcast (streaming the mixed-reality view to YouTube/Twitch), but for
  *inbound* live video into the world you'll likely ingest RTMP and transcode to HLS or
  WebRTC for playback. Decide which direction "RTMP for live mixed reality" means for each
  touchpoint and design the pipeline accordingly.
- **Avatars, movement, and mobile controls.** Microverse shipped an avatar rig, walk/run/idle
  animations, and a joystick for touch. All need a WebXR-native equivalent.

---

## Portable / reusable

- **Lighting rig** (`behaviors/default/lights.js` in the old repo). A well-tuned three.js
  setup: ambient + a shadow-casting sun with proper shadow-camera bounds, blue/red rim lights
  for depth, and an HDR image-based-lighting loader (PMREM). three.js is the likely engine for
  our WebXR base, so this transfers with light adaptation. A good default to start from rather
  than re-deriving.
- **Generic assets:** an avatar (`newwhite`) with idle/walk/run animations, Poppins + Roboto
  fonts, a mobile joystick CSS. Usable placeholders, but none of the Guild house style
  (gold tracery on dark, Marcellus SC) exists yet — that's all still to build.

---

## Interaction patterns proven (now a build spec, not code)

Microverse's stock behaviors won't port, but they map cleanly onto our punch list and serve as
a checklist of interactions to implement WebXR-native:

| Old Microverse behavior | Our touchpoint |
|---|---|
| `pdfview` | Immersive Library research viewer |
| `menu` / `propertySheet` | Pillar panels — Learn / Join / Enter |
| `billboard` | Pillar plaques / sigils that face the viewer |
| `video` | YouTube / RTMP / stage screens |
| `pedestal` | Library artifacts on display |
| `scrollableArea` | Glossary / library topic lists |
| `dragAndDrop` | Asset import (pairs with the 3D asset generator) |

---

## Security note

The old repo committed `apiKey.js` and `apiKey-dev.js` (its `.gitignore` only covered
`node_modules`), exposing Croquet production and dev keys. Two actions:

1. **Treat those keys as compromised** and rotate/retire them.
2. In this repo, add secrets to `.gitignore` from day one and keep keys in environment
   variables or an untracked local config — never committed.

---

## Open decisions this creates

Track these as `needs-decision` issues on the board:

- **Engine:** three.js vs. Babylon.js (both do WebXR; Babylon has heavier built-in tooling).
- **Multiplayer/networking layer** (see above).
- **RTMP pipeline direction** — inbound (ingest→WebRTC/HLS) and/or outbound broadcast.
- **Portability targets** — confirm Viverse and RP1 content requirements before locking
  scene/asset conventions.
