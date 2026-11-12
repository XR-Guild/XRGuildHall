#!/usr/bin/env node
/**
 * Download the VRMs used to load-test avatar rendering with bots.
 *
 *   node scripts/fetch-test-avatars.mjs
 *
 * Files land in test-avatars/ (gitignored). The Vite dev server serves them at /test-avatars/<file>,
 * and builds leave them out. Avatars exported from the VIVERSE avatar creator go in test-avatars/viverse/
 * by hand (their licence prohibits redistribution, so they can't be fetched from anywhere); re-run this
 * script after adding some, so index.json lists them for the bots (src/testAvatars.ts).
 * The downloaded set spans light, medium and heavy avatars, because cost varies a
 * lot by mesh, material and spring-bone count, so one file repeated would understate the spread.
 * Every license here was checked against the VRM's own embedded meta, not only the registry listing:
 * the open-source-avatars registry lists some avatars as CC0 whose files say redistribution is prohibited.
 */
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-avatars');
const VRM_SPEC = 'https://raw.githubusercontent.com/vrm-c/vrm-specification/94e82dd346fa6cf0337c4421728640e5252dd38e/samples';

export const TEST_AVATARS = [
  { file: 'light-devil.vrm', url: 'https://arweave.net/gfVzs1oH_aPaHVxpQK86HT_rqzyrFPOUKUrDJ30yprs', credit: '100Avatars R1 #031 Devil, Polygonal Mind', license: 'CC0' },
  { file: 'light-polydancer.vrm', url: 'https://arweave.net/jPOg-G0MPH55ZQmamFhT9f8cHn-hjeAQ0mRO5gWeKMQ', credit: '100Avatars R1 Polydancer, Polygonal Mind', license: 'CC0' },
  { file: 'light-rose.vrm', url: 'https://arweave.net/Ea1KXujzJatQgCFSMzGOzp_UtHqB1pyia--U3AtkMAY', credit: '100Avatars R1 Rose, Polygonal Mind', license: 'CC0' },
  { file: 'light-pyresorcerer.vrm', url: 'https://arweave.net/Hc8Rd0EGKNHEevpm1D16BwP-LAPDS319Hvn0fualX_w', credit: '100Avatars R2 PyreSorcerer, Polygonal Mind', license: 'CC0' },
  { file: 'medium-cooltiger.vrm', url: 'https://arweave.net/2EQ5wsstsJaFOG9LXq_gVFKKgM8bnfPa3axYJ-VS1ug', credit: '100Avatars R3 CoolTiger, Polygonal Mind', license: 'CC0' },
  { file: 'medium-jenny.vrm', url: 'https://arweave.net/kgTirc4OvUWbJhIKC2CB3_pYsYuB62KTj90IdE8s3sk', credit: '100Avatars R3 Jenny, Polygonal Mind', license: 'CC0' },
  { file: 'medium-aurora.vrm', url: 'https://gateway.pinata.cloud/ipfs/QmVvfCcAKYozNQwwxPbHyNohLyBJbTrCBSM1Ycck3ouJSj/Avartar_Aurora.vrm', credit: 'Aurora, ToxSam', license: 'CC0' },
  { file: 'medium-eye-zealot.vrm', url: 'https://gateway.pinata.cloud/ipfs/QmYSHP8r4BKwyxMQwJMBWpJc1uE8EM7MDVXzNFhgFBesch/EyeZealot.vrm', credit: 'EYE Zealot, ToxSam', license: 'CC0' },
  { file: 'heavy-seed-san.vrm', url: `${VRM_SPEC}/Seed-san/vrm/Seed-san.vrm`, credit: 'Seed-san, VirtualCast, Inc.', license: 'VRM Public License 1.0' },
  { file: 'heavy-twist-sample.vrm', url: `${VRM_SPEC}/VRM1_Constraint_Twist_Sample/vrm/VRM1_Constraint_Twist_Sample.vrm`, credit: 'VRM1_Constraint_Twist_Sample, (c) 2022 pixiv Inc.', license: 'VRM Public License 1.0' },
];

await mkdir(DIR, { recursive: true });
for (const a of TEST_AVATARS) {
  const path = join(DIR, a.file);
  if (await stat(path).then(() => true, () => false)) { console.log('have ', a.file); continue; }
  const res = await fetch(a.url);
  if (!res.ok) { console.error(`fail  ${a.file}: HTTP ${res.status} from ${a.url}`); process.exitCode = 1; continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.toString('ascii', 0, 4) !== 'glTF') { console.error(`fail  ${a.file}: not a glTF binary`); process.exitCode = 1; continue; }
  await writeFile(path, buf);
  console.log(`got   ${a.file} (${(buf.length / 1048576).toFixed(1)} MB)`);
}
await writeFile(join(DIR, 'CREDITS.json'), JSON.stringify(TEST_AVATARS, null, 2) + '\n');
const all = (await readdir(DIR, { recursive: true })).filter(f => f.endsWith('.vrm')).map(f => f.split('\\').join('/')).sort();
await writeFile(join(DIR, 'index.json'), JSON.stringify(all, null, 2) + '\n');
console.log(`index.json lists ${all.length} VRMs (${all.filter(f => f.startsWith('viverse/')).length} in viverse/)`);
