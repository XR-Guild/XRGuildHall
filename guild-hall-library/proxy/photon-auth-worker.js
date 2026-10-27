// Cloudflare Worker: Photon Custom Authentication for the Guild Hall (verified admins).
//
// Photon calls this URL every time a visitor connects (Photon dashboard → your Voice app → Manage →
// Authentication → Custom Server, URL = https://<this worker>/auth, "Allow anonymous clients" OFF).
// The page sends `key` (empty for guests) and `name` as auth parameters; the passphrase is checked HERE,
// never in the page. The answer's UserId is stamped on the visitor's Photon actor by the Photon server, so
// other visitors can trust it:
//   guests  → UserId "guest:<random>"
//   admins  → UserId "admin:<label>"     (room settings: seating, audio mode, spotlight, screens, mute)
//
// Variables (Worker → Settings → Variables):
//   ADMIN_KEYS   [secret] comma list of "label=passphrase" pairs, e.g.  evo=long-random-words,patrick=other-words
//                Use long passphrases and rotate them after public events.
//   SHARED_SECRET [secret, optional] also set as a "Custom Server" query parameter in the Photon dashboard
//                (…/auth?secret=…); requests without it are refused, so only Photon can call this worker.
//
// Photon's custom auth protocol: GET with the client's auth parameters as query string; answer JSON with
// ResultCode 1 (ok), 2 (refused) or 3 (missing parameters), plus UserId on success.

const enc = new TextEncoder();
function same(a, b) {
  const x = enc.encode(a), y = enc.encode(b); let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
const json = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/auth') return new Response('Not found', { status: 404 });
    if (env.SHARED_SECRET && !same(url.searchParams.get('secret') || '', env.SHARED_SECRET)) return json({ ResultCode: 2, Message: 'Not Photon' });
    // Photon sends client values as query parameters (GET) or as a JSON body (POST, if configured)
    let params = url.searchParams;
    if (req.method === 'POST') { try { const b = await req.json(); params = new URLSearchParams(Object.entries(b).map(([k, v]) => [k, String(v)])); } catch { /* keep query */ } }
    const key = params.get('key') || '';
    const name = (params.get('name') || 'Guest').slice(0, 32);
    if (!key) return json({ ResultCode: 1, UserId: 'guest:' + crypto.randomUUID().slice(0, 12), Nickname: name });
    for (const pair of (env.ADMIN_KEYS || '').split(',')) {
      const i = pair.indexOf('='); if (i < 1) continue;
      const label = pair.slice(0, i).trim().replace(/[^\w-]/g, '').slice(0, 24), pass = pair.slice(i + 1).trim();
      if (pass && same(pass, key)) return json({ ResultCode: 1, UserId: 'admin:' + label, Nickname: name });
    }
    // a wrong passphrase still lets the visitor in, as a guest, so a typo never locks someone out of the room
    return json({ ResultCode: 1, UserId: 'guest:' + crypto.randomUUID().slice(0, 12), Nickname: name, Data: { admin: false } });
  },
};
