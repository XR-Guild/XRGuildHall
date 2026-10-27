#!/usr/bin/env node
// make-manifest.mjs: turn an `arrival pull` workspace into public/arrival/ (models + manifest.json) for src/arrival.ts.
//
// Usage (from guild-hall-library/):  node scripts/arrival/make-manifest.mjs <arrival-workspace>/space [public/arrival] [scripts/arrival/dedupe.json]
// Needs Node 22+ (compress.sh runs gltf-transform v4 through npx). Uncompressed originals and plugins-to-port.json go to
// .arrival-cache/ (gitignored) so they never ship. hideV3 in an existing manifest.json is kept.
//
// Reads every entity JSON in space/entities, keeps the GLB models (plugins are listed separately in
// plugins-to-port.json because they are Arrival code, not models), copies or downloads each GLB once,
// compresses it with compress.sh (WebP textures <= 2048 px + Draco), and writes manifest.json with
// position (m), rotation (deg, PlayCanvas order, applied as three.js 'ZYX'), scale, hidden and collision.
// UNTESTED against a real pull: written from the entity fields the Arrival API returns
// (glbUrl, position, rotation, scale, hidden, noCollision, collisionUrl, scriptName, params). Check the first run.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const [spaceDir, outDir = 'public/arrival', dedupeFile = path.join(here, 'dedupe.json')] = process.argv.slice(2);
if (!spaceDir) { console.error('usage: node scripts/arrival/make-manifest.mjs <space> [out arrival dir] [dedupe.json]'); process.exit(1); }
const dedupe = JSON.parse(fs.readFileSync(dedupeFile, 'utf8')).map;
const modelsDir = path.join(outDir, 'models'); fs.mkdirSync(modelsDir, { recursive: true });
const cacheDir = '.arrival-cache'; fs.mkdirSync(path.join(cacheDir, 'orig'), { recursive: true });
const manifestPath = path.join(outDir, 'manifest.json');
const hideV3 = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).hideV3 ?? [] : [];

const stem = (u) => decodeURIComponent(u.split('?')[0].split('/').pop()).replace(/^[0-9a-f]{64}_/, '');
const v3 = (o, d = 0) => o ? [o.x ?? o[0] ?? d, o.y ?? o[1] ?? d, o.z ?? o[2] ?? d].map(Number) : [d, d, d];

async function fetchTo(src, dest) {
  if (fs.existsSync(dest)) return;
  const local = [path.join(spaceDir, src), path.join(spaceDir, 'assets', path.basename(src))].find((p) => fs.existsSync(p));
  if (local) { fs.copyFileSync(local, dest); return; }
  if (!/^https?:/.test(src)) throw new Error('not found: ' + src);
  const r = await fetch(src); if (!r.ok) throw new Error(r.status + ' ' + src);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

const items = [], plugins = [], fileFor = new Map();
for (const f of fs.readdirSync(path.join(spaceDir, 'entities')).filter((f) => f.endsWith('.json'))) {
  const ent = JSON.parse(fs.readFileSync(path.join(spaceDir, 'entities', f), 'utf8'));
  let d = ent.data ?? ent; if (typeof d === 'string') d = JSON.parse(d);
  const url = d.glbUrl || d.url || '';
  if (d.scriptName || /\.m?js$/.test(url)) { plugins.push({ entity: f, script: d.scriptName, url, params: d.params, position: v3(d.position), hidden: !!d.hidden }); continue; }
  if (!/\.glb$/i.test(url.split('?')[0])) continue;
  let name = stem(url); name = dedupe[name] ?? name;           // repeats share one file
  items.push({ name: d.name || name.replace(/\.glb$/, ''), file: name, pos: v3(d.position), rot: v3(d.rotation),
    scale: typeof d.scale === 'number' ? d.scale : v3(d.scale, 1), hidden: !!d.hidden || !!d.disableRendering,
    collide: !d.noCollision, collisionFile: d.collisionUrl ? stem(d.collisionUrl) : undefined, collisionSrc: d.collisionUrl ? d.collisionUrl.split('?')[0] : undefined, src: url.split('?')[0], entity: f });
}

const seen = new Set();
for (const it of items) {
  for (const [file, src] of [[it.file, it.src], ...(it.collisionFile ? [[it.collisionFile, it.collisionSrc]] : [])]) {
    if (seen.has(file)) continue; seen.add(file);
    const orig = path.join(cacheDir, 'orig', file), opt = path.join(modelsDir, file);
    try {
      await fetchTo(src, orig);
      execFileSync(path.join(here, 'compress.sh'), [orig, opt], { stdio: 'inherit' });
      console.log(`${file}: ${(fs.statSync(orig).size / 1e6).toFixed(2)} MB -> ${(fs.statSync(opt).size / 1e6).toFixed(2)} MB`);
    } catch (e) { console.warn('SKIPPED', file, e.message); }
  }
  delete it.src; delete it.collisionSrc;
}
fs.writeFileSync(manifestPath, JSON.stringify({ generated: new Date().toISOString(), hideV3, items }, null, 1));
fs.writeFileSync(path.join(cacheDir, 'plugins-to-port.json'), JSON.stringify(plugins, null, 1));
console.log(`manifest: ${items.length} placements, ${seen.size} files; ${plugins.length} plugins listed in ${cacheDir}/plugins-to-port.json`);
