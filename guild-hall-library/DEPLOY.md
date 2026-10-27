# Deploying the Guild Hall

`dist/` is a static site with relative paths. Any HTTPS static host works. WebXR will not start over plain HTTP.

## GitHub Pages (maintainer, one time)

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Add this file as `.github/workflows/guild-hall-pages.yml` at the **repo root**:

```yaml
name: Guild Hall Library → Pages
on:
  push:
    branches: [main]
    paths: ['guild-hall-library/**']
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: guild-hall-library } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: guild-hall-library/package-lock.json }
      - run: npm ci
      - run: npm run build
        env:
          VITE_VIVERSE_APP_ID: ${{ vars.VIVERSE_APP_ID }}
          VITE_PHOTON_APP_ID: ${{ vars.PHOTON_APP_ID }}
      - uses: actions/upload-pages-artifact@v3
        with: { path: guild-hall-library/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.d.outputs.page_url }}' }
    steps:
      - id: d
        uses: actions/deploy-pages@v4
```

3. For a short URL such as `hall.xrguild.org`, go to **Settings → Pages → Custom domain**, enter the domain, and add the `CNAME` record at your DNS provider. Tick **Enforce HTTPS**.

## Multiplayer services (optional)

Both are optional; without them the Hall runs solo with an offline crowd preview. Details and the reasoning are in [`MULTIPLAYER.md`](MULTIPLAYER.md).

1. **VIVERSE:** create an app in VIVERSE Studio to get an App ID, and request microphone permission for the world there. Build with `VITE_VIVERSE_APP_ID=<id>` (or set the repo variable `VIVERSE_APP_ID` for the Action above).
2. **Photon voice:** create a Voice app in the Photon dashboard, and build with `VITE_PHOTON_APP_ID=<app id>` (or set the repo variable `PHOTON_APP_ID` for the Action above). There is no server to deploy.
   - The build also needs the Photon Voice JavaScript SDK in `public/photon/` (see [`MULTIPLAYER.md`](MULTIPLAYER.md)). That folder is gitignored because the SDK download is limited to Photon Circle members, so the Action above has no copy of it. Until the SDK has a private source the Action can fetch, build voice-enabled versions locally.
   - The host is the room's master client, so `?hostKey` no longer applies.

## Netlify / Cloudflare Pages / Vercel

- Base directory `guild-hall-library`, build `npm run build`, output `dist`.
- Or drag and drop the prebuilt `dist/` folder.

## Viverse / RP1 / Pico / Meta portals

Zip the **contents** of `dist/` so that `index.html` sits at the zip root, then upload:

```bash
cd guild-hall-library/dist && zip -r ../guild-hall-library.zip . && cd ..
```

## Checklist before sharing the link

- [ ] Opens over HTTPS on desktop Chrome, a phone, and a headset browser
- [ ] **Enter VR** appears on the headset; teleport and snap turn work
- [ ] No console errors; the garden folly model loads
- [ ] `?sim=100` stays smooth on the slowest headset you expect
- [ ] With services on: two real people can see, hear, and chat; Mute, Block, and host seating work
- [ ] Refresh data if it's stale: `python3 scripts/refresh-data.py`, then rebuild
