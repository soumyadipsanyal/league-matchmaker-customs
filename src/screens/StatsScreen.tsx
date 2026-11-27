import { useMemo, useState, type ReactNode } from 'react';
import statsData from '../data/match-stats.json';
import { ChampIcon, RoleIcon } from '../components/Icons.tsx';
import { plural } from '../lib/format.ts';
import { nightLabel } from '../lib/history.ts';
import { ROLES, ROLE_NAME, ROLE_SHORT, type Role } from '../lib/roles.ts';
import { aggregate, champKey, type ChampRow, type PlayerRow, type Rates, type StatsFile } from '../lib/stats.ts';

const STATS = statsData as StatsFile;
const NIGHTS = [...STATS.nights].sort((a, b) => b.date.localeCompare(a.date));

type View = 'players' | 'champs';
type Fmt = (v: number | null) => string;
const pct: Fmt = (v) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const dec1: Fmt = (v) => (v === null ? '–' : v.toFixed(1));
const dec2: Fmt = (v) => (v === null ? '–' : v.toFixed(2));
const int: Fmt = (v) => (v === null ? '–' : String(Math.round(v)));
const thou: Fmt = (v) => (v === null ? '–' : Math.round(v).toLocaleString('en-GB'));

interface Col<R> {
  key: string;
  label: string;
  title: string;
  value: (r: R) => number | string | null;
  fmt?: Fmt;
}

const PLAYER_COLS: Col<PlayerRow>[] = [
  { key: 'games', label: 'Games', title: 'Games played', value: (r) => r.games, fmt: int },
  { key: 'winRate', label: 'Win rate', title: 'Share of games won', value: (r) => r.winRate, fmt: pct },
  { key: 'kda', label: 'KDA', title: '(Kills + assists) ÷ deaths, over all games', value: (r) => r.kda, fmt: dec1 },
  { key: 'avgK', label: 'Avg kills', title: 'Kills per game', value: (r) => r.avgK, fmt: dec1 },
  { key: 'avgD', label: 'Avg deaths', title: 'Deaths per game', value: (r) => r.avgD, fmt: dec1 },
  { key: 'avgA', label: 'Avg assists', title: 'Assists per game', value: (r) => r.avgA, fmt: dec1 },
  { key: 'csm', label: 'CSM', title: 'Creep score per minute', value: (r) => r.csm, fmt: dec1 },
  { key: 'gpm', label: 'GPM', title: 'Gold per minute', value: (r) => r.gpm, fmt: int },
  { key: 'kp', label: 'KP%', title: "Kill participation: kills + assists as a share of the team's kills", value: (r) => r.kp, fmt: pct },
  { key: 'dmgShare', label: 'DMG%', title: "Share of the team's damage to champions", value: (r) => r.dmgShare, fmt: pct },
  { key: 'goldShare', label: 'Gold%', title: "Share of the team's gold", value: (r) => r.goldShare, fmt: pct },
  { key: 'dtShare', label: 'DT%', title: "Share of the team's damage taken", value: (r) => r.dtShare, fmt: pct },
  { key: 'dpm', label: 'DPM', title: 'Damage to champions per minute', value: (r) => r.dpm, fmt: int },
  { key: 'turretDmg', label: 'Turret dmg', title: 'Average damage to turrets per game', value: (r) => r.turretDmg, fmt: thou },
  { key: 'vspm', label: 'VSPM', title: 'Vision score per minute', value: (r) => r.vspm, fmt: dec2 },
  { key: 'fbRate', label: 'FB%', title: 'Share of games where they got the first blood kill', value: (r) => r.fbRate, fmt: pct },
  { key: 'quadras', label: 'Quadras', title: 'Games where their biggest multi-kill was a quadra kill', value: (r) => r.quadras, fmt: int },
  { key: 'pentas', label: 'Pentas', title: 'Games where they got a penta kill', value: (r) => r.pentas, fmt: int },
];

const CHAMP_COLS: Col<ChampRow>[] = [
  { key: 'games', label: 'Picks', title: 'Times picked', value: (r) => r.games, fmt: int },
  { key: 'wins', label: 'Wins', title: 'Games won', value: (r) => r.wins, fmt: int },
  { key: 'losses', label: 'Losses', title: 'Games lost', value: (r) => r.losses, fmt: int },
  { key: 'winRate', label: 'Win rate', title: 'Share of games won', value: (r) => r.winRate, fmt: pct },
  { key: 'kda', label: 'KDA', title: '(Kills + assists) ÷ deaths, over all games', value: (r) => r.kda, fmt: dec1 },
  { key: 'csm', label: 'CSM', title: 'Creep score per minute', value: (r) => r.csm, fmt: dec1 },
  { key: 'gpm', label: 'GPM', title: 'Gold per minute', value: (r) => r.gpm, fmt: int },
  { key: 'dpm', label: 'DPM', title: 'Damage to champions per minute', value: (r) => r.dpm, fmt: int },
  { key: 'turretDmg', label: 'Turret dmg', title: 'Average damage to turrets per game', value: (r) => r.turretDmg, fmt: thou },
];

