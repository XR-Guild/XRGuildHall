// Artifact build only: the single-file preview has no voice server, so LiveKit is left out to keep the page small.
export const Room = class { constructor() { throw new Error('Voice is not available in this preview build'); } };
export const RoomEvent = {} as Record<string, string>;
