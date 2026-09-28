// Artifact build only: VRM avatars load in the full build (VIVERSE / self-hosted). The preview shows mannequins.
export const VRMLoaderPlugin = class { constructor() { throw new Error('VRM is not available in this preview build'); } };
export const VRMUtils = {} as any;
