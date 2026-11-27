/**
 * Match stats for our customs, in the style of gol.gg's player and champion
 * tables. The data lives in src/data/match-stats.json, typed in from the
 * post-game scoreboard screenshots.
 *
 * Totals-based maths, like gol.gg: KDA = (kills + assists) / deaths over all
 * games; per-minute stats divide totals by total minutes played; shares
 * (KP%, damage %, gold %) compare the player's totals with their team's.
 */
import { isRole, type Role } from './roles.ts';

export interface StatLine {
  player: string;
  champ: string;
  role?: Role;
  k: number;
  d: number;
  a: number;
  cs: number;
  gold: number;
  /** Damage to champions, if the screenshot shows it. */
  dmg?: number | null;
  /** Vision score, if the screenshot shows it. */
  vision?: number | null;
  /** Damage to turrets, if the screenshot shows it. */
  turrets?: number | null;
  /** Damage taken, if the screenshot shows it. */
  taken?: number | null;
  /** Largest multi-kill (2 = double … 5 = penta), if the screenshot shows it. */
  multi?: number | null;
  /** Got the first blood kill (the stats tab marks the killer only). */
  firstBlood?: boolean;
}

/** A team's objectives, from the scoreboard's "Bans + objectives" icons. */
export interface TeamObjectives {
  towers: number;
  inhibitors: number;
  barons: number;
  /** Every dragon, as the scoreboard counts them (Elder included). */
  dragons: number;
  /** How many of those dragons were Elder (the scoreboard doesn't say). */
  elders: number;
  heralds: number;
  grubs: number;
}

export const OBJECTIVE_KEYS = ['towers', 'inhibitors', 'barons', 'dragons', 'elders', 'heralds', 'grubs'] as const;

export interface StatGame {
  game: number;
  /** "mm:ss" */
  duration: string;
  winner: 'blue' | 'red';
  blue: StatLine[];
  red: StatLine[];
  /** Team objectives, if typed in. */
  objectives?: { blue: TeamObjectives; red: TeamObjectives };
}

export interface StatNight {
  /** YYYY-MM-DD */
  date: string;
  games: StatGame[];
}

export interface StatsFile {
  nights: StatNight[];
}

export const minutesOf = (duration: string): number => {
  const m = /^(\d+):([0-5]\d)$/.exec(duration.trim());
  return m ? Number(m[1]) + Number(m[2]) / 60 : NaN;
};

