#!/usr/bin/env node
/**
 * Create the RTMP ingress for the Guild Hall media room (run once, from a maintainer's machine).
 *
 *   npm i -D livekit-server-sdk
 *   LIVEKIT_URL=https://xrguild-xxxx.livekit.cloud LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=… node scripts/create-ingress.mjs
 *
 * Prints the RTMP server URL and stream key for OBS (Settings → Stream → Service: Custom).
 * Treat the stream key like a password. Re-run with --list to see existing ingresses, --delete <id> to remove one.
 * Keys and secrets stay on your machine: nothing here ships in the world.
 */
import { IngressClient, IngressInput } from 'livekit-server-sdk';

const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
const ROOM = process.env.MEDIA_ROOM || 'guild-hall-media';
if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) { console.error('Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.'); process.exit(1); }
const client = new IngressClient(LIVEKIT_URL.replace(/^wss:/, 'https:'), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const arg = process.argv[2];
if (arg === '--list') { for (const i of await client.listIngress({ roomName: ROOM })) console.log(i.ingressId, i.name, i.url, i.state?.status); process.exit(0); }
if (arg === '--delete') { await client.deleteIngress(process.argv[3]); console.log('deleted'); process.exit(0); }
const info = await client.createIngress(IngressInput.RTMP_INPUT, {
  name: 'guild-hall-rtmp', roomName: ROOM,
  participantIdentity: 'ingress-stage', participantName: 'Stage stream',
});
console.log('\nRTMP ingress ready for room', ROOM);
console.log('  Server (OBS "Server"):     ', info.url);
console.log('  Stream key (OBS "Key"):    ', info.streamKey);
console.log('  Ingress id (to delete):    ', info.ingressId, '\n');
