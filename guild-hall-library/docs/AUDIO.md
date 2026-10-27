# Spatial audio (Photon Voice)

Voice is Photon Voice (Patrick's spike, merged for V3). Every voice is decoded in the browser and played through its own HRTF panner, so people sound like they are where their avatar is. Mics are off until a visitor presses **Mic**. No voice is recorded.

## Audio modes (admin, applies to everyone)

| Mode | Use it for | What you hear |
|---|---|---|
| **Conversation** (default) | Meetups, mentorship, hanging out | The 10 people nearest you in your zone, fading with distance. People on the stage carry across the hall. |
| **Large group** | Full rooms, mixers | Your 6 nearest neighbours within 10 m, a little softer, so a full hall stays calm. The stage still carries. |
| **Stage spotlight** | Talks, panels, launches | Everyone on the stage, the megaphone, and spotlit guests are heard by everyone at full volume, wherever they stand. Guests can whisper to their 3 nearest neighbours within 3 m, at a third of the volume. |

Also:
- **Megaphone** (Patrick): anyone on the stage can turn it on to be heard at full volume everywhere.
- **Spotlight** (admin): pick a person in Room settings or the People list. Use it for Q&A from the floor.
- Each visitor can **Mute** or **Block** anyone for themselves.

## Capacity and cost

- Photon delivers every open mic in the room to every visitor; the modes above choose what you hear, on your device. Mics off by default keep traffic low.
- One Photon room holds `photonMaxPlayers` people. **The free plan is 20 and is for development only.** Pick a paid plan before public events and set `photonMaxPlayers` to match. On VIVERSE, `viverseRoomCap` keeps each VIVERSE room within one voice room; extra people go to an overflow room (`guild-hall-2`, with its own voice room).
- Voice cost is a Guild budget decision (see the *Guild Hall Multiplayer Services* doc). This build does not choose a plan.

## Stream sound

Sound from the media screens is separate from voice. Admins choose **whole room** (same level everywhere in the hall, softer outside) or **from the screen** (spatial). Each visitor can turn stream sound off in **Comfort**.

## Testing

`?sim=100` simulates a crowd with no network. `bots.html` (Patrick) runs real Photon voice bots for load tests: see `docs/PHOTON-VOICE-SPIKE.md`. `?debug=voice` shows a live voice readout.
