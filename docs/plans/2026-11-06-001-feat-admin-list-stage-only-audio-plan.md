---
title: "feat: Admins from a VIVERSE ID list, and a Stage Only audio mode"
date: 2026-11-06
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
depth: standard
---

# feat: Admins from a VIVERSE ID list, and a Stage Only audio mode

## Summary

Give Guild admins a way to keep talks quiet without any server of our own:

1. **Admins from a VIVERSE ID list.** A new `adminMode: 'list'` reads VIVERSE account IDs from `guildhall.config.json`. Listed people get the existing admin controls; the first person in the room no longer does.
2. **Stage Only audio mode.** Everyone, everywhere, hears only people on the stage, megaphone users and spotlit guests.
3. **No cap on loud voices.** Stage, megaphone and spotlit voices are never silently dropped.
4. **Mic notice.** In Stage Only, guests are told their mic isn't heard.
5. **Newcomers get the current settings when no admin is present.** Room settings live only in each visitor's browser. Today a newcomer asks the room for them and only an admin answers, so if the admins have left, the newcomer starts on the defaults (e.g. Conversation) while everyone else is still in Stage Only. The room's master client will answer too.

All work is in `guild-hall-library/`. Paths below are relative to it.

---

## Problem Frame

There is no Cloudflare worker, so `adminMode` is `host`: the room's master client (usually the first person in) holds every admin control. There is no trustworthy way to say who is an admin, and no way to stop the audience from talking over a speaker other than the soft "Ask the hall to mute", which people can undo.

The team wants an admin-controlled way to keep talks quiet, with no server dependency, accepting that a determined person who edits the page's JavaScript can get around it.

---

## Requirements

- R1. `adminMode` accepts `'list'`. In list mode, `adminAccounts: string[]` in `guildhall.config.json` (or `VITE_ADMIN_ACCOUNTS`, comma-separated) names the admins by VIVERSE account ID.
- R2. In list mode, a connected visitor can change room settings only if their VIVERSE `accountId` is in `adminAccounts`. Solo visitors can still try every setting locally.
- R3. In list mode, every room control carries the sender's `accountId`. Receivers apply a control (other than `hello` and `state`) only when that ID is in `adminAccounts`.
- R4. In list mode, a `state` answer is accepted from a listed admin or from the room's master client. Admins and the master client answer `hello`; nobody else does.
- R5. `host` and `verified` modes behave exactly as today.
- R6. New audio mode `stageOnly` ("Stage only"): every listener, in every zone, hears only people on the stage (full volume, no distance fade), megaphone users and spotlit guests. No crowd voices.
- R7. The per-listener cap of 6 loud voices is removed.
- R8. While Stage Only is on, a visitor who is not on the stage and not spotlit sees that their mic isn't heard: in the dock, in the XR menu, and as a chat system line when the mode starts.
- R9. Unchanged: Conversation, Large group and Stage spotlight modes; megaphone (stage only); spotlight (admin only, at most 12); Ask the hall to mute; personal Mute and Block; chat.
- R10. `docs/ADMIN.md`, `docs/AUDIO.md` and `V3.md` describe list mode and Stage Only.

---

## Scope Boundaries

Out of scope, by decision:

- Per-person admin mute, and kick.
- The Photon auth worker, and any VIVERSE token check on a server.
- Zone-specific audio rules (e.g. stepping out of the hall to talk during Stage Only).
- Receivers working out `onStage` from avatar position instead of trusting the sender's flag.
- A cap on how many people can stand on the stage.

---

## Known Limits (accepted)

- **Impersonation.** Anyone who edits the page's JavaScript and knows a listed account ID can act as that admin. Listed IDs are visible in `guildhall.config.json` and in control messages.
- **VIVERSE login required.** Only visitors signed in to VIVERSE have an `accountId`. Off-VIVERSE builds have no admins in list mode.
- **Changing the list means republishing.** Edit `guildhall.config.json` in the VIVERSE zip and upload it again (no rebuild needed).
- **Settings reset when the room empties.** Nothing is stored on a server.
- **No admin, no changes.** If the last admin leaves, the settings stay as they are (for example Stage Only) until an admin returns or the room empties; nobody else can change them. Going back to the defaults after a grace period was considered and left out.
- **No periodic re-sync.** Settings reach a visitor when they join and when an admin changes something. A visitor who misses a change stays on the old settings until the next change or until they rejoin.

---

## Design

### Admin identity (list mode)

Today the trust check lives in three places, each asking "is the sender the host?":

- `PhotonSession` passes `fromHost` (admin actor in verified mode, master client otherwise) to `onEvent` (`src/net/photon.ts`, `c.onEvent`).
- `PhotonTransport.connect` and the VIVERSE voice hook in `src/main.ts` drop controls unless `fromHost || type === 'hello'`.
- `ViverseTransport` drops `general` controls unless the sender is `masterId` or it is a `hello` (`src/net/viverse.ts`).

In list mode, "host" splits into two questions: *is the sender a listed admin* (from `c.acct`) and *is the sender the master client* (from the transport). Plan:

- Transports stop filtering controls themselves and pass every control up with `fromMaster` (Photon: master client, or admin actor in verified mode, as `fromHost` is today; VIVERSE: `from === masterId`).
- One gate in `src/main.ts`, `trusted(c, fromMaster)`:
  - `hello`: always.
  - `host` / `verified`: `fromMaster` (unchanged behaviour).
  - `list`: `isListed(c.acct)`, or `fromMaster && c.type === 'state'`.
