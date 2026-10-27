#!/usr/bin/env node
/**
 * Package dist/ for VIVERSE Studio: index.html at the zip root, everything relative.
 *   npm run viverse-zip            → guild-hall-v3-viverse.zip
 * Checks before zipping:
 *   - dist/photon/ holds the Photon Voice SDK when a Photon App ID is configured (voice needs it)
 *   - no test media left in dist/
 */
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const dist = path.resolve('dist'), out = path.resolve(process.env.OUT || 'guild-hall-v3-viverse.zip');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('Run vite build first (dist/index.html missing).'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.join(dist, 'guildhall.config.json'), 'utf8'));
const photonId = cfg.photonAppId || process.env.VITE_PHOTON_APP_ID;
if (photonId && !fs.existsSync(path.join(dist, 'photon', 'photon-voice.min.js'))) console.warn('WARNING: a Photon App ID is set but dist/photon/photon-voice.min.js is missing. Voice will not start. Copy the SDK into public/photon/ and rebuild.');
if (!photonId) console.warn('Note: no Photon App ID in guildhall.config.json or env. The world runs solo (Preview a crowd) until one is set.');
for (const f of fs.readdirSync(dist)) if (/^test-/.test(f)) fs.rmSync(path.join(dist, f));
fs.rmSync(out, { force: true });
execFileSync('zip', ['-r', '-q', '-X', out, '.'], { cwd: dist, stdio: 'inherit' });
console.log('wrote', out, (fs.statSync(out).size / 1048576).toFixed(1), 'MB');
