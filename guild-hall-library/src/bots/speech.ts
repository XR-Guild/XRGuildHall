/**
 * A speech-like clip for the load-test bots: vowel-like syllables (a glottal pulse train through formant resonators)
 * at a speaking rate, with pauses between phrases. Opus codes it like speech, and it trips the speaking ring.
 */
export function synthSpeech(seconds: number, rate: number): Float32Array {
  const n = seconds * rate, x = new Float32Array(n);
  const vowels = [[730, 1090, 2440], [270, 2290, 3010], [300, 870, 2240], [530, 1840, 2480], [570, 840, 2410]];
  const bandpass = (f: number, q: number) => {
    const w = 2 * Math.PI * f / rate, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (v: number) => { const y = b0 * v + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; return y; };
  };
  let t = Math.floor(0.3 * rate), phase = 0;
  while (t < n - rate / 2) {
    const syllables = 2 + Math.floor(Math.random() * 6);
    for (let w = 0; w < syllables && t < n - rate / 2; w++) {
      const len = Math.floor((0.12 + Math.random() * 0.16) * rate), v = vowels[Math.floor(Math.random() * vowels.length)];
      const [f1, f2, f3] = [bandpass(v[0], 5), bandpass(v[1], 8), bandpass(v[2], 10)], f0 = 105 + Math.random() * 70;
      for (let i = 0; i < len && t + i < n; i++) {
        const env = Math.sin(Math.PI * i / len) ** 0.6;
        phase += f0 * (1 + 0.08 * Math.sin(i / len * 3)) / rate;
        const src = phase % 1 < 0.12 ? 1 : -0.14;
        const fric = i < len * 0.18 ? (Math.random() * 2 - 1) * 0.18 : 0; // consonant onset
        x[t + i] = env * (f1(src) + 0.6 * f2(src) + 0.3 * f3(src) + fric);
      }
      t += len + Math.floor(Math.random() * 0.05 * rate);
    }
    t += 3 * rate;
  }
  let peak = 1e-6; for (const v of x) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) x[i] *= 0.5 / peak;
  return x;
}

/**
 * Per sample: 1 where the clip is speaking, 0 inside a pause of at least `minGap` seconds. Bots send nothing during
 * those pauses, like a visitor who turns their mic off between remarks; short gaps between words stay on.
 */
export function speakingMask(clip: Float32Array, rate: number, minGap = 0.5): Uint8Array {
  const mask = new Uint8Array(clip.length).fill(1), min = minGap * rate;
  for (let i = 0; i < clip.length;) {
    if (Math.abs(clip[i]) >= 1e-3) { i++; continue; }
    let j = i; while (j < clip.length && Math.abs(clip[j]) < 1e-3) j++;
    if (j - i >= min) mask.fill(0, i, j);
    i = j;
  }
  return mask;
}

/** Fetch an audio file and resample it to mono at `rate`; OfflineAudioContext decodes without a running audio device. */
export async function loadClip(url: string, rate: number): Promise<Float32Array> {
  const buf = await (await fetch(url)).arrayBuffer();
  const audio = await new OfflineAudioContext(1, 1, rate).decodeAudioData(buf);
  const out = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = 0; i < d.length; i++) out[i] += d[i] / audio.numberOfChannels; }
  return out;
}