/** The jungler's team's objectives, per game: only shown when Jungle is picked. */
const OBJECTIVE_COLS: Col<Rates>[] = [
  { key: 'drakesPg', label: 'Drakes', title: 'Elemental drakes their team took per game (Elder not included)', value: (r) => r.drakesPg, fmt: dec1 },
  { key: 'grubsPg', label: 'Grubs', title: 'Void grubs their team took per game', value: (r) => r.grubsPg, fmt: dec1 },
  { key: 'heraldsPg', label: 'Heralds', title: 'Rift Heralds their team took per game', value: (r) => r.heraldsPg, fmt: dec1 },
  { key: 'baronsPg', label: 'Barons', title: 'Barons their team took per game', value: (r) => r.baronsPg, fmt: dec1 },
  { key: 'eldersPg', label: 'Elders', title: 'Elder dragons their team took per game', value: (r) => r.eldersPg, fmt: dec1 },
];
/** Not meaningful for supports. */
const NOT_FOR_SUPPORT = new Set(['csm', 'turretDmg']);

/** The columns for a role: supports drop CS and turret damage, junglers gain their team's objectives. */
function colsFor<R extends PlayerRow | ChampRow>(cols: Col<R>[], role: Role | 'all'): Col<R>[] {
  if (role === 'sp') return cols.filter((c) => !NOT_FOR_SUPPORT.has(c.key));
  if (role === 'jg') return [...cols, ...OBJECTIVE_COLS];
  return cols;
}

function Champ({ name }: { name: string }) {
  return (
    <span className="schamp">
      <ChampIcon champ={name} champKey={champKey(name)} />
      <span>{name}</span>
    </span>
  );
}

