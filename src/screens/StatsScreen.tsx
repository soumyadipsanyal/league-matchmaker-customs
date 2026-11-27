import { useMemo, useState, type ReactNode } from 'react';
import statsData from '../data/match-stats.json';
import { ChampIcon, RoleIcon } from '../components/Icons.tsx';
import { plural } from '../lib/format.ts';
import { nightLabel, shortNight } from '../lib/history.ts';
import { load, save } from '../lib/storage.ts';
import { medals, type Medal } from '../lib/medals.ts';
import { ROLES, ROLE_NAME, ROLE_SHORT, type Role } from '../lib/roles.ts';
import {
  aggregate,
  champKey,
  records,
  type ChampRow,
  type PlayerRow,
  type Rates,
  type RecordKey,
  type StatNight,
  type StatRecord,
  type StatsFile,
} from '../lib/stats.ts';

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
  { key: 'firstBloods', label: 'FB', title: 'First blood kills', value: (r) => r.firstBloods, fmt: int },
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
/** The short version: the basics only. Everything else is in the full extended version. */
const SHORT_PLAYER = new Set(['games', 'winRate', 'kda', 'avgK', 'avgD', 'avgA', 'csm', 'kp', 'dpm']);
const SHORT_CHAMP = new Set(['games', 'winRate', 'kda', 'csm', 'dpm']);

/**
 * The columns to show: the short version keeps the basics; supports drop CS
 * and turret damage; in the full version junglers gain their team's objectives.
 */
function colsFor<R extends PlayerRow | ChampRow>(cols: Col<R>[], role: Role | 'all', full: boolean, short: Set<string>): Col<R>[] {
  let out = full ? cols : cols.filter((c) => short.has(c.key));
  if (role === 'sp') out = out.filter((c) => !NOT_FOR_SUPPORT.has(c.key));
  if (role === 'jg' && full) out = [...out, ...OBJECTIVE_COLS];
  return out;
}

