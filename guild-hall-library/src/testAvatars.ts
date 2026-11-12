/**
 * Load-test avatars (scripts/fetch-test-avatars.mjs). Bots advertise a path under this folder rather than a full URL, and each
 * viewer loads it from its own origin: the bots' dev server and the viewer's are different origins, and a relative path can't
 * point a viewer at another host. Builds leave the folder out, so in the live world these paths 404 and show a mannequin.
 */
const TEST_AVATAR_DIR = 'test-avatars/';
/** Exports from the VIVERSE avatar creator go in this subfolder; they stand for what visitors actually wear. */
const VIVERSE_DIR = 'viverse/';

export const isTestAvatar = (url: string) => url.startsWith(TEST_AVATAR_DIR);

/** True for about `share` of indices, spread evenly over them. */
export const spread = (i: number, share: number) => Math.floor((i + 1) * share) > Math.floor(i * share);

/**
 * The avatar for global bot index `i`: VIVERSE avatars for `viverseShare` of the bots, the other test files for the rest.
 * `viverseUrls` (real VIVERSE avatar URLs, run-bots --vrm-urls) stand in for the exports in test-avatars/viverse/. Without
 * `files` only those URLs are used. Viewers decode VIVERSE URLs with the VIVERSE SDK, so they only show on VIVERSE.
 */
export async function testAvatarPicker(viverseShare: number, { files = true, viverseUrls = [] as string[] } = {}): Promise<(i: number) => string> {
  let listed: string[] = [];
  if (files) {
    const res = await fetch(`${TEST_AVATAR_DIR}index.json`);
    if (!res.ok) throw new Error(`${TEST_AVATAR_DIR}index.json: HTTP ${res.status}. Run node scripts/fetch-test-avatars.mjs`);
    listed = (await res.json() as string[]).map(f => TEST_AVATAR_DIR + f);
  }
  const isExport = (f: string) => f.startsWith(TEST_AVATAR_DIR + VIVERSE_DIR);
  const viverse = viverseUrls.length ? viverseUrls : listed.filter(isExport), rest = listed.filter(f => !isExport(f));
  const all = [...viverse, ...rest];
  if (!all.length) throw new Error(files ? `${TEST_AVATAR_DIR}index.json lists no VRMs` : 'No VIVERSE avatar URLs given');
  return i => {
    const v = spread(i, viverseShare);
    // position among the bots that draw from the same pool, so each pool cycles through all its files
    const viverseBefore = Math.floor(i * viverseShare);
    const n = v ? viverseBefore : i - viverseBefore;
    const own = v ? viverse : rest, pool = own.length ? own : all;
    return pool[n % pool.length];
  };
}
