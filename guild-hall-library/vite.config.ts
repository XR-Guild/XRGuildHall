import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
const stub = (f: string) => fileURLToPath(new URL(`./src/stubs/${f}`, import.meta.url));

// `npm run build`         → dist/ (multi-file, for self-hosting over HTTPS)
// `npm run build:single`  → dist-single/ (one inlined HTML + models/, used for the artifact)
export default defineConfig(({ mode }) => ({
  base: './',
  resolve: { alias: { '@drawcall/uikitml': stub('uikitml.ts'), '@babylonjs/havok': stub('havok.ts'), ...(mode === 'single' ? { 'livekit-client': stub('livekit.ts'), '@pixiv/three-vrm': stub('three-vrm.ts') } : {}) } },
  build: mode === 'single'
    ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false, target: 'es2022', chunkSizeWarningLimit: 8000 }
    : { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 8000 },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  server: { host: true },
}));
