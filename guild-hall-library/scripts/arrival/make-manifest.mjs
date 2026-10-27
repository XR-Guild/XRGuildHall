#!/usr/bin/env node
// make-manifest.mjs: turn Evo's engine export of the Arrival space (the XRGuildHall-PlayCanvas package) into
// public/arrival/ (models + manifest.json) for src/arrival.ts.
//
// Usage (from guild-hall-library/):  node scripts/arrival/make-manifest.mjs <XRGuildHall-PlayCanvas> [public/arrival]
// Needs Node 22+ (compress.sh runs gltf-transform v4 through npx).
//
// Reads scene/xrguildhall.scene.json (glTF/PlayCanvas coordinates, the same as this world's) and keeps every visible
// model, baked plugin mesh and image panel, minus scripts/arrival/exclude.json. Markers (portals, gates, spawn) and
// plugins that only exist as code are left out. Each GLB is compressed once with compress.sh (WebP textures <= 2048 px
// + Draco).
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const [pkg, outDir = 'public/arrival'] = process.argv.slice(2);
if (!pkg) { console.error('usage: node scripts/arrival/make-manifest.mjs <XRGuildHall-PlayCanvas> [out arrival dir]'); process.exit(1); }
const scene = JSON.parse(fs.readFileSync(path.join(pkg, 'scene/xrguildhall.scene.json'), 'utf8'));
const exclude = JSON.parse(fs.readFileSync(path.join(here, 'exclude.json'), 'utf8'));
const manifestPath = path.join(outDir, 'manifest.json');

const r4 = (a) => a.map((v) => Math.round(v * 1e4) / 1e4);
const skipped = [], items = [], files = new Set();
for (const e of scene.entities) {
  const why = e.hidden ? 'hidden in Arrival' : e.kind === 'marker' ? 'marker' : !e.model && !e.image ? 'code only'
    : exclude.files[path.basename(e.model ?? '')] ?? exclude.plugins[e.plugin ?? ''];
  if (why) { skipped.push(`${e.name}: ${why}`); continue; }
  const it = { name: e.name, group: e.group, pos: r4(e.position), quat: r4(e.quaternion) };
  if (e.scale.some((s) => s !== 1)) it.scale = r4(e.scale);
  if (e.kind === 'image') {
    const webp = e.image.replace(/\.(png|jpe?g)$/i, '.webp');
    Object.assign(it, { image: fs.existsSync(path.join(pkg, webp)) ? webp : e.image, size: e.imageSize });
  }
  else it.file = e.model;
  if (e.collision) it.collide = true;
  if (e.collisionModel) it.collision = e.collisionModel;
  items.push(it);
  for (const f of [it.file, it.collision, it.image]) if (f) files.add(f);
}

// Corrections to Evo's export that belong upstream in Arrival: patches/<glb name>.jpg replaces that GLB's only image.
// credits-sign-xrguild: the name on the credits sign is Patrick O'Shaughnessey.
function patchImage(glb, jpg) {
  const b = fs.readFileSync(glb), jsonLen = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jsonLen));
  const bin = b.subarray(28 + jsonLen), img = json.images.length === 1 && json.images[0];
  if (!img) throw new Error(`${glb}: expected exactly one image`);
  const parts = json.bufferViews.map((v, i) => i === img.bufferView ? fs.readFileSync(jpg) : bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
  let off = 0; const chunks = [];
  parts.forEach((p, i) => { const pad = (4 - (p.length % 4)) % 4; json.bufferViews[i].byteOffset = off; json.bufferViews[i].byteLength = p.length; chunks.push(p, Buffer.alloc(pad)); off += p.length + pad; });
  img.mimeType = 'image/jpeg'; json.buffers[0].byteLength = off;
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const body = Buffer.concat(chunks), head = Buffer.alloc(12);
  head.write('glTF'); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + body.length, 8);
  const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len); h.write(type, 4); return h; };
  const out = path.join(fs.mkdtempSync(path.join(cacheDir, 'patch-')), path.basename(glb));
  fs.writeFileSync(out, Buffer.concat([head, ch(js.length, 'JSON'), js, ch(body.length, 'BIN\0'), body]));
  return out;
}
const cacheDir = '.arrival-cache'; fs.mkdirSync(cacheDir, { recursive: true });

let before = 0, after = 0;
for (const f of files) {
  const patch = path.join(here, 'patches', path.basename(f, '.glb') + '.jpg');
  let src = path.join(pkg, f); const dest = path.join(outDir, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  before += fs.statSync(src).size;
  if (!f.endsWith('.glb')) fs.copyFileSync(src, dest);
  else if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < Math.max(fs.statSync(src).mtimeMs, fs.existsSync(patch) ? fs.statSync(patch).mtimeMs : 0)) {
    if (fs.existsSync(patch)) src = patchImage(src, patch);
    execFileSync(path.join(here, 'compress.sh'), [src, dest], { stdio: 'inherit' });
  }
  after += fs.statSync(dest).size;
}
fs.writeFileSync(manifestPath, JSON.stringify({ source: scene.version, items }, null, 1));
console.log(`manifest: ${items.length} placements, ${files.size} files, ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
console.log(`left out ${skipped.length}:\n  ` + [...new Set(skipped)].sort().join('\n  '));
