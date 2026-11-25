import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { assetUrl, champPath, rolePath } from '../lib/assets.ts';
import { ROLE_NAME, type Role } from '../lib/roles.ts';

/* Original placeholder glyphs (no Riot artwork). */
const GLYPH: Record<Role, ReactNode> = {
  top: <path d="M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z" />,
  jg: (
    <>
      <path d="M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14z" />
      <path d="M5 19l8.5-8.5" />
    </>
  ),
  mid: <path d="M13.5 2.5 5.5 13.5h6l-1 8 8-11h-6z" />,
  adc: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5" />
    </>
  ),
  sp: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
};

export function RoleGlyph({ role, className = 'gl' }: { role: Role; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {GLYPH[role]}
    </svg>
  );
}

/* Images that exist but fail to load (corrupt, wrong format) are tracked so
   Settings can say so; the placeholder shows instead. */
const broken = new Set<string>();
const listeners = new Set<() => void>();
let brokenVersion = 0;
function markBroken(path: string) {
  if (broken.has(path)) return;
  broken.add(path);
  brokenVersion++;
  listeners.forEach((l) => l());
}
export function useBrokenImages(): ReadonlySet<string> {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => brokenVersion,
  );
  return broken;
}

/** An optional image from public/assets, or `fallback` if it isn't there. */
export function AssetImg({ path, className, fallback, alt = '' }: { path: string; className?: string; fallback: ReactNode; alt?: string }) {
  const url = assetUrl(path);
  const [failed, setFailed] = useState(false);
  if (!url || failed || broken.has(path)) return <>{fallback}</>;
  return (
    <img
      src={url}
      alt={alt}
      className={className}
      draggable={false}
      decoding="async"
      onError={() => {
        markBroken(path);
        setFailed(true);
      }}
    />
  );
}

/** Splash art fixed behind the whole page, darkened so text stays readable. */
export function Backdrop({ path }: { path: string }) {
  return (
    <div className="backdrop" aria-hidden="true">
      <AssetImg path={path} fallback={null} />
    </div>
  );
}

/** Role icon: the official one if supplied, else the glyph. Pass title="" for no tooltip. */
export function RoleIcon({ role, className = 'gl', title }: { role: Role; className?: string; title?: string }) {
  return (
    <span className="ri" title={title === '' ? undefined : (title ?? ROLE_NAME[role])}>
      <AssetImg path={rolePath(role)} className={`${className} img`} fallback={<RoleGlyph role={role} className={className} />} />
    </span>
  );
}

/** Two letters for the placeholder badge: "Master Yi" → "Yi", "Udyr" → "Ud". */
export const monogram = (champ: string) => {
  const w = champ.trim().split(/\s+/);
  return w[w.length - 1].slice(0, 2);
};

/** Champion icon in a hexagon: the official square icon if supplied, else a monogram. */
export function ChampIcon({ champ, champKey, className = '' }: { champ: string; champKey: string; className?: string }) {
  return (
    <span className={`hx ${className}`} aria-hidden="true">
      <AssetImg path={champPath(champKey)} fallback={<span className="mono">{monogram(champ)}</span>} />
    </span>
  );
}
