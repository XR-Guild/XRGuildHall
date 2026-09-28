// Turns dist-single/index.html (one inlined page) into artifact/index.html:
// the page body plus its <title>, font links, styles and script, without the
// <html>/<head>/<body> wrappers the artifact host adds itself.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
// Models: artifact hosting serves .json/.jpg/.png but not .glb, so the models ship
// as glTF JSON (geometry embedded) + image files. See scripts/gltf-for-artifact.py.
const html = readFileSync('dist-single/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map(m => m[0]).join('\n');
const title = pick(/<title>[\s\S]*?<\/title>/g);
const links = pick(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/g) + '\n' + pick(/<link rel="preconnect"[^>]+>/g);
const styles = pick(/<style[\s\S]*?<\/style>/g);
const scripts = pick(/<script type="module"[\s\S]*?<\/script>/g);
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script type="module"[\s\S]*?<\/script>/g, '');
mkdirSync('artifact/models', { recursive: true });
const flag = `<script>window.__XRGH_MODEL_EXT__ = '.json';</script>`;
writeFileSync('artifact/index.html', [title, links, styles, body, flag, scripts].join('\n'));
console.log('artifact/index.html', (Buffer.byteLength(readFileSync('artifact/index.html')) / 1e6).toFixed(2), 'MB');
