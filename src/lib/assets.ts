import manifest from 'virtual:asset-manifest';
import { ROLES, ROLE_FILE, ROLE_NAME, type Role } from './roles.ts';
import type { PublicPlayer } from './roster.ts';

/**
 * Optional official artwork. The owner drops PNGs into public/assets; the app
 * only requests files the build found there (see plugins/assetManifest.ts),
 * so a missing file never causes a failed request, just a placeholder.
 */
const FOUND = new Set(manifest);
const BY_LOWER = new Map(manifest.map((f) => [f.toLowerCase(), f]));

export const champPath = (key: string) => `assets/champions/${key}.png`;
export const rolePath = (role: Role) => `assets/roles/${ROLE_FILE[role]}.png`;
export const MAP_PATH = 'assets/map/summoners-rift.png';

/** Splash art for the page backdrop: any image in public/assets/backgrounds, any name. */
export const BACKGROUNDS_DIR = 'assets/backgrounds/';
export const backgroundFiles: string[] = manifest.filter((f) => f.startsWith(BACKGROUNDS_DIR) && /\.(jpe?g|png|webp)$/i.test(f));

/** "Udyr_0.jpg" → "Udyr", "MasterYi_3.jpg" → "Master Yi 3". */
export const backgroundLabel = (path: string) =>
  path
    .slice(BACKGROUNDS_DIR.length)
    .replace(/\.[a-z]+$/i, '')
    .replace(/_0$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');

export type AssetState = { kind: 'found' } | { kind: 'missing' } | { kind: 'wrong-case'; actual: string };

export function assetState(path: string): AssetState {
  if (FOUND.has(path)) return { kind: 'found' };
  const near = BY_LOWER.get(path.toLowerCase());
  return near ? { kind: 'wrong-case', actual: near } : { kind: 'missing' };
}

/** URL for an image that exists, or null (show the placeholder). */
export function assetUrl(path: string): string | null {
  return FOUND.has(path) ? import.meta.env.BASE_URL + path : null;
}

export interface ImageSpec {
  path: string;
  what: string;
  shape: string;
  shownAt: string;
}

export function imageSpecs(players: PublicPlayer[]): { group: string; items: ImageSpec[] }[] {
  const champs = new Map<string, string>();
  for (const p of players) for (const o of p.ot) champs.set(o.key, o.champ);
  return [
    {
      group: 'Champion icons',
      items: [...champs].map(([key, champ]) => ({
        path: champPath(key),
        what: `${champ} champion icon`,
        shape: 'square',
        shownAt: '18–32 px',
      })),
    },
    {
      group: 'Role icons',
      items: ROLES.map((r) => ({
        path: rolePath(r),
        what: `${ROLE_NAME[r]} role icon, light on transparent`,
        shape: 'square',
        shownAt: '16–24 px',
      })),
    },
    {
      group: 'Map (optional)',
      items: [{ path: MAP_PATH, what: "Summoner's Rift map, blue base bottom left", shape: 'square', shownAt: 'up to 640 px' }],
    },
  ];
}
