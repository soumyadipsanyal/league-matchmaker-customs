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
}

export interface StatGame {
  game: number;
  /** "mm:ss" */
  duration: string;
  winner: 'blue' | 'red';
  blue: StatLine[];
  red: StatLine[];
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
          for (const key of ['dmg', 'vision', 'turrets'] as const) {
            const v = l?.[key];
            if (v !== undefined && v !== null && (!Number.isFinite(v) || v < 0)) errs.push(`${lt}: "${key}" must be a number or null.`);
          }
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
  };
}

function add(t: Totals, line: StatLine, team: StatLine[], won: boolean, minutes: number) {
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
          add(p.t, line, team, g.winner === side, minutes);
          p.champs.set(line.champ, (p.champs.get(line.champ) ?? 0) + 1);
          players.set(line.player, p);
          const c = champs.get(line.champ) ?? { t: emptyTotals(), players: new Map() };
          add(c.t, line, team, g.winner === side, minutes);
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
