// Optional: a tiny Cloudflare Worker that lets the self-hosted Guild Hall call
// the XR Guild Library's GitBook "ask" endpoint, which does not send CORS headers.
//
// Deploy:  npx wrangler deploy proxy/ask-worker.js --name xrguild-ask
// Then build the site with:  VITE_ASK_PROXY=https://xrguild-ask.<you>.workers.dev npm run build
//
// It forwards only the question text, to one fixed library URL, and only answers
// requests from the origins you list. No logging, no storage.
const ALLOWED_ORIGINS = ['https://hall.xrguild.org', 'http://localhost:5173'];
const TARGET = 'https://library.xrguild.org/xr-guild-library-2.0.md';

export default {
  async fetch(req) {
    const origin = req.headers.get('origin') || '';
    const cors = ALLOWED_ORIGINS.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {};
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'access-control-allow-methods': 'GET' } });
    if (!cors['access-control-allow-origin']) return new Response('Origin not allowed', { status: 403 });
    const q = new URL(req.url).searchParams.get('ask')?.trim().slice(0, 500);
    if (!q) return new Response('Missing ?ask=', { status: 400, headers: cors });
    const r = await fetch(`${TARGET}?ask=${encodeURIComponent(q)}`, { headers: { 'user-agent': 'XRGuildHall/1.0' } });
    return new Response(await r.text(), { status: r.status, headers: { ...cors, 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  },
};
