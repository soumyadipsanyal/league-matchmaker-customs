import { useState } from 'react';
import { ChampIcon, RoleIcon } from '../components/Icons.tsx';
import { roleRating, roleSteps } from '../engine/rating.ts';
import { fmt, stepsText } from '../lib/format.ts';
import { ROLES, ROLE_NAME, ROLE_SHORT, type Role } from '../lib/roles.ts';
import type { Player, PublicPlayer } from '../lib/roster.ts';

type SortKey = 'main' | 'name' | 'ot' | Role;
interface Sort {
  key: SortKey;
  desc: boolean;
}

interface Props {
  players: PublicPlayer[];
  rated: Map<string, Player> | null;
  drop: number;
}

const SORT_LABEL = (k: SortKey) => (k === 'main' ? 'main rating' : k === 'name' ? 'name' : k === 'ot' ? 'one-trick' : ROLE_NAME[k].toLowerCase());

export function RosterScreen({ players, rated, drop }: Props) {
  const unlocked = Boolean(rated);
  const [sort, setSort] = useState<Sort>({ key: 'main', desc: true });
  const key = !unlocked && (sort.key === 'main' || sort.key === 'ot') ? { key: 'name' as SortKey, desc: false } : sort;

  const ratingIn = (p: Player, r: Role): number | null => (p.steps[r] === undefined ? null : roleRating(p.rating, p.steps[r]!, drop));
  // Locked sort for a role: mains first, then players who play it, then the rest.
  const lockedRank = (p: PublicPlayer, r: Role) => (p.mains.includes(r) ? 2 : p.roles.includes(r) ? 1 : 0);

  const value = (p: PublicPlayer): number => {
    const full = rated?.get(p.name);
    if (key.key === 'name') return 0;
    if (!full) return lockedRank(p, key.key as Role);
    if (key.key === 'main') return full.rating;
    if (key.key === 'ot') return Math.max(-1, ...Object.values(full.otRating));
    return ratingIn(full, key.key) ?? -1;
  };
  const list = [...players].sort((a, b) => {
    if (key.key === 'name') return key.desc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
    const d = value(b) - value(a);
    const tie = (rated ? (rated.get(b.name)?.rating ?? 0) - (rated.get(a.name)?.rating ?? 0) : 0) || a.name.localeCompare(b.name);
    return (key.desc ? d : -d) || tie;
  });

  const click = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: k !== 'name' }));
  const ariaSort = (k: SortKey) => (key.key === k ? (key.desc ? 'descending' : 'ascending') : 'none');

  const otCell = (p: PublicPlayer) =>
    p.ot.map((o) => {
      const full = rated?.get(p.name);
      const otR = full?.otRating[o.key];
      const base = full ? roleRating(full.rating, roleSteps(full, o.role).steps, drop) : null;
      return (
        <span
          className="otb"
          key={o.key}
          title={
            full && otR !== undefined && base !== null
              ? `${p.name} on ${o.champ}: ${fmt(otR)}, against ${fmt(base)} in ${ROLE_NAME[o.role].toLowerCase()} on other champions`
              : `${p.name} one-tricks ${o.champ} (${ROLE_NAME[o.role].toLowerCase()})`
          }
        >
          <ChampIcon champ={o.champ} champKey={o.key} />
          <span>{o.champ}</span>
          {otR !== undefined && <b>{fmt(otR)}</b>}
          {otR !== undefined && base !== null && otR > base && <small>+{fmt(otR - base)}</small>}
        </span>
      );
    });

  return (
    <section className="band">
      <div className="wrap">
        <div className="sec-head">
          <h1>The roster</h1>
          <p className="sub">
            {unlocked
              ? `Outlined is each player's main role. Every step down their list of roles takes ${Math.round(drop * 100)}% off, and a dash is a role they don't play. Tap a heading to sort.`
              : 'The roles each player plays, with their main role marked, and their one-trick champions. Unlock to see ratings. Tap a heading to sort.'}
          </p>
        </div>
        <p className="sortline">
          Sorted by {SORT_LABEL(key.key)}
          {key.key === 'name' ? (key.desc ? ', Z to A' : ', A to Z') : key.desc ? ', highest first' : ', lowest first'}
          {unlocked && key.key !== 'main' && (
            <button type="button" className="linkbtn" onClick={() => setSort({ key: 'main', desc: true })}>
              Sort by main rating
            </button>
          )}
        </p>
        <div className="scroll">
          <table className={`rt${unlocked ? '' : ' locked'}`}>
            <thead>
              <tr>
                <th scope="col" aria-sort={ariaSort('name')}>
                  <button type="button" onClick={() => click('name')}>
                    Player
                  </button>
                </th>
                {ROLES.map((r) => (
                  <th scope="col" key={r} className="rc" aria-sort={ariaSort(r)}>
                    <button type="button" onClick={() => click(r)}>
                      <RoleIcon role={r} />
                      <span className="full">{ROLE_NAME[r]}</span>
                      <span className="short">{ROLE_SHORT[r]}</span>
                    </button>
                  </th>
                ))}
                <th scope="col" className="otc" aria-sort={unlocked ? ariaSort('ot') : undefined}>
                  {unlocked ? (
                    <button type="button" onClick={() => click('ot')}>
                      One-tricks
                    </button>
                  ) : (
                    <span className="thl">One-tricks</span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const full = rated?.get(p.name);
                const ots = otCell(p);
                const notSet = p.roles.length === 0;
                return (
                  <tr key={p.name}>
                    <th scope="row">
                      {p.name}
                      {ots.length > 0 && <span className="ot-in">{ots}</span>}
                    </th>
                    {notSet ? (
                      <td colSpan={5} className="tbc">
                        {full
                          ? `Rated ${fmt(full.rating)}. Roles not set yet, so ${fmt(roleRating(full.rating, 1, drop))} in any role.`
                          : 'Roles not set yet'}
                      </td>
                    ) : (
                      ROLES.map((r) => {
                        const isMain = p.mains.includes(r);
                        const plays = p.roles.includes(r);
                        if (!plays)
                          return (
                            <td key={r} className="num u" title={`${p.name} doesn't play ${ROLE_NAME[r].toLowerCase()}`}>
                              –
                            </td>
                          );
                        if (!full)
                          return (
                            <td key={r} className={`num${isMain ? ' main' : ' plays'}`} title={`${p.name}: ${isMain ? 'main role' : 'plays this role'}`}>
                              {isMain ? 'Main' : <span className="dot" aria-label="Plays" />}
                            </td>
                          );
                        const v = ratingIn(full, r) ?? 0;
                        const st = full.steps[r] ?? 0;
                        return (
                          <td
                            key={r}
                            className={`num${isMain ? ' main' : ''}`}
                            style={{ ['--h' as string]: `${Math.round(8 + v * 3.4)}%` }}
                            title={`${p.name}, ${ROLE_NAME[r].toLowerCase()}: ${fmt(v)}, ${stepsText(st)}`}
                          >
                            {fmt(v)}
                          </td>
                        );
                      })
                    )}
                    <td className="otc">{ots}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
