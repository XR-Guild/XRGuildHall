#!/usr/bin/env node
// Photon voice load test (Tier 2 in docs/PHOTON-VOICE-SPIKE.md): one headless Chromium with K tabs, each running bots.html with
// --per-page Photon clients (bots.html), each pushing a speech clip into its outgoing voice.
//
//   node scripts/load/run-bots.mjs --room loadtest-abc --total 19 [--per-page 5] [--duration 300] [--mic 1] [--stage]
//   node scripts/load/run-bots.mjs --viverse --total 5 [...]
//                                  [--base http://localhost:5173] [--wav speech.wav] [--synth] [--headed] [--region us]
//
// --viverse: bots join like visitors to the VIVERSE build, so a logged-in VIVERSE client sees and hears them. Presence goes over
// the VIVERSE Play SDK without a login, voice over the VIVERSE voice room; that room is shared with everyone in the world.
// Without --base it starts the Vite dev server itself (which reads VITE_PHOTON_APP_ID from .env.local); VITE_LOG=info shows its log.
// Without --wav each bot says "I am bot number N", spoken by macOS `say`, so a listener can tell which avatar a voice comes from.
// Where `say` is missing, or with --synth, the bots synthesise a speech-like clip instead.
// Needs only Node and Playwright's Chromium (npx playwright install chromium).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const { values: a } = parseArgs({
  options: {
    room: { type: 'string' }, total: { type: 'string', default: '19' }, 'per-page': { type: 'string', default: '1' },
    duration: { type: 'string', default: '300' }, mic: { type: 'string', default: '1' }, stage: { type: 'boolean', default: false }, viverse: { type: 'boolean', default: false },
    base: { type: 'string' }, wav: { type: 'string' }, synth: { type: 'boolean', default: false }, headed: { type: 'boolean', default: false }, region: { type: 'string' },
  },
});
if (a.viverse && a.room) { console.error('--room does not apply with --viverse: VIVERSE bots join the world\'s own rooms.'); process.exit(2); }
if (!a.viverse && (!a.room || a.room === 'guild-hall')) { console.error('Pass --room <private room name>; the live room "guild-hall" is refused.'); process.exit(2); }
const total = Math.max(1, +a.total), perPage = Math.max(1, +a['per-page']), duration = Math.max(10, +a.duration);
const instances = Math.ceil(total / perPage);

// the system default can be a Siri voice, which writes an empty file, so name standard voices; rotating them tells bots apart
const SAY_VOICES = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Rishi', 'Tessa'];
const PHRASE = n => `I am bot number ${n}. [[slnc 3000]]`;
/**
 * One clip per bot, with a pause after the phrase so the loop doesn't run the words together. Clips are kept between
 * runs in a folder named after the phrase and voices, so only missing ones are made (`say` takes about a second each).
 */
async function sayClips() {
  const run = promisify(execFile);
  const dir = join(tmpdir(), `xrgh-bot-clips-${createHash('sha1').update(PHRASE('N') + SAY_VOICES).digest('hex').slice(0, 8)}`);
  try {
    await mkdir(dir, { recursive: true });
    const installed = (await run('say', ['-v', '?'])).stdout.split('\n').map(l => l.split(/\s{2,}/)[0]);
    const voices = SAY_VOICES.filter(v => installed.includes(v));
    if (!voices.length) throw new Error('no standard voices');
    const missing = [];
    for (let n = 1; n <= total; n++) if (!(await stat(join(dir, `${n}.wav`)).catch(() => null))) missing.push(n);
    if (missing.length) console.log(`Making ${missing.length} voice clip(s) in ${dir}`);
    for (let k = 0; k < missing.length; k += 8) {
      await Promise.all(missing.slice(k, k + 8).map(async n => {
        const file = join(dir, `${n}.wav`);
        await run('say', ['-v', voices[(n - 1) % voices.length], '-o', file, '--data-format=LEI16@48000', PHRASE(n)]);
        if ((await stat(file)).size < 10000) { await rm(file, { force: true }); throw new Error('say wrote no audio'); }
      }));
    }
    return dir;
  } catch { return null; }
}
const clipDir = a.wav || a.synth ? null : await sayClips();
if (!a.wav && !a.synth && !clipDir) console.log('macOS `say` is unavailable: the bots will use the synthesised clip.');

