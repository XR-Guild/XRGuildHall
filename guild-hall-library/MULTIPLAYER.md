# Multiplayer plan: VRM avatars, chat, and spatial voice for 100+ people

> **V3 update (Oct 2026):** voice is Photon Voice (merged from `spike/photon-voice`). New in V3: audio modes (Conversation, Large group, Stage spotlight) and admin spotlight ([docs/AUDIO.md](docs/AUDIO.md)); verified admins and shared room settings ([docs/ADMIN.md](docs/ADMIN.md)); a LiveKit media room for stream screens and screenshare, video only ([docs/MEDIA.md](docs/MEDIA.md)). Room sizes are now configurable (`photonMaxPlayers`, `viverseRoomCap`) instead of fixed at 120. Hall seating presets are now Benches (backless), Small group tables and Open floor.

Status: **built and tested with a simulated crowd of 100** (`?sim=100`). Live multiplayer needs three things from the Guild before it can run for real (see "What we need" at the end).

## Decision: one connected world, not two linked rooms

The Guild Hall and the Library stay **one VIVERSE world** with a colonnade between them. Inside it, the network is split into **zones** (hall, library, colonnade, garden) so each visitor only pays for the people near them.

| Question | One world with zones (chosen) | Two linked VIVERSE worlds |
|---|---|---|
| Download size | The whole world is about 2.5 MB of code (0.7 MB compressed) plus a 0.2 MB model; everything else is generated on the device. Loading both rooms costs almost nothing extra. | Each room still loads the same engine code, so you pay it twice. |
| What limits 100+ people | Avatars, voice, and network traffic. Zones handle all three. | Same limits, plus a loading screen between rooms. |
| Moving between rooms | Walk through the colonnade. People can follow each other. | The VIVERSE docs do not describe portals between standalone worlds, so friends get split up. |
| Hosting | One VIVERSE App ID, one Photon app. | Two of each, and two listings to maintain. |

**Overflow:** each VIVERSE room is created with a 120-person cap (`src/net/viverse.ts`). When it is full, the next visitor opens `guild-hall-2`, then `guild-hall-3`, and so on. For big talks, a later step is to stream the stage into overflow rooms.

## Research summary: open-source options

| Need | Chosen | Why | Alternatives considered |
|---|---|---|---|
| Identity and avatar URL inside VIVERSE | **VIVERSE Login + Avatar SDK** (JS SDK 1.3.3) | Visitors are already signed in. `getProfile()` gives their display name and active `.vrm`, and `getAvatarFileWithSDK(url)` fetches it. | None needed. |
| Render VRM avatars | **@pixiv/three-vrm** 3.5.5 (MIT) | The standard VRM loader for three.js, and what VIVERSE's own open-source toolkit builds on. | **@pmndrs/viverse** (VIVERSE-sponsored, three.js and React Three Fiber): a full character controller with VRM and animation. It is a good source of animation clips later. We don't adopt it whole because the Hall already uses the Immersive Web SDK's locomotion. |
| Presence and chat inside VIVERSE | **VIVERSE Play SDK** (matchmaking + multiplayer `general` messages) | It is built into the platform, needs no server of ours, and the docs show rooms configured up to 1000 players. | Colyseus, Croquet/Multisynq, and Wonderland Cloud all need their own hosting. |
| Voice | **Photon Voice** (JavaScript SDK 4.4.0, Photon Cloud) | The VIVERSE docs describe no voice chat for standalone apps. Photon relays Opus streams with no server of ours; we decode each voice and play it through our own HRTF panner. Being tested as a spike: see [`docs/PHOTON-VOICE-SPIKE.md`](docs/PHOTON-VOICE-SPIKE.md). | LiveKit Cloud (used before the spike; needs a token worker), Agora and Daily (closed source), self-hosted mediasoup (more ops work). |
| Presence outside VIVERSE | Photon room events (same room as voice) | This lets the Hall run on its own domain with the same features. | |

## How it scales to 100+

