# Spike: replace LiveKit with Photon Voice

**Goal:** reach a build where people talk to each other with spatial voice in the Guild Hall, on desktop Chrome and on Quest Browser, as directly as possible.

**Scope:** Photon fully replaces LiveKit. This spike adds no provider switch, keeps no LiveKit fallback, and plans no later migration. The CCU limiter, the token worker and the alternative paths in *Guild Hall Multiplayer Services* do not apply.

## Shape of the change

Off VIVERSE today, one LiveKit room carries both voice and presence. Under the spike, one **Photon Realtime room** carries all of it on a single `LoadBalancingClient`:

| Today (LiveKit) | Spike (Photon) |
|---|---|
| `LiveKitSession`: voice, panners, nearest-10 subscription | `PhotonSession`: voice decoded into our own Web Audio graph, using the same HRTF panners |
| `LiveKitTransport`: presence, chat and controls over data messages | `PhotonTransport`: the same messages over `raiseEvent`, received in `onEvent(code, content, actorNr)` |
| Token worker that issues JWTs, `ALLOWED_ORIGINS`, `HOST_KEYS` | Nothing server-side. The client connects with the Photon App ID. |
| Host = token attribute `host=1` | Host = the room's master client (`myRoomMasterActorNr()`). Photon stamps the sender's `actorNr` on every event, so host messages can't be spoofed the way VIVERSE `general` messages can. |

VIVERSE presence (`src/net/viverse.ts`) is unchanged in this spike, and has been tested with Photon voice on VIVERSE: it works. On VIVERSE, presence and chat stay on the Play SDK and only voice goes through Photon.

## Photon Voice JS API

