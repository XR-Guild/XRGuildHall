# Media screens: RTMP streams, screenshare and HLS

The Guild Hall has three screens: **Stage** (above the stage, 7 m wide), **West** and **East** (either side). When idle they show the XR Guild slide (logo, mission line, xrguild.org). Admins pick each screen's source in **Room settings → Media screens**.

| Source | Needs | Latency |
|---|---|---|
| XR Guild slide | nothing | none |
| HLS or MP4 link | any https `.m3u8` or `.mp4` link that allows cross-origin playback (CORS) | 5 to 30 s |
| Live: RTMP stream | LiveKit media room + an RTMP ingress (OBS) | about 1 s |
| Live: screenshare | LiveKit media room + `presenter.html` | under 1 s |
| Live: screenshare, else RTMP | as above | |

Voice stays on Photon. LiveKit carries video only, and visitors join it only while a screen shows a live source, so it uses no minutes the rest of the time. Viewers can't publish anything.

## Set up the LiveKit media room (once)

1. Create a LiveKit Cloud project. Check its plan's ingress and minutes limits before an event: that is a budget decision for the Guild.
2. Deploy `proxy/media-token-worker.js` as a Cloudflare Worker. Variables:
   - `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (secrets), `LIVEKIT_URL`
   - `ALLOWED_ORIGINS`: every page origin that will show the Hall (your GitHub Pages URL, and the VIVERSE world origin)
   - `PRESENTER_KEYS` (secret): passphrases for presenters
3. Put the worker URL in `guildhall.config.json` → `media.tokenUrl` (or `VITE_MEDIA_TOKEN_URL`).

## RTMP from OBS

```bash
npm i -D livekit-server-sdk
LIVEKIT_URL=https://… LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=… node scripts/create-ingress.mjs
```

It prints a **Server** and **Stream key**. In OBS: Settings → Stream → Service: Custom, paste both, Start Streaming. Then set a screen to **Live: RTMP stream**. Treat the stream key like a password; `--list` and `--delete <id>` manage ingresses.

## Slides (screenshare)

Presenters open `presenter.html` on the same site as the Hall (for example `https://<pages-url>/presenter.html`) on a laptop, enter the presenter passphrase and share a window. An admin sets the Stage screen to **Live: screenshare**. The presenter talks from inside the Hall as usual.

Why a separate page: screen capture needs a top-level page, and VIVERSE runs worlds inside a frame, where browsers usually block it.

## HLS links

Any service that gives an https HLS link works (Cloudflare Stream, Mux, Owncast, a CDN). The link must allow cross-origin playback, or the screen stays on the slide with "Stream unavailable". Safari plays HLS natively; other browsers use hls.js.