/** Problems with the stats file, as readable messages (empty = fine). */
export function validateStats(data: unknown): string[] {
  const errs: string[] = [];
  const f = data as StatsFile;
  if (!f || typeof f !== 'object' || !Array.isArray(f.nights)) return ['The stats file needs a "nights" list.'];
  f.nights.forEach((n, i) => {
    const at = `Night ${i + 1}${n?.date ? ` (${n.date})` : ''}`;
    if (!n || !/^\d{4}-\d{2}-\d{2}$/.test(n.date ?? '')) errs.push(`${at}: "date" must look like 2026-11-26.`);
    if (!Array.isArray(n?.games)) {
      errs.push(`${at}: needs a "games" list.`);
      return;
    }
    n.games.forEach((g, j) => {
      const gt = `${at}, game ${g?.game ?? j + 1}`;
      if (!Number.isInteger(g?.game) || g.game < 1) errs.push(`${gt}: "game" must be 1, 2, 3…`);
      if (!(minutesOf(g?.duration ?? '') > 0)) errs.push(`${gt}: "duration" must look like 31:24.`);
      if (g?.winner !== 'blue' && g?.winner !== 'red') errs.push(`${gt}: "winner" must be "blue" or "red".`);
      if (g?.objectives !== undefined) {
        for (const side of ['blue', 'red'] as const) {
          const o = g.objectives?.[side];
          if (!o || typeof o !== 'object') {
            errs.push(`${gt}: objectives need "${side}".`);
            continue;
          }
          for (const key of OBJECTIVE_KEYS) {
            if (!Number.isInteger(o[key]) || o[key] < 0) errs.push(`${gt}: ${side} objectives "${key}" must be a whole number, 0 or more.`);
          }
          if (o.elders > o.dragons) errs.push(`${gt}: ${side} can't have more Elder dragons than dragons.`);
        }
      }
      const firstBloods = ['blue', 'red'].flatMap((side) => (Array.isArray(g?.[side as 'blue']) ? g[side as 'blue'] : [])).filter((l) => l?.firstBlood === true);
      if (firstBloods.length > 1) errs.push(`${gt}: only one player can have first blood.`);
      for (const side of ['blue', 'red'] as const) {
        const team = g?.[side];
        if (!Array.isArray(team) || team.length !== 5) {
          errs.push(`${gt}: ${side} needs exactly 5 players.`);
          continue;
        }
        team.forEach((l, k) => {
          const lt = `${gt}, ${side} ${k + 1}${l?.player ? ` (${l.player})` : ''}`;
          if (!l?.player || typeof l.player !== 'string') errs.push(`${lt}: needs "player".`);
          if (!l?.champ || typeof l.champ !== 'string') errs.push(`${lt}: needs "champ".`);
          if (l?.role !== undefined && !isRole(l.role)) errs.push(`${lt}: unknown role "${String(l.role)}".`);
          for (const key of ['k', 'd', 'a', 'cs', 'gold'] as const) {
            if (!Number.isFinite(l?.[key]) || l[key] < 0) errs.push(`${lt}: "${key}" must be a number, 0 or more.`);
          }
          for (const key of ['dmg', 'vision', 'turrets', 'taken'] as const) {
            const v = l?.[key];
            if (v !== undefined && v !== null && (!Number.isFinite(v) || v < 0)) errs.push(`${lt}: "${key}" must be a number or null.`);
          }
          if (l?.multi !== undefined && l.multi !== null && !(Number.isInteger(l.multi) && l.multi >= 0 && l.multi <= 5)) {
            errs.push(`${lt}: "multi" must be a whole number from 0 to 5, or null.`);
          }
          if (l?.firstBlood !== undefined && typeof l.firstBlood !== 'boolean') errs.push(`${lt}: "firstBlood" must be true or false.`);
        });
      }
    });
  });
  return errs;
}

interface Totals {
  games: number;
  wins: number;
  k: number;
  d: number;
  a: number;
  cs: number;
  gold: number;
  minutes: number;
  teamKills: number;
  teamGold: number;
  /** Only over games where damage was recorded. */
  dmg: number;
  teamDmg: number;
  dmgMinutes: number;
  vision: number;
  visionMinutes: number;
  /** Only over games where turret damage was recorded. */
  turrets: number;
  turretGames: number;
  /** Only over games where the whole team's damage taken was recorded. */
  taken: number;
  teamTaken: number;
  /** Games where first blood was recorded, and how many the player got. */
  fbGames: number;
  fb: number;
  /** Games where the largest multi-kill was recorded. */
  multiGames: number;
  quadras: number;
  pentas: number;
  /** The player's team's objectives, over games where they were typed in. */
  objGames: number;
  drakes: number;
  elders: number;
  heralds: number;
  grubs: number;
  barons: number;
}

const emptyTotals = (): Totals => ({
  games: 0,
  wins: 0,
  k: 0,
  d: 0,
  a: 0,
  cs: 0,
  gold: 0,
  minutes: 0,
  teamKills: 0,
  teamGold: 0,
  dmg: 0,
  teamDmg: 0,
  dmgMinutes: 0,
  vision: 0,
  visionMinutes: 0,
  turrets: 0,
  turretGames: 0,
  taken: 0,
  teamTaken: 0,
  fbGames: 0,
  fb: 0,
  multiGames: 0,
  quadras: 0,
  pentas: 0,
  objGames: 0,
  drakes: 0,
  elders: 0,
  heralds: 0,
  grubs: 0,
  barons: 0,
});