- The existing rule stays: on VIVERSE with voice up, only `hello` is taken from the VIVERSE channel; everything else comes over Photon.
- Sending: `sendControl` in `src/main.ts` stamps `acct` on every control in list mode. The transport-level `isHost()` gates on send are replaced by the same `canAdmin()` used by the UI, plus "master client may send `state`" in list mode.
- `canAdmin()` in list mode: `!presence.connected || isListed(myAccountId)`. `myAccountId` comes from `viverseIdentity()` in the VIVERSE connect path.
- `Room.receive('hello')` answers when `canAnswer()`: `canAdmin()` in host/verified mode; `canAdmin() || isMaster()` in list mode. The existing random delay and "cancel when another answer arrives" stay.
- `Control` gains an optional `acct?: string`; `sanitize` is unchanged (it only reads `state`).
- `roleText()` in `src/main.ts` gets list-mode wording ("You are a Guild admin…" / "Guild admins set these…").

### Stage Only

In `src/net/photon.ts`:

- `MODES.stageOnly = { keep: 0, range: 0, crowdGain: 0 }`.
- `isLoud(p)`: stage counts as loud when the mode is `spotlight` or `stageOnly`.
- `stageVoice` in `updateSubscriptions`: false in both of those modes (stage voices are already in the loud group).
- Remove `.slice(0, 6)` on `loud`, and its comment.

Elsewhere: add `'stageOnly'` to `AudioMode` (`src/net/types.ts`), `AUDIO` (`src/room.ts`), `AUDIO_MODES` (`src/admin.ts`), and the mode-change system line in `applyRoom` (`src/main.ts`). Accept it in `defaults.audio` from config.

### Mic notice

A helper `micUnheard()` = connected, mode is `stageOnly`, not `onStage`, not spotlit. Used by:

- `drawDock` in `src/social.ts`: Mic button title and a short note under the dock while true.
- The XR menu mic item in `src/xrmenu.ts`: label suffix (e.g. "Mic on · not heard").
- `applyRoom`: when Stage Only starts, a system line: "Stage only is on: only the stage and spotlit guests can be heard."

The mic is not turned off automatically.

---

## Implementation Units

### U1. Config: list mode

- `src/config.ts`: `adminMode: 'verified' | 'host' | 'list'`; `adminAccounts: string[]`; read `VITE_ADMIN_MODE` and `VITE_ADMIN_ACCOUNTS`; keep `'list'` in `loadConfig` instead of forcing it to `host`. `merge` already copies arrays (`typeof` matches), but an empty `[]` would wipe a list set in `VITE_ADMIN_ACCOUNTS`; treat an empty array as blank, like `''` and `0`.
- `public/guildhall.config.json`: add `"adminAccounts": []` and mention `list` in the `_comment`.
- `.env.example`: `VITE_ADMIN_ACCOUNTS=`.

### U2. Control trust and sending

- `src/net/types.ts`: `acct?: string` on `Control` (intersection type), `fromMaster` in `TransportEvents.onControl`.
- `src/net/photon.ts`, `src/net/viverse.ts`: pass all controls up with `fromMaster`; make send-side gating take a predicate from `main.ts`.
- `src/net/sim.ts`: unchanged behaviour (solo/sim is always admin).
- `src/main.ts`: `isListed`, `myAccountId`, `trusted()`, `canAdmin()`, `canAnswer()`, `sendControl` stamping `acct`, `roleText()`.
- `src/room.ts`: `canAnswer` hook for `hello`.

### U3. Stage Only and loud-voice cap

- `src/net/types.ts`, `src/room.ts`, `src/net/photon.ts`, `src/admin.ts`, `src/main.ts` as in Design.

### U4. Mic notice

- `src/social.ts`, `src/xrmenu.ts`, `src/main.ts`, plus any dock note element and style in `index.html` / `src/style.css`.

### U5. Docs

- `docs/ADMIN.md`: list mode (setup, how to find a VIVERSE account ID, limits), and "Who is an admin" with three modes.
- `docs/AUDIO.md`: Stage Only row; note the loud-voice cap is gone.
- `V3.md`: `adminAccounts` row in the settings table; `list` in the Admin mode row.

---

## Verification

- `npm run typecheck` and `npm run build` pass.
- `?sim=60`: Stage Only can be selected in the Admin panel; the audio hint text matches.
- Two browsers on VIVERSE (or the Photon room with `?room=`), one listed account and one not:
  - Only the listed account can change settings; the other sees them update.
  - Stage Only: the guest hears the admin only while the admin stands on the stage or is spotlit; the guest's mic notice shows; the admin, on stage, hears nothing from the guest.
  - The listed admin leaves; a third browser joins and receives Stage Only from the master client.
  - Seven people on stage with megaphones (or bots, see `docs/PHOTON-VOICE-SPIKE.md`) are all audible.
- `adminMode: 'host'` and `'verified'` behave as before (master client / `admin:` actors).
- `?debug=voice` readout shows audible counts that match the mode.

---

## Open Questions

- Keep both Stage spotlight (guests can whisper) and Stage Only, or fold them into one talk mode with a whisper setting? This plan keeps both.
- How admins find their VIVERSE account ID. **Settled format:** `account_id` is the HTC account UUID (e.g. `00000000-0000-0000-0000-000000000000`), not the profile handle VIVERSE Settings calls "User ID". The login and profile responses don't include the handle. Confirmed in a preview build that printed it to chat on join, and it matches `viverse-cli auth status` → "Account ID". VIVERSE's site doesn't show it, so the Admin panel should show the signed-in visitor's `account_id` with a Copy button. Developers can also read theirs with `viverse-cli auth status`.
