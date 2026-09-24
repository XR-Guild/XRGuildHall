// Build-time stub. Physics is disabled in this world, so the Havok WASM is not shipped.
export default async function HavokPhysics(): Promise<never> { throw new Error('Havok physics is not bundled in this build.'); }
