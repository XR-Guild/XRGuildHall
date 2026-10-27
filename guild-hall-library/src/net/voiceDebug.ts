import type { PhotonSession } from './photon';

/**
 * ?debug=voice: a corner readout of what the voice load test measures on a real client (docs/PHOTON-VOICE-SPIKE.md, Tier 2),
 * with a console line every 10 s so a headset's numbers can be read over remote DevTools.
 */
export function voiceDebugOverlay(voice: () => PhotonSession | null) {
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;color:#cfe;background:#000b;border-radius:4px;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  let last: PhotonSession | null = null, under = 0, frames = 0, t = performance.now(), ticks = 0;
  setInterval(() => {
    const v = voice(), now = performance.now(), dt = (now - t) / 1000; t = now;
    if (!v || !v.ctx) { el.textContent = 'voice: not connected'; last = null; return; }
    if (v !== last) { last = v; under = v.underruns; frames = v.framesDecoded; }
    const { incoming, audible } = v.voiceCounts;
    const underPerS = (v.underruns - under) / dt, framesPerS = (v.framesDecoded - frames) / dt;
    under = v.underruns; frames = v.framesDecoded;
    const ms = (s: number | undefined) => s === undefined ? 'n/a' : `${Math.round(s * 1000)} ms`;
    const lines = [
      `voices in   ${incoming} (audible ${audible})`,
      `decoded     ${framesPerS.toFixed(0)} frames/s`,
      `underruns   ${underPerS.toFixed(1)}/s`,
      `out latency ${ms(v.ctx.outputLatency)} + base ${ms(v.ctx.baseLatency)}`,
    ];
    el.textContent = lines.join('\n');
    if (++ticks % 10 === 0) console.info('[voice] ' + lines.map(l => l.replace(/\s+/g, ' ')).join(' · '));
  }, 1000);
}