/** What each abbreviation means, for the key under the table. */
const LEGEND: [string, ReactNode][] = [
  ['kda', <><b>KDA</b> (kills + assists) ÷ deaths</>],
  ['csm', <><b>CSM</b> creep score per minute</>],
  ['gpm', <><b>GPM</b> gold per minute</>],
  ['kp', <><b>KP%</b> kill participation</>],
  ['dmgShare', <><b>DMG%</b> share of the team's damage to champions</>],
  ['goldShare', <><b>Gold%</b> share of the team's gold</>],
  ['dtShare', <><b>DT%</b> share of the team's damage taken</>],
  ['dpm', <><b>DPM</b> damage to champions per minute</>],
  ['turretDmg', <><b>Turret dmg</b> average damage to turrets per game</>],
  ['vspm', <><b>VSPM</b> vision score per minute</>],
  ['firstBloods', <><b>FB</b> first blood kills (the scoreboard doesn't mark assists)</>],
  [
    'quadras',
    <>
      <b>Quadras</b> and <b>Pentas</b> games where their biggest multi-kill was a quadra or penta kill (the scoreboard only shows the
      biggest, so two quadras in one game count once)
    </>,
  ],
  [
    'drakesPg',
    <>
      <b>Drakes</b>, <b>Grubs</b>, <b>Heralds</b>, <b>Barons</b> and <b>Elders</b> the objectives their team took per game (the scoreboard
      shows the team's total, not who took the last hit)
    </>,
  ],
];

function Legend({ keys, full, stars }: { keys: Set<string>; full: boolean; stars: boolean }) {
  const items = LEGEND.filter(([k]) => keys.has(k));
  return (
    <p className="note legend">
      {stars && (
        <span className="starkey">
          <Star medal={1} />
          <Star medal={2} />
          <Star medal={3} /> the top three in each stat (fewest for Avg deaths; ties share a star). Quadras and Pentas only give gold, to
          everyone tied on the most.{' '}
        </span>
      )}
      {items.map(([k, text], i) => (
        <span key={k}>
          {i > 0 && ' · '}
          {text}
        </span>
      ))}
      {items.length > 0 && '. '}
      {full
        ? "Pick a role to see only the games each player spent in it: Support leaves out CS and turret damage, and Jungle adds their team's objectives. A dash means the scoreboard didn't show it. Gold, CS and XP leads at 15 minutes aren't on the post-game scoreboard, so they aren't tracked."
        : 'Pick a role to see only the games each player spent in it. The full extended version adds gold, damage and vision shares, turret damage, first bloods, multi-kills and, for junglers, objectives.'}
    </p>
  );
}

/** How each single-game record is named and shown. */
const RECORD_INFO: Record<RecordKey, { label: string; fmt: Fmt }> = {
  kda: { label: 'Highest KDA', fmt: dec1 },
  kills: { label: 'Most kills', fmt: int },
  deaths: { label: 'Most deaths', fmt: int },
  assists: { label: 'Most assists', fmt: int },
  csm: { label: 'Highest CSM', fmt: dec1 },
  gpm: { label: 'Highest GPM', fmt: int },
  kp: { label: 'Highest KP%', fmt: pct },
  dmgShare: { label: 'Highest DMG%', fmt: pct },
  goldShare: { label: 'Highest Gold%', fmt: pct },
  dtShare: { label: 'Highest DT%', fmt: pct },
  dpm: { label: 'Highest DPM', fmt: int },
  turretDmg: { label: 'Most turret damage', fmt: thou },
  vspm: { label: 'Highest VSPM', fmt: dec2 },
  firstBlood: { label: 'First blood', fmt: int },
  quadra: { label: 'Quadra kill', fmt: int },
  penta: { label: 'Penta kill', fmt: int },
  drakes: { label: 'Most drakes', fmt: int },
  grubs: { label: 'Most void grubs', fmt: int },
  heralds: { label: 'Most heralds', fmt: int },
  barons: { label: 'Most barons', fmt: int },
  elders: { label: 'Most Elder dragons', fmt: int },
};
const OBJECTIVE_RECORDS = new Set<RecordKey>(['drakes', 'grubs', 'heralds', 'barons', 'elders']);
const NOT_FOR_SUPPORT_RECORDS = new Set<RecordKey>(['csm', 'turretDmg']);
/** Holders shown on a card before "+N more". */
const MAX_HOLDERS = 3;

function RecordCard({ r, manyNights }: { r: StatRecord; manyNights: boolean }) {
  const info = RECORD_INFO[r.key];
  const when = (date: string, game: number) => `Game ${game}${manyNights ? ` · ${shortNight(date)}` : ''}`;
  const more = r.holders.length - MAX_HOLDERS;
  return (
    <li className="rec">
      <span className="rlabel">{info.label}</span>
      {r.value === null ? (
        <span className="rnone">Not recorded yet</span>
      ) : r.value === 0 ? (
        <span className="rnone">Nobody yet</span>
      ) : r.flag ? null : (
        <span className="rval">{info.fmt(r.value)}</span>
      )}
      {r.holders.length > 0 && (
        <ul className="rholders">
          {r.holders.slice(0, MAX_HOLDERS).map((h) => (
            <li key={`${h.date}-${h.game}-${h.player}`}>
              <ChampIcon champ={h.champ} champKey={champKey(h.champ)} />
              <span>
                <b>{h.player}</b>
                <small>
                  {h.champ} · {when(h.date, h.game)}
                </small>
              </span>
            </li>
          ))}
          {more > 0 && (
            <li className="rmore" title={r.holders.slice(MAX_HOLDERS).map((h) => `${h.player} (${h.champ}, ${when(h.date, h.game)})`).join('\n')}>
              +{more} more
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/** Single-game records: the best one game for each stat, with who did it and on what. */
function Records({ nights, role }: { nights: StatNight[]; role: Role | 'all' }) {
  const recs = useMemo(() => records(nights, role === 'all' ? null : role), [nights, role]);
  const shown = recs.filter((r) => (role === 'jg' || !OBJECTIVE_RECORDS.has(r.key)) && !(role === 'sp' && NOT_FOR_SUPPORT_RECORDS.has(r.key)));
  const where = role === 'all' ? '' : ` at ${ROLE_NAME[role].toLowerCase()}`;
  return (
    <section className="records" aria-labelledby="records-h">
      <div className="rec-head">
        <h2 id="records-h">Records</h2>
        <p className="sub">
          The best single game for each stat{where}, and who did it on what. Ties all count.
          {role === 'jg' && " Objectives are their team's in that game."}
        </p>
      </div>
      <ul className="recgrid">
        {shown.map((r) => (
          <RecordCard key={r.key} r={r} manyNights={nights.length > 1} />
        ))}
      </ul>
    </section>
  );
}

/** Columns that don't get stars, and how the others are judged. */
const NO_STARS = new Set(['games', 'winRate']);
const LOWER_IS_BETTER = new Set(['avgD']);
const GOLD_ONLY = new Set(['quadras', 'pentas']);
const MEDAL_TEXT: Record<Medal, string> = { 1: 'Gold star: best in this stat', 2: 'Silver star: second best', 3: 'Bronze star: third best' };

function Star({ medal }: { medal: Medal }) {
  return (
    <svg className={`star m${medal}`} viewBox="0 0 24 24" role="img" aria-label={MEDAL_TEXT[medal]}>
      <title>{MEDAL_TEXT[medal]}</title>
      <path d="M12 2.6l2.85 5.95 6.55.8-4.83 4.5 1.24 6.5L12 17.15l-5.81 3.2 1.24-6.5L2.6 9.35l6.55-.8z" />
    </svg>
  );
}

function Champ({ name }: { name: string }) {
  return (
    <span className="schamp">
      <ChampIcon champ={name} champKey={champKey(name)} />
      <span>{name}</span>
    </span>
  );
}

function Table<R>({ rows, cols, first, firstLabel, extra, extraLabel, defaultKey, stars = false }: {
  rows: R[];
  cols: Col<R>[];
  first: (r: R) => string;
  firstLabel: string;
  extra: (r: R) => ReactNode;
  extraLabel: string;
  defaultKey: string;
  /** Gold, silver and bronze stars for the top three in each stat. */
  stars?: boolean;
}) {
  const starMap = useMemo(() => {
    const out = new Map<string, Map<string, Medal>>();
    if (!stars) return out;
    for (const c of cols) {
      if (NO_STARS.has(c.key)) continue;
      const fmt = c.fmt ?? ((v: number | null) => String(v));
      const entries = rows.map((r) => {
        const v = c.value(r);
        const value = typeof v === 'number' ? v : null;
        return { name: first(r), value, shown: fmt(value) };
      });
      out.set(c.key, medals(entries, { lowerBetter: LOWER_IS_BETTER.has(c.key), goldOnly: GOLD_ONLY.has(c.key) }));
    }
    return out;
  }, [stars, cols, rows, first]);
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
                const medal = starMap.get(c.key)?.get(first(r));
                return (
                  <td key={c.key} className="snum">
                    {typeof v === 'number' || v === null ? (c.fmt ?? String)(v as number | null) : v}
                    {medal && <Star medal={medal} />}
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
  const nights = useMemo(() => (night === 'all' ? NIGHTS : NIGHTS.filter((n) => n.date === night)), [night]);
  const data = useMemo(() => aggregate(nights, role === 'all' ? null : role), [nights, role]);
  const roleName = role === 'all' ? '' : ROLE_NAME[role].toLowerCase();
  const [full, setFull] = useState<boolean>(() => load<boolean>('stats-full') === true);
  const toggleFull = () =>
    setFull((f) => {
      save('stats-full', !f);
      return !f;
    });
  const playerCols = colsFor(PLAYER_COLS, role, full, SHORT_PLAYER);
  const champCols = colsFor(CHAMP_COLS, role, full, SHORT_CHAMP);
  const shown = new Set((view === 'players' ? playerCols : champCols).map((c) => c.key));

  return (
    <section className="band">
      <div className={full ? 'wrap wide' : 'wrap'}>
        <div className="sec-head">
          <div className="stathead">
            <h1>Stats</h1>
            {NIGHTS.length > 0 && (
              <button type="button" className="btn fullbtn" aria-pressed={full} onClick={toggleFull}>
                {full ? 'Back to the short version' : 'Click here to view full extended version'}
              </button>
            )}
          </div>
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
                key={full ? 'full' : 'short'}
                rows={data.players}
                cols={playerCols}
                first={(r) => r.player}
                firstLabel="Player"
                extraLabel="Champions"
                defaultKey="games"
                stars
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
                key={full ? 'full' : 'short'}
                rows={data.champs}
                cols={champCols}
                first={(r) => r.champ}
                firstLabel="Champion"
                extraLabel="Played by"
                defaultKey="games"
                extra={(r) => r.players.map(([p, n]) => (n > 1 ? `${p} ×${n}` : p)).join(', ')}
              />
            )}
            <Legend keys={shown} full={full} stars={view === 'players'} />
            <Records nights={nights} role={role} />
          </>
        )}
      </div>
    </section>
  );
}