let server = null, base = a.base;
if (!base) {
  server = await createServer({ root: fileURLToPath(new URL('../..', import.meta.url)), logLevel: process.env.VITE_LOG ?? 'warn', server: { port: 5199, open: false, hmr: false, watch: null } });
  await server.listen();
  base = server.resolvedUrls.local[0];
}
const browsers = [];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return; stopping = true;
  await Promise.allSettled(browsers.map(b => b.close()));
  await server?.close();
  process.exit(code);
}
process.on('SIGINT', () => { console.log('\nStopping…'); stop(0); });
process.on('unhandledRejection', e => { console.error(e?.message ?? e); stop(1); });

if (a.viverse) console.log('VIVERSE mode: the bots join the VIVERSE world\'s room and its voice room, alongside anyone else in the world.');
console.log(`${total} bots in ${a.viverse ? 'the VIVERSE world' : `room "${a.room}"`}: ${instances} tab(s) × up to ${perPage} per tab, for ${duration} s. Base ${base}`);
const pages = [];
// one browser with a tab per page: tabs keep their own renderer (and JS thread) without a browser, GPU and network process each
const browser = await chromium.launch({ headless: !a.headed, args: ['--disable-gpu', '--mute-audio'] });
browsers.push(browser);
for (let k = 0; k < instances; k++) {
  const n = Math.min(perPage, total - k * perPage);
  // a context per tab, so the VIVERSE SDK's storage isn't shared between pages
  const page = await (await browser.newContext()).newPage();
  if (a.wav) await page.route('**/bot-clip', r => r.fulfill({ path: resolve(a.wav) }));
  if (clipDir) await page.route('**/bot-clip/*', r => r.fulfill({ path: join(clipDir, `${new URL(r.request().url()).pathname.split('/').pop()}.wav`) }));
  page.on('console', m => { if (m.type() === 'error' || m.text().startsWith('[bots]')) console.log(`  [page ${k}] ${m.text()}`); });
  page.on('pageerror', e => console.log(`  [page ${k}] ${e.message}`));
  const q = new URLSearchParams({ ...(a.viverse ? { viverse: '1' } : { room: a.room }), bots: String(n), first: String(k * perPage), mic: a.mic, ...(a.stage && k === 0 ? { stage: '1' } : {}), ...(a.region ? { region: a.region } : {}), ...(a.wav ? { clip: 'bot-clip' } : clipDir ? { clip: 'bot-clip/{n}' } : {}) });
  await page.goto(new URL(`bots.html?${q}`, base).href);
  pages.push(page);
}

const status = async () => {
  const s = await Promise.all(pages.map(p => p.evaluate(() => window.__bots ?? { joined: 0, errors: [] }).catch(() => ({ joined: 0, errors: ['page closed'] }))));
  return { joined: s.reduce((n, x) => n + x.joined, 0), sent: s.reduce((n, x) => n + (x.framesSent ?? 0), 0), fewestPeers: Math.min(...s.map(x => x.fewestPeers ?? 0)), peers: s.flatMap(x => x.peers ?? []), rooms: [...new Set(s.flatMap(x => x.rooms ?? []))], people: [...new Set(s.flatMap(x => x.people ?? []))], errors: s.flatMap(x => x.errors) };
};
let lastSent = 0;
const until = Date.now() + duration * 1000;
const timer = setInterval(async () => {
  const s = await status();
  const sent = Math.round((s.sent - lastSent) / 10); lastSent = s.sent;
  console.log(`${new Date().toISOString().slice(11, 19)}  joined ${s.joined}/${total}, each sees ≥${s.fewestPeers} others  voice frames sent ${sent}/s  per bot sees [${s.peers.join(',')}]  room ${s.rooms.join('/')}  people: ${s.people.join(', ') || 'none'}${s.errors.length ? `  errors: ${s.errors.join('; ')}` : ''}  (${Math.round((until - Date.now()) / 1000)} s left)`);
  if (Date.now() > until) { clearInterval(timer); stop(0); }
}, 10000);
