# Deploying the Guild Hall Library

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
- [ ] No console errors; both models load (library apse and garden colonnade)
- [ ] Refresh data if it's stale: `python3 scripts/refresh-data.py`, then rebuild
