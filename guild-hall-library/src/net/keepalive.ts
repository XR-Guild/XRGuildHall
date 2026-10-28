/**
 * Keeping a visitor present while their tab is hidden or their window is covered.
 *
 * Browsers stop requestAnimationFrame in hidden tabs and, after a few minutes, let page timers
 * fire only about once a minute. Dedicated-worker timers are not throttled that way, so anything
 * that keeps a connection alive runs its clock in a worker.
 */
const WORKER_SRC = `const t={};onmessage=e=>{const[op,id,ms]=e.data;
if(op==='c'){clearTimeout(t[id]);clearInterval(t[id]);delete t[id];return}
t[id]=(op==='i'?setInterval:setTimeout)(()=>{if(op==='t')delete t[id];postMessage(id)},ms)}`;

let worker: Worker | null | undefined;
const pending = new Map<number, { fn: (...a: any[]) => void; args: any[]; once: boolean }>();
let nextId = 1;

function getWorker() {
  if (worker !== undefined) return worker;
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = e => {
      const p = pending.get(e.data); if (!p) return;
      if (p.once) pending.delete(e.data);
      p.fn(...p.args);
    };
  } catch {
    // a CSP that forbids blob: workers: page timers still work, just less reliably once hidden
    worker = null;
  }
  return worker;
}

function start(op: 't' | 'i', fn: (...a: any[]) => void, ms = 0, args: any[]): any {
  const w = getWorker();
  if (!w) return op === 't' ? window.setTimeout(fn, ms, ...args) : window.setInterval(fn, ms, ...args);
  const id = nextId++;
  pending.set(id, { fn, args, once: op === 't' });
  w.postMessage([op, id, ms]);
  return id;
}
function stop(id: any) {
  if (id == null) return;
  if (worker) { pending.delete(id); worker.postMessage(['c', id]); }
  else { clearTimeout(id); clearInterval(id); }
}

/** Drop-in timer functions that keep firing on time in a background tab. */
export const workerTimers = {
  setTimeout: (fn: (...a: any[]) => void, ms?: number, ...args: any[]) => start('t', fn, ms, args),
  setInterval: (fn: (...a: any[]) => void, ms?: number, ...args: any[]) => start('i', fn, ms, args),
  clearTimeout: stop,
  clearInterval: stop,
};

/**
 * Keeps the screen awake while `wanted()` holds, since a phone or headset that sleeps suspends the page and drops
 * voice. Browsers release the lock whenever the page is hidden, so it is taken again on return.
 * Returns a function to call when `wanted()` may have changed.
 */
export function holdWakeLock(wanted: () => boolean): () => void {
  const wl = (navigator as any).wakeLock;
  if (!wl) return () => {};
  let lock: any = null, asking = false;
  const sync = async () => {
    const want = wanted() && !document.hidden;
    if (want && !lock && !asking) {
      asking = true;
      // refused inside a frame without allow="screen-wake-lock", or on low battery: the hall works without it
      try { lock = await wl.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch { /* */ } finally { asking = false; }
    } else if (!want && lock) { const l = lock; lock = null; l.release().catch(() => {}); }
  };
  document.addEventListener('visibilitychange', sync);
  return sync;
}

/** Calls fn every `ms`, even in a background tab. Returns a stop function. */
export function startTicker(ms: number, fn: () => void): () => void {
  const id = workerTimers.setInterval(fn, ms);
  return () => workerTimers.clearInterval(id);
}
