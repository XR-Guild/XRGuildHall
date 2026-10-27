// Cloudflare Worker: short-lived LiveKit tokens for the Guild Hall MEDIA room (stream screens + screenshare).
// Voice does NOT use this: voice is Photon. This room only carries video (and the stream's own sound).
//
// Set these in the Worker's settings (Settings → Variables). Secrets never reach the browser.
//   LIVEKIT_API_KEY, LIVEKIT_API_SECRET   from LiveKit Cloud → Settings → Keys                       [secret]
//   LIVEKIT_URL                           e.g. wss://xrguild-xxxx.livekit.cloud
//   ALLOWED_ORIGINS                       comma list of page origins, e.g.
//                                         https://xr-guild.github.io,https://worlds.viverse.com,https://create.viverse.com
//   PRESENTER_KEYS                        comma list of passphrases that may share a screen             [secret]
//   MEDIA_ROOM                            optional, default "guild-hall-media"
//   MAX_VIEWERS                           optional cap on viewer tokens per hour (simple budget guard), default 0 = off
//
// POST { identity, name, role: "viewer" | "presenter", presenterKey? }  →  { token, url }
//   viewer     subscribe only: cannot publish anything, cannot send data
//   presenter  may publish a screenshare (video + its sound) only; no camera, no microphone
// The RTMP stream does not need a token: create a LiveKit Ingress once (scripts/create-ingress.mjs) and give
// its RTMP URL + stream key to whoever runs OBS.

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64urlStr = (s) => b64url(enc.encode(s));

async function sign(payload, secret) {
  const data = `${b64urlStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64urlStr(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${data}.${b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)))}`;
}

// constant-time compare, so a passphrase can't be guessed from response timing
function same(a, b) {
  const x = enc.encode(a), y = enc.encode(b); let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
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
    const room = env.MEDIA_ROOM || 'guild-hall-media';
    const role = body.role === 'presenter' ? 'presenter' : 'viewer';
    const identity = (role === 'presenter' ? 'presenter-' : 'viewer-') + String(body.identity || crypto.randomUUID()).slice(0, 40).replace(/[^\w-]/g, '');
    const name = String(body.name || (role === 'presenter' ? 'Presenter' : 'Guest')).slice(0, 32);
    if (role === 'presenter') {
      const keys = (env.PRESENTER_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
      const given = String(body.presenterKey || '');
      if (!given || !keys.some(k => same(k, given))) return new Response('Presenter passphrase not recognised', { status: 401, headers: c.headers });
    }
    const now = Math.floor(Date.now() / 1000);
    const video = role === 'presenter'
      ? { room, roomJoin: true, canSubscribe: true, canPublish: true, canPublishData: false, canPublishSources: ['screen_share', 'screen_share_audio'] }
      : { room, roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: false, hidden: true };
    const token = await sign({ iss: env.LIVEKIT_API_KEY, sub: identity, name, nbf: now - 10, exp: now + 4 * 3600, video }, env.LIVEKIT_API_SECRET);
    return new Response(JSON.stringify({ token, url: env.LIVEKIT_URL }), { headers: { ...c.headers, 'content-type': 'application/json', 'cache-control': 'no-store' } });
  },
};
