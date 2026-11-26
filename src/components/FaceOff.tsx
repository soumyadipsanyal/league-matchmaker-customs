import { andList, fmt, plural } from '../lib/format.ts';
import { ROLES, ROLE_SHORT, ROLE_NAME } from '../lib/roles.ts';
import type { PublicPlayer } from '../lib/roster.ts';
import type { GameView, Placement, TeamsGame } from '../lib/teams.ts';
import type { Slot } from '../engine/rating.ts';
import { ChampIcon, RoleIcon } from './Icons.tsx';
import type { Adjustments } from '../lib/adjust.ts';

interface Props {
  game: TeamsGame;
  view: GameView | null;
  pub: Map<string, PublicPlayer>;
  champName: (p: Placement) => string;
  /** Tonight's adjustments the teams were made with. */
  adjust?: Adjustments;
}

type Flag = { kind: 'champ' | 'unlisted' | 'notset' | 'off'; text: string };

/** What to say under a player's name. Locked, only what the public roster shows. */
function flagFor(p: Placement, slot: Slot | null, pub: PublicPlayer | undefined, champ: string | null): Flag | null {
  if (champ) return { kind: 'champ', text: champ };
  const notSet = slot ? slot.rolesNotSet : pub ? pub.roles.length === 0 : false;
  if (notSet) return { kind: 'notset', text: 'Roles not set' };
  const unlisted = slot ? slot.unlisted : pub ? !pub.roles.includes(p.role) : false;
  if (unlisted) return { kind: 'unlisted', text: 'Not one of their roles' };
  if (slot) return slot.steps > 0 ? { kind: 'off', text: `${plural(slot.steps, 'step')} off main` } : null;
  if (pub && !pub.mains.includes(p.role)) return { kind: 'off', text: 'Off main' };
  return null;
}

function Who({ p, slot, pub, champ, side, adj }: { p: Placement; slot: Slot | null; pub?: PublicPlayer; champ: string | null; side: 'b' | 'r'; adj: number }) {
  const flag = flagFor(p, slot, pub, champ);
  return (
    <div className={`pl ${side}`}>
      <b>
        {p.name}
        {adj > 0 && (
          <span className="adjtag" title={`${adj}% lower tonight`}>
            −{adj}%
          </span>
        )}
      </b>
      {flag &&
        (flag.kind === 'champ' && p.champ ? (
          <small className="ch">
            <ChampIcon champ={flag.text} champKey={p.champ} />
            {flag.text}
          </small>
        ) : (
          <small className={flag.kind === 'off' ? 'off' : 'warn'}>{flag.text}</small>
        ))}
    </div>
  );
}

export function FaceOff({ game, view, pub, champName, adjust = {} }: Props) {
  const all = [...game.blue, ...game.red];
  const notSet = all.filter((p) => (pub.get(p.name)?.roles.length ?? 1) === 0).map((p) => p.name);
  const unlisted = all
    .filter((p, i) => {
      const s = view ? [...view.blue, ...view.red][i] : null;
      const pp = pub.get(p.name);
      return s ? s.unlisted : !p.champ && pp && pp.roles.length > 0 && !pp.roles.includes(p.role);
    })
    .map((p) => `${p.name} (${ROLE_NAME[p.role].toLowerCase()})`);

  const n = view?.numbers;
  const bluePct = n ? (n.blueTotal / (n.blueTotal + n.redTotal || 1)) * 100 : 50;

  return (
    <div className="fo-wrap">
      {n && (
        <div className="tug">
          <div className="tug-n">
            <span>
              <i className="sw" style={{ background: 'var(--blue)' }} />
              Blue<b>{fmt(n.blueTotal)}</b>
            </span>
            <span className="gap">Gap {fmt(n.teamGap)}</span>
            <span>
              <b>{fmt(n.redTotal)}</b>Red
              <i className="sw r" style={{ background: 'var(--red)' }} />
            </span>
          </div>
          <div className="tug-bar" role="img" aria-label={`Blue side ${fmt(n.blueTotal)} against red side ${fmt(n.redTotal)}`}>
            <i style={{ width: `${bluePct.toFixed(1)}%` }} />
          </div>
        </div>
      )}
      <div className={`fo${view ? '' : ' locked'}`}>
        <div className="fo-h" aria-hidden="true">
          <span className="b">Blue side</span>
          <span />
          <span className="r">Red side</span>
        </div>
        {ROLES.map((r, k) => {
          const b = game.blue[k];
          const rd = game.red[k];
          const bs = view ? view.blue[k] : null;
          const rs = view ? view.red[k] : null;
          return (
            <div className="fo-r" key={r}>
              <Who p={b} slot={bs} pub={pub.get(b.name)} champ={b.champ ? champName(b) : null} side="b" adj={adjust[b.name] ?? 0} />
              {bs && <div className="nb b">{fmt(bs.value)}</div>}
              {bs && (
                <div className="br b">
                  <i style={{ width: `${Math.min(100, bs.value * 10)}%` }} />
                </div>
              )}
              <div className="rl">
                <RoleIcon role={r} />
                <span>{ROLE_SHORT[r]}</span>
              </div>
              {rs && (
                <div className="br r">
                  <i style={{ width: `${Math.min(100, rs.value * 10)}%` }} />
                </div>
              )}
              {rs && <div className="nb r">{fmt(rs.value)}</div>}
              <Who p={rd} slot={rs} pub={pub.get(rd.name)} champ={rd.champ ? champName(rd) : null} side="r" adj={adjust[rd.name] ?? 0} />
            </div>
          );
        })}
      </div>
      {n && (
        <p className="note">
          Lane gaps: top {fmt(n.lanes.top)}, jungle {fmt(n.lanes.jg)}, mid {fmt(n.lanes.mid)}, bot {fmt(n.lanes.bot)}. Balance score{' '}
          {fmt(n.score)} (lower is fairer).
        </p>
      )}
      {notSet.length > 0 && (
        <p className="flagnote">
          {andList(notSet)} {notSet.length === 1 ? "hasn't" : "haven't"} got roles set yet, so {notSet.length === 1 ? 'counts' : 'count'} one step below
          main in any role.
        </p>
      )}
      {unlisted.length > 0 && (
        <p className="flagnote">Last resort: {andList(unlisted)} {unlisted.length === 1 ? 'is' : 'are'} in a role they don't list.</p>
      )}
      <p className="bench">{game.out.length ? `Sitting out: ${andList(game.out)}` : 'Nobody sits out this game.'}</p>
    </div>
  );
}
