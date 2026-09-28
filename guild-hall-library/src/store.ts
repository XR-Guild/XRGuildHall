// Tiny shared state between the 3D panels and the 2D interface.
type Fn = () => void;
const subs = new Set<Fn>();
const KEY = 'xrguild-hall-reading-list';

function load(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export const store = {
  reading: new Set<string>(load()),
  toggleReading(url: string) {
    this.reading.has(url) ? this.reading.delete(url) : this.reading.add(url);
    try { localStorage.setItem(KEY, JSON.stringify([...this.reading])); } catch { /* storage unavailable: keep in memory */ }
    emit();
  },
  // requests from the world to the 2D UI
  openTab: null as null | ((tab: 'welcome' | 'library' | 'timeline' | 'ask' | 'news' | 'reading', opts?: { cat?: string; query?: string; era?: number | null; id?: string }) => void),
  showCard: null as null | ((html: string) => void),
};
export function emit() { subs.forEach(f => f()); }
export function subscribe(f: Fn) { subs.add(f); return () => subs.delete(f); }
