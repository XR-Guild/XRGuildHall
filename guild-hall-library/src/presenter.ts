/**
 * Presenter page (presenter.html): share a window to the Guild Hall stage screen through the LiveKit media room.
 * Runs outside VIVERSE on purpose: screen capture needs a top-level page, and VIVERSE runs worlds inside a frame.
 */
import { CONFIG, loadConfig } from './config';

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const status = (t: string) => { $('#status').textContent = t; };
let room: any = null;

async function start() {
  await loadConfig();
  if (!CONFIG.media.tokenUrl) { status('This build has no media room configured (VITE_MEDIA_TOKEN_URL).'); return; }
  const { Room, RoomEvent, Track } = await import('livekit-client');
  const res = await fetch(CONFIG.media.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'presenter', identity: crypto.randomUUID().slice(0, 12), name: $<HTMLInputElement>('#name').value.trim() || 'Presenter', presenterKey: $<HTMLInputElement>('#key').value }) });
  if (res.status === 401) { status('That passphrase was not recognised.'); return; }
  if (!res.ok) { status('The media room refused the request (' + res.status + ').'); return; }
  const { token, url } = await res.json();
  room = new Room();
  room.on(RoomEvent.Disconnected, () => { status('Disconnected.'); $<HTMLButtonElement>('#stop').disabled = true; $<HTMLButtonElement>('#go').disabled = false; });
  room.on(RoomEvent.LocalTrackUnpublished, () => { status('Sharing stopped.'); stop(); });
  status('Connecting…');
  await room.connect(url, token);
  await room.localParticipant.setScreenShareEnabled(true, { audio: true, contentHint: 'detail', resolution: { width: 1920, height: 1080, frameRate: 15 } } as any);
  const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  pub?.track?.attach($<HTMLVideoElement>('#preview'));
  $<HTMLButtonElement>('#go').disabled = true; $<HTMLButtonElement>('#stop').disabled = false;
  status('Sharing. Ask a Guild admin to set the stage screen to "Live: screenshare".');
}
async function stop() {
  const r = room; room = null;
  if (r) { try { await r.localParticipant.setScreenShareEnabled(false); } catch { /* */ } await r.disconnect(); }
  $<HTMLButtonElement>('#go').disabled = false; $<HTMLButtonElement>('#stop').disabled = true;
}
$('#f').addEventListener('submit', e => { e.preventDefault(); start().catch(err => { status('Could not share: ' + (err?.message ?? err)); stop(); }); });
$('#stop').addEventListener('click', () => { stop(); status('Sharing stopped.'); });
