# Guild admins: room settings

The **Admin** button (bottom right) opens **Room settings**. Changes apply to everyone in the room, and anyone who joins later gets them too.

| Setting | Options |
|---|---|
| Guild Hall seating | **Benches** (curved, backless, 3 to 4 seats, facing the stage, up to 200) · **Small group tables** (round tables for 4 to 6, up to 120) · **Open floor** (no seating, for dances and standing events) |
| Library seating | Round table · Reading circle · Seminar (15 seats each) |
| Spatial audio | Conversation · Large group · Stage spotlight · Stage only. See [AUDIO.md](AUDIO.md) |
| Spotlight a guest | Anyone you spotlight is heard by everyone at full volume (for example an audience question). Also on the People list. |
| Ask the hall to mute | Turns off the mic of everyone in the hall who is not on the stage or spotlit. They can turn it back on. |
| Media screens | The stage screen: XR Guild slide, live screenshare, RTMP stream, or an HLS/MP4 link. See [MEDIA.md](MEDIA.md) |

When you are on your own (not joined), every setting works locally so you can try it.

## Who is an admin

There are three modes, set by `adminMode` in `guildhall.config.json` or `VITE_ADMIN_MODE`.

**`host` (default, no server):** the first person in the room (Photon's master client) is the host. Fine for rehearsals and small meetups. Anyone who arrives first gets the controls.

**`verified` (recommended for public events):** admins sign in with a passphrase in the Admin panel.

1. Deploy `proxy/photon-auth-worker.js` as a Cloudflare Worker. Set the secret `ADMIN_KEYS` to `label=passphrase` pairs, for example `evo=…,patrick=…`. Optionally set `SHARED_SECRET`.
2. In the Photon dashboard, open the Voice app: **Manage → Authentication → Custom Server**. Set the URL to `https://<worker>/auth` (add `?secret=<SHARED_SECRET>` if you set one) and turn **Allow anonymous clients off**.
3. Set `"adminMode": "verified"` in `guildhall.config.json`.

**`list` (no server, VIVERSE only):** admins are the VIVERSE accounts listed in `adminAccounts` (or `VITE_ADMIN_ACCOUNTS`, comma-separated).

1. Each admin joins the Hall on VIVERSE and opens the Admin panel. It shows their VIVERSE account ID (a UUID such as `00000000-0000-0000-0000-000000000000`). Developers can also run `viverse-cli auth status` and use the "Account ID". This is not the handle VIVERSE Settings calls "User ID"; the SDK doesn't expose the handle.
2. Add them to `guildhall.config.json`: `"adminMode": "list", "adminAccounts": [{ "name": "Evo", "id": "…" }, …]`. `name` is optional and only for people reading the file and the Admin panel; a bare ID string works too.
3. Re-zip and upload the world (no rebuild needed).

How it works: every room control carries the sender's account ID, and visitors apply a change only if that ID is on the list. The room's master client also answers newcomers with the current settings, so they stay in place after the admins leave, but it can't change them. Nobody else can change settings until an admin returns or the room empties.

Limits of list mode:
- It can be spoofed. Anyone who edits the page's JavaScript and knows a listed ID (they're visible in `guildhall.config.json`) can act as that admin. Use `verified` when that matters.
- Only visitors signed in to VIVERSE have an account ID, so off-VIVERSE builds have no admins.
- Changing the list means uploading the world again.
- Settings reach a visitor when they join and when an admin changes something; there is no periodic re-sync.

How verified mode works: Photon calls the worker on every connection. Guests come back as `guest:…` and admins as `admin:<label>`. Photon stamps that UserId on each visitor, and every event carries the sender, so other visitors can check that a settings change really came from an admin. Passphrases stay in the worker and never reach the page. A wrong passphrase still lets the person in as a guest.

## Limits to know

- On VIVERSE, presence and chat use the VIVERSE Play SDK, whose messages carry no verified sender. While voice is connected, the Hall takes room settings only from Photon (verified). With voice down, it falls back to the VIVERSE room's master client.
- Admin changes are not saved anywhere. When the last person leaves, the room resets to the defaults in `guildhall.config.json` (`defaults`).
- Rotate admin passphrases after public events.
