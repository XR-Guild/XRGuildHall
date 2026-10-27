/** Inject a classic <script> once; resolves immediately when `ready()` says the global is already there. */
export function loadScript(src: string, ready: () => boolean, failure: string) {
  return new Promise<void>((res, rej) => {
    if (ready()) return res();
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error(failure));
    document.head.appendChild(s);
  });
}
