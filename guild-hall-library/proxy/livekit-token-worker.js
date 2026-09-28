// Cloudflare Worker: issues short-lived LiveKit Cloud access tokens for the Guild Hall.
//
// Secrets never reach the browser. Set these in the Worker's settings:
//   LIVEKIT_API_KEY, LIVEKIT_API_SECRET   (from LiveKit Cloud → Settings → Keys)   [secret]
//   LIVEKIT_URL                           e.g. wss://xrguild-xxxx.livekit.cloud
//   ALLOWED_ORIGINS                       comma list, e.g. https://hall.xrguild.org,https://worlds.viverse.com
//   HOST_KEYS                             optional comma list of passphrases that grant the "host" role [secret]
//
// POST { identity, name, room, hostKey? }  →  { token, url }
// Rooms are limited to the "guild-hall" family. Tokens last 2 hours.
// Hosts get the attribute host=1, which the client checks before applying seating/mute controls.

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64urlStr = (s) => b64url(enc.encode(s));

async function sign(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const data = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return { ok, headers: { 'Access-Control-Allow-Origin': ok ? origin : 'null', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Vary': 'Origin' } };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const c = cors(origin, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
    if (req.method !== 'POST' || !c.ok) return new Response('Forbidden', { status: 403, headers: c.headers });
    let body;
    try { body = await req.json(); } catch { return new Response('Bad request', { status: 400, headers: c.headers }); }
    const identity = String(body.identity || '').slice(0, 40).replace(/[^\w-]/g, '');
    const name = String(body.name || 'Guest').slice(0, 32);
    const room = String(body.room || 'guild-hall').slice(0, 40);
    if (!identity || !/^guild-hall(-\d+)?$/.test(room)) return new Response('Bad request', { status: 400, headers: c.headers });
    const hosts = (env.HOST_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
    const isHost = !!body.hostKey && hosts.includes(String(body.hostKey));
    const now = Math.floor(Date.now() / 1000);
    const token = await sign({
      iss: env.LIVEKIT_API_KEY, sub: identity, name, nbf: now - 10, exp: now + 2 * 3600,
      video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: ['microphone'], roomAdmin: isHost },
      attributes: isHost ? { host: '1' } : {},
    }, env.LIVEKIT_API_SECRET);
    return new Response(JSON.stringify({ token, url: env.LIVEKIT_URL }), { headers: { ...c.headers, 'content-type': 'application/json', 'cache-control': 'no-store' } });
  },
};
