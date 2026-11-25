import { useLayoutEffect, useRef, useState } from 'react';
import { BOARD, type Side } from '../board/slots.ts';
import { MAP_SVG } from '../board/map.ts';
import { assetUrl, MAP_PATH } from '../lib/assets.ts';
import { fmt, fmt1 } from '../lib/format.ts';
import { ROLES, ROLE_NAME, type Role } from '../lib/roles.ts';
import type { GameView, Placement, TeamsGame } from '../lib/teams.ts';
import { AssetImg, ChampIcon, RoleIcon } from './Icons.tsx';

const ORDER: [Side, Role][] = ROLES.flatMap((r) => [
  ['blue', r],
  ['red', r],
]);

interface Props {
  game: TeamsGame | null;
  /** Numbers, when unlocked. */
  view: GameView | null;
  /** Changes whenever the magnets should slide out again. */
  animKey: string;
  champName: (p: Placement) => string;
  label: string;
}

export function RiftBoard({ game, view, animKey, champName, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'idle' | 'home' | 'out'>('idle');
  const hasGame = Boolean(game);
  const out = phase === 'out';

  // New teams or another game: snap every magnet back to base…
  useLayoutEffect(() => {
    setPhase(hasGame ? 'home' : 'idle');
  }, [animKey, hasGame]);

  // …make the browser take in that position, then slide them out. Forcing a
  // style flush (rather than waiting for animation frames) means this also
  // works in a background tab.
  useLayoutEffect(() => {
    if (phase !== 'home') return;
    void ref.current?.offsetWidth;
    setPhase('out');
  }, [phase]);

  const mapUrl = assetUrl(MAP_PATH);

  return (
    <div ref={ref} className={`rift${out ? ' shown' : ''}`} role="img" aria-label={label}>
      {mapUrl ? (
        <AssetImg path={MAP_PATH} className="mapimg" fallback={<svg viewBox="0 0 1000 1000" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MAP_SVG }} />} />
      ) : (
        <svg viewBox="0 0 1000 1000" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MAP_SVG }} />
      )}
      <div className="mapl" aria-hidden="true">
        <span className="bl">Blue side</span>
        <span className="rd">Red side</span>
      </div>
      <div aria-hidden="true">
        {ORDER.map(([s, r]) => (
          <div key={`slot-${s}-${r}`} className={`slot ${s}`} style={{ left: `${BOARD.slots[s][r].x}%`, top: `${BOARD.slots[s][r].y}%` }}>
            <RoleIcon role={r} />
          </div>
        ))}
      </div>
      <div aria-hidden="true">
        {game &&
          ORDER.map(([s, r], i) => {
            const k = ROLES.indexOf(r);
            const p = (s === 'blue' ? game.blue : game.red)[k];
            const slot = view ? (s === 'blue' ? view.blue : view.red)[k] : null;
            const pos = out ? BOARD.slots[s][r] : BOARD.home[s];
            const cfg = BOARD.slots[s][r];
            const champ = p.champ ? champName(p) : null;
            return (
              <div
                key={`tok-${s}-${r}`}
                className={`tok ${s} l-${cfg.label} h-${cfg.badge}${out ? ' on' : ' jump'}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, transitionDelay: out ? `${i * 60}ms` : '0ms' }}
                title={`${p.name}, ${ROLE_NAME[r].toLowerCase()}${champ ? ` on ${champ}` : ''}${slot ? `: ${fmt(slot.value)}` : ''}`}
              >
                <div className="disc">
                  {slot ? <span className="n">{fmt1(slot.value)}</span> : <RoleIcon role={r} className="dgl" title="" />}
                  {p.champ && champ && <ChampIcon champ={champ} champKey={p.champ} className="badge" />}
                </div>
                <div className="lab">
                  <b>{p.name}</b>
                  {champ && <i>{champ}</i>}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