export interface Rates {
  games: number;
  wins: number;
  losses: number;
  /** 0–1 */
  winRate: number;
  kda: number;
  avgK: number;
  avgD: number;
  avgA: number;
  csm: number;
  gpm: number;
  /** 0–1, or null when unknown */
  kp: number | null;
  dmgShare: number | null;
  goldShare: number | null;
  dpm: number | null;
  vspm: number | null;
  /** Average damage to turrets per game. */
  turretDmg: number | null;
  /** 0–1: share of the team's damage taken. */
  dtShare: number | null;
  /** How many first blood kills they got. */
  firstBloods: number | null;
  /** Games whose largest multi-kill was a quadra / a penta. */
  quadras: number | null;
  pentas: number | null;
  /** The team's objectives per game (elemental drakes, Elder, heralds, void grubs, barons). */
  drakesPg: number | null;
  eldersPg: number | null;
  heraldsPg: number | null;
  grubsPg: number | null;
  baronsPg: number | null;
}

function rates(t: Totals): Rates {
  return {
    games: t.games,
    wins: t.wins,
    losses: t.games - t.wins,
    winRate: t.games ? t.wins / t.games : 0,
    kda: (t.k + t.a) / Math.max(1, t.d),
    avgK: t.games ? t.k / t.games : 0,
    avgD: t.games ? t.d / t.games : 0,
    avgA: t.games ? t.a / t.games : 0,
    csm: t.minutes ? t.cs / t.minutes : 0,
    gpm: t.minutes ? t.gold / t.minutes : 0,
    kp: t.teamKills ? (t.k + t.a) / t.teamKills : null,
    dmgShare: t.teamDmg ? t.dmg / t.teamDmg : null,
    goldShare: t.teamGold ? t.gold / t.teamGold : null,
    dpm: t.dmgMinutes ? t.dmg / t.dmgMinutes : null,
    vspm: t.visionMinutes ? t.vision / t.visionMinutes : null,
    turretDmg: t.turretGames ? t.turrets / t.turretGames : null,
    dtShare: t.teamTaken ? t.taken / t.teamTaken : null,
    firstBloods: t.fbGames ? t.fb : null,
    quadras: t.multiGames ? t.quadras : null,
    pentas: t.multiGames ? t.pentas : null,
    drakesPg: t.objGames ? t.drakes / t.objGames : null,
    eldersPg: t.objGames ? t.elders / t.objGames : null,
    heraldsPg: t.objGames ? t.heralds / t.objGames : null,
    grubsPg: t.objGames ? t.grubs / t.objGames : null,
    baronsPg: t.objGames ? t.barons / t.objGames : null,
  };
}

function add(t: Totals, line: StatLine, team: StatLine[], won: boolean, minutes: number, obj?: TeamObjectives) {
  t.games++;
  if (won) t.wins++;
  t.k += line.k;
  t.d += line.d;
  t.a += line.a;
  t.cs += line.cs;
  t.gold += line.gold;
  t.minutes += minutes;
  t.teamKills += team.reduce((s, l) => s + l.k, 0);
  t.teamGold += team.reduce((s, l) => s + l.gold, 0);
  if (typeof line.dmg === 'number' && team.every((l) => typeof l.dmg === 'number')) {
    t.dmg += line.dmg;
    t.teamDmg += team.reduce((s, l) => s + (l.dmg as number), 0);
    t.dmgMinutes += minutes;
  }
  if (typeof line.vision === 'number') {
    t.vision += line.vision;
    t.visionMinutes += minutes;
  }
  if (typeof line.turrets === 'number') {
    t.turrets += line.turrets;
    t.turretGames++;
  }
  if (typeof line.taken === 'number' && team.every((l) => typeof l.taken === 'number')) {
    t.taken += line.taken;
    t.teamTaken += team.reduce((s, l) => s + (l.taken as number), 0);
  }
  if (typeof line.firstBlood === 'boolean') {
    t.fbGames++;
    if (line.firstBlood) t.fb++;
  }
  if (typeof line.multi === 'number') {
    t.multiGames++;
    if (line.multi === 4) t.quadras++;
    if (line.multi >= 5) t.pentas++;
  }
  if (obj) {
    t.objGames++;
    t.drakes += obj.dragons - obj.elders;
    t.elders += obj.elders;
    t.heralds += obj.heralds;
    t.grubs += obj.grubs;
    t.barons += obj.barons;
  }
}

