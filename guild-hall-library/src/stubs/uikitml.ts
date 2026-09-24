// Build-time stub. This world renders its panels on canvas and runs with
// spatialUI disabled, so IWSDK's UIKitML compiler and its MSDF font set
// (~12 MB) are never called. Aliased in vite.config.ts.
const off = () => { throw new Error('UIKitML is not bundled in this build (spatialUI is disabled).'); };
export const instantiate = off;
export const parse = off;
export const resolveKitComponentSets = () => ({});
