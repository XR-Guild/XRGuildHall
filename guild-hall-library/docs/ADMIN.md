# Guild admins: room settings

The **Admin** button (bottom right) opens **Room settings**. Changes apply to everyone in the room, and anyone who joins later gets them too.

| Setting | Options |
|---|---|
| Guild Hall seating | **Benches** (curved, backless, 3 to 4 seats, facing the stage, up to 200) · **Small group tables** (round tables for 4 to 6, up to 120) · **Open floor** (no seating, for dances and standing events) |
| Library seating | Round table · Reading circle · Seminar (15 seats each) |
| Spatial audio | Conversation · Large group · Stage spotlight. See [AUDIO.md](AUDIO.md) |
| Spotlight a guest | Anyone you spotlight is heard by everyone at full volume (for example an audience question). Also on the People list. |
| Ask the hall to mute | Turns off the mic of everyone in the hall who is not on the stage or spotlit. They can turn it back on. |
| Media screens | Stage, West and East screens: XR Guild slide, live screenshare, RTMP stream, or an HLS/MP4 link. See [MEDIA.md](MEDIA.md) |

When you are on your own (not joined), every setting works locally so you can try it.

## Who is an admin

There are two modes, set by `adminMode` in `guildhall.config.json` or `VITE_ADMIN_MODE`.

**`host` (default, no server):** the first person in the room (Photon's master client) is the host. Fine for rehearsals and small meetups. Anyone who arrives first gets the controls.

**`verified` (recommended for public events):** admins sign in with a passphrase in the Admin panel.

1. Deploy `proxy/photon-auth-worker.js` as a Cloudflare Worker. Set the secret `ADMIN_KEYS` to `label=passphrase` pairs, for example `evo=…,patrick=…`. Optionally set `SHARED_SECRET`.
2. In the Photon dashboard, open the Voice app: **Manage → Authentication → Custom Server**. Set the URL to `https://<worker>/auth` (add `?secret=<SHARED_SECRET>` if you set one) and turn **Allow anonymous clients off**.
3. Set `"adminMode": "verified"` in `guildhall.config.json`.

How it works: Photon calls the worker on every connection. Guests come back as `guest:…` and admins as `admin:<label>`. Photon stamps that UserId on each visitor, and every event carries the sender, so other visitors can check that a settings change really came from an admin. Passphrases stay in the worker and never reach the page. A wrong passphrase still lets the person in as a guest.

## Limits to know

- On VIVERSE, presence and chat use the VIVERSE Play SDK, whose messages carry no verified sender. While voice is connected, the Hall takes room settings only from Photon (verified). With voice down, it falls back to the VIVERSE room's master client.
- Admin changes are not saved anywhere. When the last person leaves, the room resets to the defaults in `guildhall.config.json` (`defaults`).
- Rotate admin passphrases after public events.