export interface PlayerRow extends Rates {
  player: string;
  /** Champions played, most first: [champion, games]. */
  champs: [string, number][];
}

export interface ChampRow extends Rates {
  champ: string;
  /** Players who picked it, most first. */
  players: [string, number][];
}

const countDesc = (m: Map<string, number>): [string, number][] => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

/**
 * Per-player and per-champion rows for the given nights. With a role, only
 * the games each player spent in that role count (shares such as KP% still
 * compare with their whole team in those games).
 */
export function aggregate(nights: StatNight[], role: Role | null = null): { players: PlayerRow[]; champs: ChampRow[]; games: number } {
  const players = new Map<string, { t: Totals; champs: Map<string, number> }>();
  const champs = new Map<string, { t: Totals; players: Map<string, number> }>();
  let games = 0;
  for (const n of nights) {
    for (const g of n.games) {
      games++;
      const minutes = minutesOf(g.duration);
      for (const side of ['blue', 'red'] as const) {
        const team = g[side];
        for (const line of team) {
          if (role && line.role !== role) continue;
          const p = players.get(line.player) ?? { t: emptyTotals(), champs: new Map() };
          add(p.t, line, team, g.winner === side, minutes, g.objectives?.[side]);
          p.champs.set(line.champ, (p.champs.get(line.champ) ?? 0) + 1);
          players.set(line.player, p);
          const c = champs.get(line.champ) ?? { t: emptyTotals(), players: new Map() };
          add(c.t, line, team, g.winner === side, minutes, g.objectives?.[side]);
          c.players.set(line.player, (c.players.get(line.player) ?? 0) + 1);
          champs.set(line.champ, c);
        }
      }
    }
  }
  return {
    games,
    players: [...players].map(([player, v]) => ({ player, champs: countDesc(v.champs), ...rates(v.t) })),
    champs: [...champs].map(([champ, v]) => ({ champ, players: countDesc(v.players), ...rates(v.t) })),
  };
}

// ---------- single-game records ----------

/** One player's line in one game, with what's needed to work out shares and rates. */
interface LineInGame {
  line: StatLine;
  team: StatLine[];
  minutes: number;
  obj?: TeamObjectives;
}

const teamShare = (c: LineInGame, key: 'dmg' | 'taken'): number | null => {
  const v = c.line[key];
  if (typeof v !== 'number' || !c.team.every((l) => typeof l[key] === 'number')) return null;
  const total = c.team.reduce((s, l) => s + (l[key] as number), 0);
  return total ? v / total : null;
};
const perMinute = (v: number | null | undefined, minutes: number): number | null => (typeof v === 'number' && minutes > 0 ? v / minutes : null);

/**
 * Every stat that has a single-game record. "flag" stats (first blood, quadra,
 * penta) either happened in a game or didn't, so their record lists everyone
 * who has done it.
 */
