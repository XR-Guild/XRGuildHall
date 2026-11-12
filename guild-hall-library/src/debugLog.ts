/**
 * The last few hundred console lines, kept in the page so an admin can read them from the Admin panel.
 * On VIVERSE the world runs inside the platform's page, where visitors and headsets have no DevTools.
 * Nothing here leaves the browser.
 */
const MAX_LINES = 400;
const lines: string[] = [];
const listeners = new Set<() => void>();

const fmt = (a: unknown) => {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try { return JSON.stringify(a); } catch { return String(a); }
};
function add(level: string, args: unknown[]) {
  const t = new Date().toISOString().slice(11, 19);
  lines.push(`${t} ${level} ${args.map(fmt).join(' ')}`);
  if (lines.length > MAX_LINES) lines.shift();
  for (const l of listeners) l();
}

/** Imported first by main.ts, so it is installed before any other module runs. */
(function captureConsole() {
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => { add(level.toUpperCase().padEnd(5), args); orig(...args); };
  }
  addEventListener('error', e => add('ERROR', [e.message, `${e.filename}:${e.lineno}`]));
  addEventListener('unhandledrejection', e => add('ERROR', ['unhandled rejection:', e.reason]));
  add('INFO ', [navigator.userAgent]);
})();

export const debugLog = {
  text: () => lines.join('\n'),
  onChange(fn: () => void) { listeners.add(fn); },
};