From the [Voice API reference](https://doc-api.photonengine.com/en/javascript/current/Photon.Voice.html), checked Oct 16, 2026.

**Setup**
- `Photon.Voice.createTransport(lbc)`, then `createVoiceClient(transport)`.
- Voice runs inside the `LoadBalancingClient`'s room.

**Sending**
- Create the stream format with `createOpusVoiceInfo(48000, 1, 20000, 32000)`.
- Then either:
  - `createMicrophone(deviceId, info)` + `voiceClient.createLocalVoiceAudioFromSource(info, source)`, or
  - `createLocalVoiceAudio(info, sampleRate, channels)` + `pushData(Float32Array)`, for audio we capture ourselves.

**Receiving**
- `voiceClient.setOnRemoteVoiceInfoAction((playerId, voiceId, info) => createRemoteVoiceOptions(decoder, onRemove))`.
- Each speaker arrives as a separate stream. Photon relays streams and does not mix them on the server.
- Two playback options:
  - `createAudioPLayer(info, jitterMs)` exposes only `input(frame)`, `service()` and `stop()`. It has no output node and no position, so voices played through it are **not spatial**.
  - `createAudioDecoder(frame => …)` hands us decoded `Float32Array` PCM per remote voice. **The spike uses this**, so every voice goes through our own panner.

**Browsers**
- Photon lists Chrome (Windows, macOS, Android), Edge and Opera.
- **Quest Browser is not on the list.** It is Chromium-based, and Step 1 tests it before anything else gets built.

**Not covered by the reference**
- Echo cancellation in `createMicrophone`.
- Interest-group targeting for a local voice.
- Voice activity detection: whether silence is skipped instead of sent.
- Whether the SDK uses WASM, workers or WebCodecs for Opus.
- The decoder's output sample rate and channel count.
- Whether a remote voice can be paused or dropped without leaving the room.

**Distribution:** a zip from Photon's SDK download page, not npm. It includes `demo-voice-basics`. The Photon dashboard app type is **Voice**.

## Scaling model

### What each listener's device pays

Only open mics send audio. Mics are off by default, and a muted mic sends nothing. Photon may keep streaming silence while a mic is on, so plan for "mic on" rather than "talking".

| Cost per incoming voice | Size | Can the client skip it for distant voices? |
|---|---|---|
| Receiving the stream | About 32 kbps | No, not in a single group. The server sends every voice to everyone. |
| Opus decoding | Small on desktop, more on Quest | Unknown. The SDK may decode every voice it receives. |
| HRTF panner | The most expensive step | Yes. Only the nearest 10 are connected to the audio graph. The rest are disconnected and cost nothing there. |

Each speaker uploads one stream regardless of room size, because Photon's server does the fan-out.

**In a single group at 100 people:**
- **A talk with a few open mics:** negligible.
- **Mingling with 30 open mics:** about 1 Mbps down per listener, plus 30 decodes.
- **Every mic open:** about 3.2 Mbps down and 100 decodes per listener. This is the case to measure on Quest.

### Interest groups

Photon rooms have interest groups 1 to 255, which the server filters on:
- A sender tags each event with one group.
- Each client picks its groups with `changeGroups(remove, add)`, at any time.
- The server delivers a group's events only to clients subscribed to that group.
- Group 0 is the default. Everyone receives it and nobody can leave it.

In Unity's Photon Voice, each local voice has an `InterestGroup`. The JS Voice API reference shows no equivalent, so it is an open question for Photon. Without it, every voice stays in group 0.

**A possible mapping for the Hall**
- **Floor cells:** cells of about 10 m, each with its own group. A speaker sends to their own cell. A listener subscribes to their own cell and the 8 around it, refreshed alongside the 0.5 s subscription update. Covering the neighbors also handles people standing either side of a cell boundary.
- **Stage:** its own group, which everyone in the hall subscribes to.
- **Zones:** hall, library, colonnade and garden could be coarser groups.

**Limit compared with LiveKit:** groups are coarse. LiveKit lets each listener choose exactly which participants it receives, so the server sends at most 10 streams per listener. Photon forwards everything in a subscribed group, so the bandwidth into a crowded cell depends on how many mics are open there. Gain-based culling to the nearest 10 still applies on the client.

Interest groups are not needed for the spike, which is capped at 20 people. They decide whether Photon can handle a 100-person mingle.

## LiveKit reference point

What LiveKit already provides at 100 people, as a comparison for the scaling results. This is not a fallback.

- **Room size:** LiveKit's [audio benchmark](https://docs.livekit.io/transport/self-hosting/benchmark/) ran one room with 10 publishers and 3,000 subscribers on a single 16-core node. Each room must fit on one node.
- **Per-listener selection:** server-side selective subscription is already wired up in `updateSubscriptions()`. It caps every listener at 10 incoming streams however many mics are open.
- **[Plans](https://livekit.com/pricing):**

| Plan | Price | Concurrent connections | Minutes included per month |
|---|---|---|---|
| Build | $0 | 100 | 5,000 |
| Ship | from $50/mo | 1,000 | 150,000, then $0.0005/min |
| Scale | from $500/mo | 5,000 | 1.5M |

- **Billing:** listeners count as well as speakers. One 100-person, 1-hour event is 6,000 minutes, which is more than Build's monthly allowance.
- **Photon's plans:** the free plan is 20 CCU and for development only. The 100 CCU plan is about $95 for 12 months.

## Steps

### 0. Accounts and SDK

- Create a Photon app of type **Voice** in the Photon dashboard. The free plan (20 CCU) is enough for the spike.
- Download the Photon JavaScript SDK zip from photonengine.com/sdks and read `license.txt`:
  - If redistribution is allowed, vendor `lib/` into `guild-hall-library/vendor/photon/` along with the license.
  - If it isn't, add that folder to `.gitignore` and document the download in the README.
- Put the App ID in `guild-hall-library/.env.local` as `VITE_PHOTON_APP_ID`.

### 1. Go/no-go: Photon's demo on both devices

Before changing the Hall, serve `demo-voice-basics` unmodified over HTTPS, with the App ID set in `cloud-app-info.js`.

- Desktop Chrome to desktop Chrome on two machines: audible both ways?
- Desktop Chrome to Quest Browser: does the Quest send and receive?
- Quest on its speaker, and a laptop without headphones: is there echo?

**Stop if Quest Browser fails.** Report to the Photon team with the SDK version and console errors. Also record whether the SDK loads any `.wasm` or worker files, because that decides how Vite must serve them in Step 2.

### 2. Load the SDK into the Hall

- `src/net/photon.ts` loads `photon/photon-voice.min.js` from the gitignored `public/photon/` with a script tag (the shared `src/net/loadScript.ts`, also used by `viverse.ts`), and reads `globalThis.Photon`.
- `photon-voice.wasm` sits next to it in `public/photon/` so it is served unhashed.
- The single-file artifact build needs no stub: `main.ts` leaves the Photon App ID empty when `MODE === 'single'`, so that build always previews with the simulated crowd.

### 3. `PhotonTransport`: presence, chat, controls

Mirror `LiveKitTransport` in [`src/net/livekit.ts`](../src/net/livekit.ts):

- **Connect:** `lbc.connectToRegionMaster('<nearest region>')`, then `joinRoom('guild-hall', { createIfNotExists: true }, { maxPlayers: 20 })`. The room name honors `?room=`.
- **Identity:** on join, set the actor custom property `pid = presence.self.id`. Keep `actorNr → pid` maps, because voices arrive keyed by `playerId` (actor number) and the rest of the code keys by presence id.
- **Event codes:** `1` state (unreliable), `2` chat (reliable), `3` control (reliable).
- **Sender checks:**
  - Accept state and chat only when `payload.id` or `payload.from` matches the sender's `pid`.
  - Accept controls only when `actorNr === myRoomMasterActorNr()`.
- **Leaving:** `onActorLeave` calls `ev.onLeave(pid)`.
- **Host:** `isHost()` returns `myActor().actorNr === myRoomMasterActorNr()`. `?hostKey` is removed.

**Check before moving on:** desktop to desktop shows avatars and chat, with no voice yet.

### 4. `PhotonSession`: voice

Keep the surface that `social.ts` and `main.ts` already use: `micOn`, `setMic`, `muteLocal`, `localMuted`, `speaking`, `updatePanners`, `updateSubscriptions`, `ensureAudio`, `disconnect`.

**Mic**
- `setMic(true)` creates the microphone source and a local voice from it.
- `setMic(false)` disposes both, so the browser's mic indicator turns off.
- If Step 1 showed echo, capture the mic ourselves with `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`. An AudioWorklet then sends the audio through `createLocalVoiceAudio` + `pushData()`.

**Spatial playback**
- For each remote voice: `createAudioDecoder(frame => ring.push(frame))`, then an `AudioWorkletNode` that drains the ring, then the existing `PannerNode`, then a `GainNode`, then `ctx.destination`.
- This replaces the `MediaStreamAudioSourceNode` chain in `attach()`. `updatePanners()` is unchanged.
- Create the `AudioContext` at 48 kHz to match the Opus stream. If the decoder outputs another rate, resample in the worklet.
- If the worklet path stalls, play voices through `createAudioPLayer(info, 100)` (non-spatial) only to prove audio is flowing. Then return to the worklet path.

**Speaking ring:** compute RMS on each decoded frame. Mark a speaker as speaking above a threshold, with a hold of about 300 ms. This replaces LiveKit's `ActiveSpeakersChanged`.

**Mute, block and the nearest 10:**
- Disconnect the panner chain for muted or blocked people, and for anyone ranked outside the nearest 10 by the existing score in `updateSubscriptions`.
- Every voice is still received: at most 19 streams at 32 kbps (about 0.6 Mbps) under the 20 CCU cap.

### 5. Remove LiveKit

- Delete `src/net/livekit.ts`, `src/stubs/livekit.ts` and `proxy/livekit-token-worker.js`.
- Remove `livekit-client` from `package.json`.
- In `src/main.ts`, replace the `LIVEKIT_TOKEN_URL` branches with `PHOTON_APP_ID`. `Transport.kind` becomes `'viverse' | 'photon' | 'sim'`.
- Leave the deployed `guild-hall-voice` Worker and `proxy/wrangler.json` in place. Tearing them down is a separate decision.
- Update `MULTIPLAYER.md` and `DEPLOY.md` after Step 6 passes.

### 6. Test on desktop and Quest

**Serving to the Quest**
- **Over USB:** `npm run dev`, then `adb reverse tcp:5173 tcp:5173`, then open `http://localhost:5173` in Quest Browser. `localhost` counts as a secure context, so the mic and WebXR work.
- **Without a cable:** deploy `dist/` to any HTTPS static host, for example the GitHub Pages workflow in `DEPLOY.md` with `VITE_PHOTON_APP_ID` set.

**Pass criteria**
1. Desktop to desktop, and desktop to Quest: audible both ways within about 1 s of pressing Mic.
2. Turning your head in the headset moves the voice, and walking away fades it. A voice on the stage carries across the hall.
3. The speaking ring lights on the right avatar.
4. Local Mute and Block silence that person, and only for the person who chose it.
5. The host's "ask the hall to mute" turns off the other person's mic.
6. Entering and leaving VR doesn't drop audio. The `AudioContext` survives the session change.
7. No echo with the Quest on its speaker. If there is echo, record it as a finding; it doesn't block the spike.

Record mouth-to-ear latency, Quest frame rate with voice on and off, and any console errors.

## Stress testing

### Existing tool: `?sim=N`

`?sim=N` (`src/net/sim.ts`, capped at 300) is an offline simulated crowd. It plugs in as a network connection, so the bots feed the real presence code, avatars, nameplates and People list.

- Bots wander between hall, stage, colonnade, library and garden.
- They take free seats, and post canned chat lines.
- They light speaking rings on a timer.
- They play no audio.
- Nothing leaves the browser.

With no server configured, "Preview a crowd" runs the same simulation with 60 bots.

### Tier 1: client audio cost, offline (no Photon needed)

- Add `?simVoices=N`: give N simulated people a looping speech clip through the same worklet, panner and gain chain as real voices, driven by the `sim.ts` motion.
- On Quest, measure frame rate and CPU at 10, 30 and 100 voices, using OVR Metrics Tool or Chrome remote DevTools (`chrome://inspect` over USB).
- This measures the panner and worklet cost and checks the nearest-10 cap. It does not include Photon's decoding.

### Tier 2: end to end on the free plan (19 bots plus one Quest)

The harness is built: `bots.html` (`src/bots/`) is a page with no 3D world, and `scripts/load/run-bots.mjs` launches it in headless Chromium.

- Each bot is a full `PhotonSession` + `PhotonTransport` + `Presence`, so the room sees ordinary clients: presence events at the real send rate, and a voice.
- Bots walk with the same motion as `?sim` (`newWalker` / `stepWalker` in `src/net/sim.ts`). They never sit.
- Each bot pushes a speech clip into its own outgoing voice with `createLocalVoiceAudio` + `pushData()`, at 25 frames/s, starting at a random point in the clip. By default each bot says "I am bot number N", generated by macOS `say` and rotating through six standard voices, so a listener can tell which avatar a voice comes from. Without `say`, or with `--synth`, the clip is synthesised (vowel-like syllables with pauses). `--wav` plays one file for every bot instead.
- Bots decode each other's voices like any client, so the bot machine also carries Photon's decode cost.

#### Run it

The free plan allows 20 CCU **per App ID, across all rooms**, including people in the live world. 19 bots plus one listener only fits when nothing else is connected; otherwise use `--total 18` or fewer. A join over the cap fails with Photon error 32757 ("Max CCU of 20 reached"). The client currently reports this as "Could not reach Photon".

```bash
npx playwright install chromium
```

```bash
node scripts/load/run-bots.mjs --room loadtest-PICK-A-NAME --total 19 --per-page 5 --stage
```

- `--room` is required, and `guild-hall` is refused, so a test never lands in the live room.
- `--total` is the number of bots. `--per-page` is clients per tab; the launcher opens one headless Chromium with `ceil(total / per-page)` tabs. All of a tab's bots share its one JavaScript thread, so keep it under about 10.
- `--mic` is the fraction of bots that talk (default 1). Talkers are spread evenly over the bot numbers.
- `--stage` puts bot 1 on the stage with the megaphone on.
- `--duration` is in seconds (default 300). Ctrl-C stops early.
- `--base` points at an existing server. Without it, the launcher starts its own Vite dev server on port 5199, which reads `VITE_PHOTON_APP_ID` from `.env.local`.
- `--region`, `--wav`, `--synth`, `--headed` are optional.

Every 10 s the launcher prints joined bots and frames sent per second (25 per bot while its clip is speaking). Bots only send: they have no audio context and decode nothing, so listening is checked from a real client.

The page can also be opened by hand: `bots.html?room=NAME&bots=3&mic=1&stage=1`.

Then join as the listener with `?room=NAME&debug=voice`, from a browser or a Quest. On a Quest the page must be served over HTTPS, because AudioWorklet needs a secure context. `?room=` puts presence on Photon even when a VIVERSE App ID is configured, because the bots' positions travel as Photon events that VIVERSE presence can't see.

#### VIVERSE mode

```bash
node scripts/load/run-bots.mjs --viverse --total 5 --per-page 5
```

- `--viverse` makes each bot join like a visitor to the VIVERSE build: presence over the VIVERSE Play SDK, voice in Photon room `<VIVERSE App ID>:guild-hall` (`voiceRoom` in `src/net/viverse.ts`). A logged-in visitor to the uploaded world then sees and hears the bots, with their own avatar.
- The Play SDK accepted clients that never logged in, from `localhost` in headless Chromium (tested 2026-10-22). Several such clients work in one page.
- `--room` is refused in this mode. The bots join the world's own rooms, which are shared with everyone in the world, so use it only on a private test world.
- The Photon free plan's 20 CCU still caps bots plus visitors. VIVERSE's own room cap is 120 (`CAP` in `src/net/viverse.ts`).
- Ask VIVERSE before running more than a handful of bots against their service.
- The launcher's 10 s line adds `each sees ≥N others`: the fewest peers any bot sees over presence.

`?debug=voice` shows a corner readout and logs the same line to the console every 10 s, for reading over `chrome://inspect`:

- `voices in`: remote voices being decoded, and how many are audible (nearest 10).
- `decoded`: frames decoded per second, across all voices.
- `underruns`: per second, summed over audible voices. One underrun is a jitter buffer running dry while playing. A voice that goes silent can count one too.
- `out latency`: the AudioContext's `outputLatency` + `baseLatency`.

Measure Quest frame rate and CPU alongside it with OVR Metrics Tool.

#### What we found

- **Several clients per page work**, if they join one at a time. Overlapping handshakes in one page fail with `NameServer authentication failed: Non token authentication is not allowed`, which suggests the clients share state in the SDK's wasm core. `bots.html` joins its bots in sequence. 8 clients in one page and 6 per page × 3 pages both held steady.
- **Chrome's fake mic did not work here.** With Playwright's Chromium on macOS, `getUserMedia` never resolved, even headed with `--use-fake-device-for-media-stream`. In headless mode the AudioContext clock does not advance either. Pushing PCM avoids both, and needs no microphone permission. Linux cloud VMs were not tried.
- **19 bots ran on one laptop** (Apple Silicon, 4 instances × 5 bots): 475 frames/s sent, about 7,800 decoded by the bots.
- **About 8–10% of frames never reach the decoder.** The shortfall is the same at 3, 8, 18 and 19 bots, with one bot per page or eight. It is not silence suppression: adding a noise floor to the clip changed nothing. The cause is unknown: Photon, the SDK's receive path, or frames arriving too late. The listener's underruns track it.
- **Listener at 18 bots plus the listener** (desktop Chrome, every bot talking, megaphone bot on stage): 18 voices decoded (10 audible), 385–435 frames/s decoded (450 sent to it), 2–6 underruns/s, output latency 24–32 ms + 5 ms. Not yet measured on a Quest.

#### Still to do

- Run the same test with a Quest as the listener.
- Use the per-voice figures to extrapolate to 100.

### Tier 3: 100 clients (needs Photon)

- Ask Photon for a temporary CCU increase for load testing.
- Spread the bots over two or three machines, or a cloud VM.
- Run the every-mic-open case in group 0. Run it again with interest groups if JS voices support them.

## Open questions for Photon

- Is Quest Browser supported or known to work?
- Does `createMicrophone` apply echo cancellation, and can it take constraints?
- Can a JS local voice target an interest group?
- Does the JS SDK skip silence (voice detection), or stream continuously while the mic is on?
- Can a remote voice be paused or dropped, so the client stops decoding it?
- Can several `LoadBalancingClient` instances run in one page? (Yes, in practice, if they join one at a time; see Tier 2. Is that supported?)
- Why do about 8–10% of voice frames never reach the decoder (Tier 2)?
- Does the SDK use WASM, workers or WebCodecs for Opus?
- What sample rate and channel count does `createAudioDecoder` output?
- Can the SDK be redistributed in a public repository?
- Is a temporary CCU increase available for load testing?

## Sources

- [Photon Voice JS API](https://doc-api.photonengine.com/en/javascript/current/Photon.Voice.html)
- [Photon VoiceClient](https://doc-api.photonengine.com/en/javascript/current/Photon.Voice.VoiceClient.html)
- [Photon LoadBalancingClient (JS)](https://doc-api.exitgames.com/en/javascript/current/Photon.LoadBalancing.LoadBalancingClient.html)
- [Photon JS SDK overview](https://doc-api.photonengine.com/en/javascript/current/)
- [Photon Voice pricing](https://www.photonengine.com/voice/pricing)
- [LiveKit benchmarks](https://docs.livekit.io/transport/self-hosting/benchmark/)
- [LiveKit pricing](https://livekit.com/pricing)