function Table<R>({ rows, cols, first, firstLabel, extra, extraLabel, defaultKey }: {
  rows: R[];
  cols: Col<R>[];
  first: (r: R) => string;
  firstLabel: string;
  extra: (r: R) => ReactNode;
  extraLabel: string;
  defaultKey: string;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: defaultKey, desc: true });
  const col = cols.find((c) => c.key === sort.key);
  const sorted = [...rows].sort((a, b) => {
    if (sort.key === 'name') return sort.desc ? first(b).localeCompare(first(a)) : first(a).localeCompare(first(b));
    const va = col?.value(a) ?? null;
    const vb = col?.value(b) ?? null;
    const na = typeof va === 'number' ? va : -Infinity;
    const nb = typeof vb === 'number' ? vb : -Infinity;
    return (sort.desc ? nb - na : na - nb) || first(a).localeCompare(first(b));
  });
  const click = (key: string) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }));
  const aria = (key: string) => (sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none');
  return (
    <div className="scroll sscroll">
      <table className="rt st">
        <thead>
          <tr>
            <th scope="col" className="sticky" aria-sort={aria('name')}>
              <button type="button" onClick={() => click('name')}>
                {firstLabel}
              </button>
            </th>
            {cols.map((c) => (
              <th scope="col" key={c.key} aria-sort={aria(c.key)} title={c.title}>
                <button type="button" onClick={() => click(c.key)}>
                  {c.label}
                </button>
              </th>
            ))}
            <th scope="col" className="xcol">
              <span className="thl">{extraLabel}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={first(r)}>
              <th scope="row" className="sticky">
                {firstLabel === 'Champion' ? <Champ name={first(r)} /> : first(r)}
              </th>
              {cols.map((c) => {
                const v = c.value(r);
                return (
                  <td key={c.key} className="snum">
                    {typeof v === 'number' || v === null ? (c.fmt ?? String)(v as number | null) : v}
                  </td>
                );
              })}
              <td className="xcol">{extra(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatsScreen() {
  const [view, setView] = useState<View>('players');
  const [night, setNight] = useState<string>('all');
  const [role, setRole] = useState<Role | 'all'>('all');
  const data = useMemo(
    () => aggregate(night === 'all' ? NIGHTS : NIGHTS.filter((n) => n.date === night), role === 'all' ? null : role),
    [night, role],
  );
  const roleName = role === 'all' ? '' : ROLE_NAME[role].toLowerCase();

  return (
    <section className="band">
      <div className="wrap">
        <div className="sec-head">
          <h1>Stats</h1>
          <p className="sub">
            Our Thursday customs, gol.gg style: totals across every recorded game, from the post-game scoreboards. Tap a heading to sort.
          </p>
        </div>
        {data.games === 0 && NIGHTS.length === 0 ? (
          <div className="card">
            <h2>No games recorded yet</h2>
            <p className="sub">Once a night's scoreboards are typed in, every player's and champion's numbers show up here.</p>
          </div>
        ) : (
          <>
            <div className="statbar">
              <div className="tabs" role="group" aria-label="Show stats for">
                <button type="button" className="tab" aria-pressed={view === 'players'} onClick={() => setView('players')}>
                  Players
                </button>
                <button type="button" className="tab" aria-pressed={view === 'champs'} onClick={() => setView('champs')}>
                  Champions
                </button>
              </div>
              <label className="pick">
                <span>Nights</span>
                <select value={night} onChange={(e) => setNight(e.target.value)}>
                  <option value="all">All nights ({plural(NIGHTS.length, 'night')})</option>
                  {NIGHTS.map((n) => (
                    <option key={n.date} value={n.date}>
                      {nightLabel(n.date)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="pill">{plural(data.games, 'game')}</span>
            </div>
            <div className="statbar">
              <div className="tabs roletabs" role="group" aria-label="Role">
                <button type="button" className="tab" aria-pressed={role === 'all'} onClick={() => setRole('all')}>
                  All roles
                </button>
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="tab rtab"
                    aria-pressed={role === r}
                    aria-label={ROLE_NAME[r]}
                    title={`Only games played as ${ROLE_NAME[r].toLowerCase()}`}
                    onClick={() => setRole(r)}
                  >
                    <RoleIcon role={r} title="" />
                    <span className="rtname">{ROLE_SHORT[r]}</span>
                  </button>
                ))}
              </div>
              {role !== 'all' && (
                <p className="note rolenote">
                  Only the games each player spent at {roleName}. KP%, DMG% and Gold% still compare with their whole team.
                </p>
              )}
            </div>
            {view === 'players' && data.players.length === 0 ? (
              <p className="note">Nobody has played {roleName} in these games yet.</p>
            ) : view === 'champs' && data.champs.length === 0 ? (
              <p className="note">No champions played at {roleName} in these games yet.</p>
            ) : view === 'players' ? (
              <Table
                rows={data.players}
                cols={colsFor(PLAYER_COLS, role)}
                first={(r) => r.player}
                firstLabel="Player"
                extraLabel="Champions"
                defaultKey="games"
                extra={(r) => (
                  <span className="champlist">
                    {r.champs.slice(0, 3).map(([c, n]) => (
                      <span key={c} className="champchip" title={`${c}: ${plural(n, 'game')}`}>
                        <ChampIcon champ={c} champKey={champKey(c)} />
                        {n > 1 && <small>×{n}</small>}
                      </span>
                    ))}
                    {r.champs.length > 3 && <small className="more">+{r.champs.length - 3}</small>}
                  </span>
                )}
              />
            ) : (
              <Table
                rows={data.champs}
                cols={colsFor(CHAMP_COLS, role)}
                first={(r) => r.champ}
                firstLabel="Champion"
                extraLabel="Played by"
                defaultKey="games"
                extra={(r) => r.players.map(([p, n]) => (n > 1 ? `${p} ×${n}` : p)).join(', ')}
              />
            )}
            <p className="note legend">
              <b>KDA</b> (kills + assists) ÷ deaths · <b>CSM</b> creep score per minute · <b>GPM</b> gold per minute · <b>KP%</b> kill participation ·{' '}
              <b>DMG%</b> share of the team's damage to champions · <b>Gold%</b> share of the team's gold · <b>DPM</b> damage per minute ·{' '}
              <b>DT%</b> share of the team's damage taken · <b>Turret dmg</b> average damage to turrets per game · <b>VSPM</b> vision score per
              minute · <b>FB%</b> share of games where they got the first blood kill (the scoreboard doesn't mark assists) · <b>Quadras</b> and{' '}
              <b>Pentas</b> games where their biggest multi-kill was a quadra or penta kill (the scoreboard only shows the biggest, so two
              quadras in one game count once). Pick a role to see only the games each
              player spent in it: Support leaves out CS and turret damage, and Jungle adds the objectives their team took per game (drakes,
              void grubs, heralds, barons and Elder dragons; the scoreboard shows the team's total, not who took the last hit). A dash means the scoreboard didn't show it. Gold diff at 15, first blood and other timeline stats
              aren't on the post-game scoreboard, so they aren't tracked.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