export const RECORD_STATS = [
  { key: 'kda', value: (c: LineInGame) => (c.line.k + c.line.a) / Math.max(1, c.line.d) },
  { key: 'kills', value: (c: LineInGame) => c.line.k },
  { key: 'deaths', value: (c: LineInGame) => c.line.d },
  { key: 'assists', value: (c: LineInGame) => c.line.a },
  { key: 'csm', value: (c: LineInGame) => perMinute(c.line.cs, c.minutes) },
  { key: 'gpm', value: (c: LineInGame) => perMinute(c.line.gold, c.minutes) },
  {
    key: 'kp',
    value: (c: LineInGame) => {
      const kills = c.team.reduce((s, l) => s + l.k, 0);
      return kills ? (c.line.k + c.line.a) / kills : null;
    },
  },
  { key: 'dmgShare', value: (c: LineInGame) => teamShare(c, 'dmg') },
  {
    key: 'goldShare',
    value: (c: LineInGame) => {
      const gold = c.team.reduce((s, l) => s + l.gold, 0);
      return gold ? c.line.gold / gold : null;
    },
  },
  { key: 'dtShare', value: (c: LineInGame) => teamShare(c, 'taken') },
  { key: 'dpm', value: (c: LineInGame) => perMinute(c.line.dmg, c.minutes) },
  { key: 'turretDmg', value: (c: LineInGame) => (typeof c.line.turrets === 'number' ? c.line.turrets : null) },
  { key: 'vspm', value: (c: LineInGame) => perMinute(c.line.vision, c.minutes) },
  { key: 'firstBlood', flag: true, value: (c: LineInGame) => (typeof c.line.firstBlood === 'boolean' ? Number(c.line.firstBlood) : null) },
  { key: 'quadra', flag: true, value: (c: LineInGame) => (typeof c.line.multi === 'number' ? Number(c.line.multi === 4) : null) },
  { key: 'penta', flag: true, value: (c: LineInGame) => (typeof c.line.multi === 'number' ? Number(c.line.multi >= 5) : null) },
  // The player's team's objectives in that game (shown for junglers).
  { key: 'drakes', value: (c: LineInGame) => (c.obj ? c.obj.dragons - c.obj.elders : null) },
  { key: 'grubs', value: (c: LineInGame) => (c.obj ? c.obj.grubs : null) },
  { key: 'heralds', value: (c: LineInGame) => (c.obj ? c.obj.heralds : null) },
  { key: 'barons', value: (c: LineInGame) => (c.obj ? c.obj.barons : null) },
  { key: 'elders', value: (c: LineInGame) => (c.obj ? c.obj.elders : null) },
] as const satisfies readonly { key: string; flag?: boolean; value: (c: LineInGame) => number | null }[];

export type RecordKey = (typeof RECORD_STATS)[number]['key'];

export interface RecordHolder {
  player: string;
  champ: string;
  /** YYYY-MM-DD of the night. */
  date: string;
  game: number;
}

export interface StatRecord {
  key: RecordKey;
  /** True for stats that either happened in a game or didn't (first blood, quadra, penta). */
  flag: boolean;
  /** The best single-game value; null when no game recorded it, 0 when nobody has done it yet. */
  value: number | null;
  /** Everyone who reached it (all of them when tied), oldest first. */
  holders: RecordHolder[];
}

/** The best single game for each stat, over the given nights (and role, if given). */
export function records(nights: StatNight[], role: Role | null = null): StatRecord[] {
  const lines: (LineInGame & { date: string; game: number })[] = [];
  for (const n of [...nights].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const g of [...n.games].sort((a, b) => a.game - b.game)) {
      const minutes = minutesOf(g.duration);
      for (const side of ['blue', 'red'] as const) {
        for (const line of g[side]) {
          if (role && line.role !== role) continue;
          lines.push({ line, team: g[side], minutes, obj: g.objectives?.[side], date: n.date, game: g.game });
        }
      }
    }
  }
  return RECORD_STATS.map((stat) => {
    const flag = 'flag' in stat && stat.flag === true;
    let best: number | null = null;
    let holders: RecordHolder[] = [];
    for (const c of lines) {
      const v = stat.value(c);
      if (v === null || !Number.isFinite(v)) continue;
      const holder = { player: c.line.player, champ: c.line.champ, date: c.date, game: c.game };
      if (best === null || v > best + 1e-9) {
        best = v;
        holders = [holder];
      } else if (Math.abs(v - best) <= 1e-9) {
        holders.push(holder);
      }
    }
    // A best of 0 (no pentas, no Elder dragons yet) isn't a record anyone holds.
    if (best === 0) holders = [];
    return { key: stat.key, flag, value: best, holders };
  });
}

/** Data Dragon file key for a champion's display name ("Kai'Sa" → "Kaisa"). */
const KEY_EXCEPTIONS: Record<string, string> = {
  wukong: 'MonkeyKing',
  'nunu & willump': 'Nunu',
  'renata glasc': 'Renata',
  "cho'gath": 'Chogath',
  "kai'sa": 'Kaisa',
  "kha'zix": 'Khazix',
  "vel'koz": 'Velkoz',
  "bel'veth": 'Belveth',
  "k'sante": 'KSante',
  leblanc: 'Leblanc',
};
export function champKey(name: string): string {
  const k = KEY_EXCEPTIONS[name.trim().toLowerCase()];
  if (k) return k;
  return name
    .split(/[\s'.&]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
}