- **Avatars** (`src/avatars.ts`): everyone is drawn as a tinted mannequin in **2 draw calls** total. Only the **nearest 12** people with a VRM get their real avatar, with a procedural idle, walk, and sit (the model is dropped 20 s after they move away). Nameplates and speaking rings show for the nearest 16, chat bubbles for the nearest 8.
- **Network** (`src/net/presence.ts`): about 10 updates per second while you move and 1 per second when still. Each update is a small JSON message with position, facing, zone, seat, and avatar URL. **No gaze, hand, or device data is shared.**
- **Voice** (`src/net/photon.ts`):
  - The mic is **off by default**.
  - You **hear at most 10 voices**: the closest people in your zone, plus anyone standing on the stage. Photon still delivers every open mic in the room, so the others are dropped on your device rather than on the server. The spike caps a room at 20 people (Photon's free plan).
  - Stage voices carry across the hall with a flat roll-off. Everyone else fades with distance using HRTF spatial audio (Web Audio PannerNode).
- **Headset budget**: only the chamber you are in keeps its lights on in VR, mirror floors are desktop-only, and foliage and chairs are instanced. The Hall view with 100 simulated people measured about 140 draw calls and 0.5 M triangles.

## Seating

Chairs are instanced and clickable: click or select a chair to sit, and walk away to stand. When you are connected, **only the host** can change the layout. Everyone's copy updates, and people seated in the old layout are stood up.

| Room | Presets | Seats |
|---|---|---|
| Guild Hall | Proscenium benches (curved, 3–4 per bench) · Cabaret tables · Open floor | 200 · 120 · 0 |
| Library | Round table (around the Connect table) · Reading circle · Seminar (facing the search shelf) | 15 each |

## Safety and consent (XR Guild principles)

- A code of conduct and consent screen appears before connecting, and it asks for a display name.
- The mic is off until you press **Mic**. Voice is not recorded by this world.
- **Mute** and **Block** are on every person in the People list. They apply on your device only. Blocking hides that person's avatar, voice, and chat for you.
- **Personal space bubble:** anyone within 0.6 m of you fades out.
- **Host controls:** change seating, and "ask the hall to mute" (this turns off the mic of everyone in the hall who is not on stage).
  - The host is the room's master client, on VIVERSE and in a Photon room.
  - Photon stamps the sender on every event, so off VIVERSE host messages can't be spoofed.
  - Known gap on VIVERSE: `general` messages don't carry a verified sender, so a determined user could spoof a host message. The impact is limited to seating layout and a mute request. A fix is to move host actions to a small server or onto Photon events.
- **Chat:** messages are capped at 280 characters, control characters are stripped, and there is no link preview.

## Set it up (for the maintainer)

1. **VIVERSE App ID:** create an app in VIVERSE Studio, then build with `VITE_VIVERSE_APP_ID=<id>`. Also **request microphone permission** for the world in VIVERSE Studio; the VIVERSE docs say standalone HTML5 worlds must request it there.
2. **Photon Voice:**
   - In the [Photon dashboard](https://dashboard.photonengine.com), create an app whose Photon SDK is **Voice**. Build with `VITE_PHOTON_APP_ID=<app id>`. The App ID ships in the page, so it identifies the app rather than protecting it.
   - Download the Photon Voice JavaScript SDK and copy `lib/photon-voice.min.js` and `lib/photon-voice.wasm` into `public/photon/`. That folder is gitignored: the download is limited to Photon Circle members, so the SDK is not in this repository.
   - Optional: `VITE_PHOTON_REGION` (default `us`), or `?region=eu` on the URL.

   The `guild-hall-voice` LiveKit token Worker that served the earlier build is still deployed. Removing it is a separate decision.
3. **Test** with `?sim=100` first, then with 2 to 3 real people, then 20+ in a rehearsal before a public event.

Without either variable, the Hall runs solo and offers **Preview a crowd**, which is an offline simulation of 60 people.

## What we need from the Guild

- [ ] A VIVERSE App ID, and microphone permission approved in VIVERSE Studio
- [ ] A Photon plan: the free plan is 20 people at once and for development only. Someone with billing authority should pick a paid plan before public events.
- [ ] Two or three host volunteers
- [ ] A named moderator for public events, and a way to report someone. We suggest a link to the Guild's contact route, which is still to be decided.

## Sources

- VIVERSE Matchmaking & Networking SDK: https://docs.viverse.com/developer-tools/javascript/matchmaking-and-networking-sdk
- VIVERSE Login SDK: https://docs.viverse.com/developer-tools/javascript/javascript-login
- VIVERSE Avatar SDK: https://docs.viverse.com/developer-tools/javascript/avatar-sdk
- Standalone publishing and microphone permission: https://docs.viverse.com/standalone-app-publishing/intro-to-standalone-app-publishing
- pmndrs/viverse: https://github.com/pmndrs/viverse
- three-vrm: https://github.com/pixiv/three-vrm
- Photon Voice JavaScript API: https://doc-api.photonengine.com/en/javascript/current/Photon.Voice.html
