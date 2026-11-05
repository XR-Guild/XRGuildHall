# 🏛️ XR Guild Hall

**A community-built, browser-native home for the XR Guild as an immersive hall you can walk into, learn in, create events and help build.**

The Hall is a twelve-sided central space where the architecture *is* the wayfinding: twelve pillars, each a doorway into one of the Guild's programs; windows that honor the people we celebrate; walls that tell the field's story. Stand in the center, turn around, and the room is a living directory of what the Guild does — and everything in it is made by volunteers. There is a library and meeting room adjacent to the main hall.

> **This is a volunteer, community-driven project.** No studio owns it. It's built in the open by people who care about XR and about the Guild, one pillar and one garden bench at a time. If that's you, [there's a task with your name on it](#-get-involved).

---

## Why it's built the way it is

We made two commitments that shape everything else:

**Browser-native and open so anyone can walk in.** The Hall runs on **WebXR** with no app store, no install, no gatekeeper. Open a link on a headset, a laptop, or a phone and you're inside. Volunteers can build and test with nothing but a browser.

**Portable; it isn't trapped anywhere.** The Hall is built on open standards so it can live in more than one place: our own site today, and platforms like **[Viverse](https://www.viverse.com/)** and the **[Metaverse Standards Forum's Open Metaverse Browser](https://metaverse-standards.org/open-metaverse-browser-initiative/)** as they open up. We don't want a Hall that only exists on one company's servers. We want the Guild Hall to proliferate and help build community everywhere.

---

## The stack plan

The guiding principle is **describe the world as data, not as hand-coded scenes.** That single choice is what makes the Hall both editable by the community *and* portable across platforms.

| Layer | What it is | Who mostly works here |
|---|---|---|
| **Presentation** | WebXR in the browser, rendered with a three.js / Babylon.js engine *(engine choice is an open decision)* | Engine & rendering contributors |
| **World data** | Declarative config + open 3D assets (glTF / GLB, HDR environments) that describe the room, the pillars, and what each one links to | Designers, writers, **and anyone** |
| **Interaction** | Modular, reusable behaviors — a pillar panel, a billboard plaque, a video screen, a portal | Interaction & UI developers |
| **Live & networked** | Live video via **RTMP** (broadcast out; ingest-and-transcode for video in) and a multiplayer sync layer *(networking approach is an open decision)* | Streaming & networking contributors |

Two of these are deliberately **still open decisions** — the engine and the multiplayer/networking layer. We're documenting them as `needs-decision` issues rather than pretending they're settled, because in a volunteer project the people who show up to do the work should have a say in the tools. See [`docs/project/LEGACY-2023-NOTES.md`](docs/project/LEGACY-2023-NOTES.md) for the history behind these choices.

---

## Interoperability

- **Standards first.** WebXR for presentation, glTF/GLB for 3D assets, plain data for configuration. Nothing proprietary at the core.
- **One world, many front doors.** Because the Hall is standards-based data plus a browser runtime, the same world can be hosted by us and carried into Viverse or Open Metaverse — the target platform requirements are tracked as an open decision so our asset and scene conventions stay compatible.
- **Own-your-content.** Live video uses RTMP so streams can originate from and broadcast to the tools creators already use.

---

## Under the hood and how *you* can edit it

The whole point of the data-driven design is that **you don't have to understand the engine to contribute.** Work happens at three levels, and most contributions live at the top two:

**1. Edit the world data.** Want to assign a program to a pillar, change what a plaque says, or point a doorway somewhere new? That's a change to a config/data file — no rendering code required. This is where writers, designers, and first-time contributors have the most impact. (See the pillars-as-data plan in [`PROGRAMS.md`](PROGRAMS.md).)

**2. Add assets.** Model a bench, a bookshelf, a stained-glass panel, or a tree in your tool of choice, export to glTF/GLB, and drop it in. House style is gold tracery on dark with Marcellus SC caps — match it and it belongs.

**3. Extend behaviors.** Interactions are small, modular components — a Learn/Join/Enter panel, a video screen, a searchable list. Add a new behavior and every pillar can use it. This is the developer layer, kept intentionally small and composable so it's approachable.

Because these layers are separable, a designer, a writer, and a developer can all improve the *same pillar* without stepping on each other.

---

## What we're building

The production punch list lives in [`PRODUCTION.md`](docs/project/PRODUCTION.md), organized into five areas: **Architectural** (the shell), **Production Spaces** (library, tools, stage), **Interactive Elements** (join, mentorship, events, search, live video), **Content & Reference** (timeline, glossary, tracks, library outline), and **Gardens** (the restorative space outside).

---

## 🙋 Get involved

You don't need to be an XR expert — you need to want to help.

1. **Find a task** on the [project board](https://github.com/LightLodges/XRGuildHall/projects) or in [`PRODUCTION.md`](docs/project/PRODUCTION.md). New here? Filter for **`good-first-task`**.
2. **Claim it** by assigning yourself and saying hello — see [`CONTRIBUTING.md`](CONTRIBUTING.md).
3. **Join the weekly sync** — Mondays, **1:00 PM PST**, in Discord. Agenda and format in [`docs/MEETINGS.md`](docs/MEETINGS.md).

Every category needs hands: modelers, writers, streamers, accessibility testers, and people who just want to organize.

---

## How we build

- **Accessible by default** — everything is seated-reachable and works with gaze or a single button. Accessibility isn't a phase; it's a requirement on every task.
- **Honest by default** — Join, Donate, and event actions follow a no-dark-patterns rule: clear, disclosed, easy to back out of.
- **Open by default** — decisions are made in the open, on the board and in the Monday sync, by the people doing the work.

---

## Repo map

```
XRGuildHall/
├── .github/workflows/        ← VIVERSE zip build, weekly data refresh
├── assets/
│   └── reference/            ← source models, images and a prototype script; not used by the build
├── docs/
│   ├── design-system/        ← design-system slides, style onboarding, principles posters, PDFs
│   ├── plans/                ← implementation plans
│   └── project/              ← punch list, 2023 lessons, early multiplayer plan, original project setup
├── guild-hall-library/       ← the app: source, assets, Blender files, scripts, app docs
├── CONTRIBUTING.md           ← how to claim and submit work
├── LICENSE                   ← MIT
├── NOTICE.md                 ← licensing and attribution
└── README.md                 ← you are here
```

---

*Built by volunteers, for the XR community. Come make something with us.*
